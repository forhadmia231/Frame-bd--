import "server-only";
import {
  createHmac,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import path from "node:path";
import { getDb } from "@/lib/db";
import { getAuth } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { ApiError } from "@/lib/api";
import {
  checkContentAccess,
  activePremium,
} from "@/modules/subscriptions/access";
import { publishedWhere } from "@/modules/catalog/service";
import { storage, readSubtitleStorage } from "./storage";
const cookieName = "frame_bd_viewer";
function key() {
  const explicit = process.env.PLAYBACK_SIGNING_SECRET;
  if (explicit && explicit.length < 32)
    throw new ApiError(
      503,
      "SIGNING_CONFIG",
      "Playback signing secret must contain at least 32 characters.",
    );
  return (
    explicit ||
    createHmac("sha256", getEnv().BETTER_AUTH_SECRET)
      .update("frame-bd-playback-cookie-v1")
      .digest("hex")
  );
}
function signature(value: string) {
  return createHmac("sha256", key()).update(value).digest("base64url");
}
function binding(request: Request) {
  const value = request.headers
    .get("cookie")
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(cookieName + "="))
    ?.slice(cookieName.length + 1);
  if (!value || !/^[-\w]{40,50}\.[-\w]{43}$/.test(value)) return null;
  const [token, mac] = value.split(".");
  const expected = signature(token);
  if (
    mac.length !== expected.length ||
    !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))
  )
    return null;
  return value;
}
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export async function createPlayback(
  request: Request,
  input: { slug: string; episodeKey?: string; sessionId?: string },
) {
  const auth = await getAuth().api.getSession({ headers: request.headers });
  if (auth) {
    const user = await getDb().user.findUnique({
      where: { id: auth.user.id },
      select: { suspendedAt: true, emailVerified: true },
    });
    if (!user || user.suspendedAt || !user.emailVerified)
      throw new ApiError(
        403,
        "ACCOUNT_UNAVAILABLE",
        "This account cannot start playback.",
      );
  }
  const title = await checkContentAccess(
    input.slug,
    auth?.user.id,
    input.episodeKey,
  );
  let episodeId: string | null = null;
  if (title.seasons) {
    const match = input.episodeKey?.match(/^s(\d+)e(\d+)$/);
    if (!match)
      throw new ApiError(400, "EPISODE_REQUIRED", "Choose an episode.");
    const episode = await getDb().episode.findFirst({
      where: {
        number: Number(match[2]),
        season: { contentId: title.id, number: Number(match[1]) },
        status: "PUBLISHED",
      },
      select: { id: true },
    });
    if (!episode)
      throw new ApiError(
        404,
        "EPISODE_UNAVAILABLE",
        "This episode is unavailable.",
      );
    episodeId = episode.id;
  }
  const asset = await getDb().contentAsset.findFirst({
    where: {
      contentId: title.id,
      episodeId,
      kind: "HLS",
      ready: true,
      videoJob: { is: { status: "READY" } },
    },
    orderBy: { createdAt: "desc" },
    include: { videoJob: true },
  });
  if (!asset?.videoJob?.duration)
    throw new ApiError(
      409,
      "VIDEO_NOT_READY",
      "No processed authorized video is ready for this title. Check processing status in administration.",
    );
  let viewer = binding(request),
    setCookie: string | undefined;
  if (!viewer) {
    const token = randomBytes(32).toString("base64url");
    viewer = token + "." + signature(token);
    setCookie = `${cookieName}=${viewer}; Path=/api/stream; HttpOnly; SameSite=Lax; Max-Age=86400${getEnv().BETTER_AUTH_URL.startsWith("https:") ? "; Secure" : ""}`;
  }
  let session;
  if (input.sessionId) {
    const old = await authorizePlayback(request, input.sessionId);
    if (old.asset.id !== asset.id || old.userId !== (auth?.user.id || null))
      throw new ApiError(
        403,
        "PLAYBACK_SESSION_MISMATCH",
        "Start a new playback session.",
      );
    const expiresAt = new Date(
      Math.min(Date.now() + 600000, old.createdAt.getTime() + 8 * 3600000),
    );
    if (expiresAt.getTime() <= Date.now())
      throw new ApiError(
        401,
        "PLAYBACK_EXPIRED",
        "Start a new playback session.",
      );
    session = await getDb().playbackSession.update({
      where: { id: old.id },
      data: { expiresAt },
    });
  } else
    session = await getDb().playbackSession.create({
      data: {
        assetId: asset.id,
        userId: auth?.user.id || null,
        authSessionId: auth?.session.id || null,
        viewerHash: hash(viewer),
        expiresAt: new Date(Date.now() + 600000),
      },
    });
  const subtitles = await getDb().subtitle.findMany({
    where: {
      contentId: title.id,
      privateStorageKey: { not: null },
      OR: [{ episodeId: null }, ...(episodeId ? [{ episodeId }] : [])],
    },
    select: { id: true, language: true },
  });
  const previous = auth
    ? await getDb().watchProgress.findUnique({
        where: {
          userId_contentId_episodeKey: {
            userId: auth.user.id,
            contentId: title.id!,
            episodeKey: input.episodeKey || "",
          },
        },
        select: { position: true, completed: true },
      })
    : null;
  return {
    setCookie,
    data: {
      id: session.id,
      url: `/api/stream/${session.id}/files/master.m3u8`,
      expiresAt: session.expiresAt.toISOString(),
      duration: asset.videoJob.duration,
      resolutions: asset.videoJob.resolutions,
      signedIn: !!auth,
      resumePosition:
        previous && !previous.completed
          ? Math.min(previous.position, asset.videoJob.duration - 1)
          : 0,
      subtitles: subtitles.map((s) => ({
        id: s.id,
        language: s.language,
        url: `/api/stream/${session.id}/subtitles/${s.id}`,
      })),
    },
  };
}
export async function authorizePlayback(request: Request, id: string) {
  if (request.headers.get("sec-fetch-site") === "cross-site")
    throw new ApiError(
      403,
      "INVALID_ORIGIN",
      "Playback is restricted to this site.",
    );
  const viewer = binding(request);
  if (!viewer)
    throw new ApiError(
      401,
      "PLAYBACK_COOKIE_REQUIRED",
      "Start playback from Frame BD to create a viewing session.",
    );
  const session = await getDb().playbackSession.findFirst({
    where: {
      id,
      expiresAt: { gt: new Date() },
      viewerHash: hash(viewer),
      asset: {
        ready: true,
        kind: "HLS",
        videoJob: { is: { status: "READY" } },
        content: publishedWhere(),
        OR: [{ episodeId: null }, { episode: { is: { status: "PUBLISHED" } } }],
      },
    },
    include: {
      asset: {
        include: {
          content: { select: { access: true } },
          episode: { select: { access: true } },
          videoJob: {
            include: { sourceMedia: { select: { provider: true } } },
          },
        },
      },
      authSession: {
        include: {
          user: { select: { suspendedAt: true, emailVerified: true } },
        },
      },
    },
  });
  if (!session)
    throw new ApiError(
      403,
      "PLAYBACK_UNAVAILABLE",
      "Playback expired or this asset is no longer available.",
    );
  if (session.userId) {
    const current = await getAuth().api.getSession({
      headers: request.headers,
    });
    if (
      !current ||
      current.session.id !== session.authSessionId ||
      current.user.id !== session.userId ||
      !session.authSession ||
      session.authSession.expiresAt <= new Date() ||
      session.authSession.user.suspendedAt ||
      !session.authSession.user.emailVerified
    )
      throw new ApiError(
        401,
        "PLAYBACK_AUTH_EXPIRED",
        "Sign in again to continue playback.",
      );
  }
  if (
    session.asset.content.access === "PREMIUM" ||
    session.asset.episode?.access === "PREMIUM"
  ) {
    if (!session.userId || !(await activePremium(session.userId)))
      throw new ApiError(
        403,
        "PREMIUM_REQUIRED",
        "An active verified premium membership is required.",
      );
  }
  return session;
}
const permittedFile =
  /^(master\.m3u8|preview\.jpg|(?:\d{2,4}p|audio_\d{1,2})\/(?:index\.m3u8|seg_\d{6}\.ts))$/;
export async function streamFile(request: Request, id: string, file: string) {
  if (!permittedFile.test(file))
    throw new ApiError(404, "NOT_FOUND", "Unknown stream file.");
  const session = await authorizePlayback(request, id);
  const job = session.asset.videoJob!;
  if (!job.outputPrefix)
    throw new ApiError(409, "VIDEO_NOT_READY", "Processing is incomplete.");
  const bytes = await storage(job.sourceMedia.provider).read(
    `${job.outputPrefix}/${file}`,
  );
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  };
  if (file.endsWith(".m3u8")) {
    const base = path.posix.dirname(file);
    const rewrite = (relative: string) => {
      const normalized = path.posix.join(base === "." ? "" : base, relative);
      if (
        relative.startsWith("/") ||
        relative.includes("..") ||
        relative.includes(":") ||
        !permittedFile.test(normalized)
      )
        throw new ApiError(
          503,
          "INVALID_PLAYLIST",
          "This stream requires reprocessing.",
        );
      return `/api/stream/${id}/files/${normalized}`;
    };
    const playlist = bytes
      .toString("utf8")
      .split("\n")
      .map((line) =>
        line.startsWith("#")
          ? line.replace(
              /URI="([^"]+)"/g,
              (_, uri: string) => `URI="${rewrite(uri)}"`,
            )
          : line.trim()
            ? rewrite(line.trim())
            : line,
      )
      .join("\n");
    return new Response(playlist, {
      headers: { ...headers, "Content-Type": "application/vnd.apple.mpegurl" },
    });
  }
  return new Response(bytes, {
    headers: {
      ...headers,
      "Content-Type": file.endsWith(".jpg") ? "image/jpeg" : "video/mp2t",
      "Content-Length": String(bytes.length),
    },
  });
}
export async function streamSubtitle(
  request: Request,
  id: string,
  subtitleId: string,
) {
  const session = await authorizePlayback(request, id);
  const subtitle = await getDb().subtitle.findFirst({
    where: {
      id: subtitleId,
      contentId: session.asset.contentId,
      OR: [{ episodeId: null }, { episodeId: session.asset.episodeId }],
    },
  });
  if (!subtitle?.privateStorageKey)
    throw new ApiError(404, "NOT_FOUND", "Subtitle is unavailable.");
  const media = await getDb().mediaUpload.findFirst({
    where: {
      storageKey: subtitle.privateStorageKey,
      kind: "SUBTITLE",
      status: "READY",
    },
    select: { provider: true },
  });
  if (!media) throw new ApiError(404, "NOT_FOUND", "Subtitle is unavailable.");
  return new Response(
    await readSubtitleStorage(subtitle.privateStorageKey, media.provider),
    {
      headers: {
        "Content-Type": "text/vtt; charset=utf-8",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
