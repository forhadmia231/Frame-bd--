import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { getDb } from "../src/lib/db";
import { generateOwnedSample } from "../scripts/media-fixture";
import { storage } from "../src/modules/streaming/storage";
const origin = process.env.TEST_ORIGIN || "http://localhost:3000",
  db = getDb(),
  tag = randomUUID().replaceAll("-", "").slice(0, 10),
  password = "Disposable-stream-test-123456!";
if (
  !["localhost", "127.0.0.1"].includes(new URL(origin).hostname) ||
  process.env.STREAM_LOCAL_STORAGE !== "true" ||
  process.env.EMAIL_DELIVERY_MODE !== "local" ||
  new URL(process.env.DATABASE_URL!).port !== "55432" ||
  process.env.S3_ENDPOINT
)
  throw new Error(
    "Streaming tests require the isolated local database, SMTP and explicit local storage.",
  );
type Jar = { cookie: string };
async function call(
  url: string,
  method = "GET",
  data?: unknown,
  jar: Jar = { cookie: "" },
  raw?: Buffer,
  headers: Record<string, string> = {},
  attempt = 0,
) {
  const response = await fetch(origin + url, {
    method,
    headers: {
      Origin: origin,
      ...(jar.cookie ? { Cookie: jar.cookie } : {}),
      ...(data === undefined ? {} : { "Content-Type": "application/json" }),
      ...headers,
    },
    ...(raw
      ? { body: new Uint8Array(raw).buffer }
      : data !== undefined
        ? { body: JSON.stringify(data) }
        : {}),
    redirect: "manual",
    signal: AbortSignal.timeout(60000),
  });
  if (response.status === 429 && attempt < 2 && url.startsWith("/api/auth/")) {
    const delay = Number(
      response.headers.get("x-retry-after") ||
        response.headers.get("retry-after"),
    );
    if (delay > 0 && delay <= 15) {
      await response.text();
      await new Promise((r) => setTimeout(r, (delay + 1) * 1000));
      return call(url, method, data, jar, raw, headers, attempt + 1);
    }
  }
  const cookies = response.headers.getSetCookie();
  if (cookies.length) {
    const map = new Map(
      jar.cookie
        .split("; ")
        .filter(Boolean)
        .map((c) => {
          const index = c.indexOf("=");
          return [c.slice(0, index), c.slice(index + 1)];
        }),
    );
    for (const cookie of cookies) {
      const pair = cookie.split(";")[0],
        index = pair.indexOf("=");
      map.set(pair.slice(0, index), pair.slice(index + 1));
    }
    jar.cookie = [...map].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const text = bytes.toString("utf8");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- External API response shapes are asserted below.
  let json: Record<string, any> = {};
  try {
    json = JSON.parse(text);
  } catch {}
  return {
    status: response.status,
    json,
    text,
    bytes,
    headers: response.headers,
  };
}
const userIds: string[] = [],
  contentIds: string[] = [],
  mediaIds: string[] = [],
  jobIds: string[] = [];
async function register(role: "USER" | "ADMIN") {
  const email = `frame-stream-${tag}-${role.toLowerCase()}@example.test`;
  assert.equal(
    (
      await call("/api/auth/sign-up/email", "POST", {
        email,
        name: `Streaming ${role}`,
        password,
      })
    ).status,
    200,
  );
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  userIds.push(user.id);
  const messages = readFileSync(".local/mailbox/messages.jsonl", "utf8")
    .trim()
    .split("\n")
    .map((v) => JSON.parse(v));
  const mail = messages.reverse().find((m) => m.to.includes(email));
  const decoded = mail.raw
    .replace(/=\r?\n/g, "")
    .replace(/=([A-F0-9]{2})/g, (_: string, hex: string) =>
      String.fromCharCode(parseInt(hex, 16)),
    );
  await fetch(
    decoded.match(/http:\/\/localhost:3000\/api\/auth\/[^\s<>]+/)[0],
    { redirect: "manual" },
  );
  await db.user.update({ where: { id: user.id }, data: { role } });
  const jar = { cookie: "" };
  assert.equal(
    (await call("/api/auth/sign-in/email", "POST", { email, password }, jar))
      .status,
    200,
  );
  return { user, jar, email };
}
async function upload(bytes: Buffer, jar: Jar) {
  const response = await call(
    "/api/stream/uploads",
    "POST",
    {
      name: `Owned pattern ${tag}`,
      bytes: bytes.length,
      mime: "video/mp4",
      authorized: true,
    },
    jar,
  );
  assert.equal(response.status, 201, response.text);
  const { id, parts, partSize } = response.json.data;
  mediaIds.push(id);
  const completed = [];
  for (let number = 1; number <= parts; number++) {
    const signed = await call(
      `/api/stream/uploads/${id}/parts/${number}`,
      "POST",
      {},
      jar,
    );
    assert.equal(signed.status, 200);
    const piece = await call(
      signed.json.data.url,
      "PUT",
      undefined,
      jar,
      bytes.subarray(
        (number - 1) * partSize,
        Math.min(number * partSize, bytes.length),
      ),
      { "Content-Type": "application/octet-stream" },
    );
    assert.equal(piece.status, 200, piece.text);
    completed.push({ number, etag: piece.json.data.etag });
  }
  assert.equal(
    (
      await call(
        `/api/stream/uploads/${id}/complete`,
        "POST",
        { parts: completed },
        jar,
      )
    ).status,
    200,
  );
  assert.equal(
    (await db.mediaUpload.findUniqueOrThrow({ where: { id } })).status,
    "UPLOADED",
  );
  return id as string;
}
async function content(type: "MOVIE" | "TV_SERIES" = "MOVIE") {
  const row = await db.content.create({
    data: {
      slug: `stream-${tag}-${contentIds.length}`,
      title: `Streaming fixture ${tag}`,
      description:
        "Owned generated test pattern, isolated streaming integration test.",
      type,
      status: "PUBLISHED",
      publishedAt: new Date(),
      releaseYear: 2026,
      duration: 1,
      posterPath: "/artwork/mountains.jpg",
      isDemo: true,
    },
  });
  contentIds.push(row.id);
  return row;
}
async function queue(
  contentId: string,
  sourceMediaId: string,
  jar: Jar,
  episodeId?: string,
) {
  const result = await call(
    "/api/stream/jobs",
    "POST",
    { contentId, sourceMediaId, episodeId: episodeId || null },
    jar,
  );
  assert.equal(result.status, 201, result.text);
  jobIds.push(result.json.data.id);
  return result.json.data.id as string;
}
async function worker(jobId: string, fail = false) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "--conditions=react-server",
        "--import",
        "tsx",
        "scripts/stream-worker.ts",
        "--once",
        `--job=${jobId}`,
      ],
      {
        windowsHide: true,
        timeout: 180000,
        env: {
          ...process.env,
          ...(fail
            ? {
                FFMPEG_PATH: path.resolve(".local/nonexistent-test-ffmpeg.exe"),
              }
            : {}),
        },
        stdio: "ignore",
      },
    );
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0 ? resolve() : reject(new Error("Worker process failed.")),
    );
  });
}
test(
  "Secure streaming: actual multipart upload, FFmpeg HLS, access, progress and episodes",
  { timeout: 360000 },
  async (suite) => {
    const work = path.resolve(`.local/fixtures/stream-test-${tag}`);
    await mkdir(work, { recursive: true });
    try {
      const admin = await register("ADMIN"),
        user = await register("USER");
      const sample = path.join(work, "owned.mp4");
      await generateOwnedSample(sample, 8);
      const bytes = await readFile(sample);
      const movie = await content();
      let source = "",
        job = "";
      const guest: Jar = { cookie: "" };
      let guestSession = "",
        userSession = "";
      await suite.test(
        "upload permission, explicit rights, multipart verification and larger-than-part upload",
        async () => {
          assert.equal(
            (
              await call(
                "/api/stream/uploads",
                "POST",
                { name: "No", bytes: 1, mime: "video/mp4", authorized: true },
                user.jar,
              )
            ).status,
            403,
          );
          assert.equal(
            (
              await call(
                "/api/stream/uploads",
                "POST",
                { name: "No", bytes: 1, mime: "video/mp4", authorized: false },
                admin.jar,
              )
            ).status,
            400,
          );
          const large = Buffer.alloc(8 * 1024 * 1024 + 321, 17);
          const largeId = await upload(large, admin.jar);
          assert.equal(
            Number(
              (
                await db.mediaUpload.findUniqueOrThrow({
                  where: { id: largeId },
                })
              ).bytes,
            ),
            large.length,
          );
          assert.equal(
            (
              await call(
                `/api/v1/admin/media/${largeId}`,
                "DELETE",
                undefined,
                admin.jar,
              )
            ).status,
            200,
          );
          source = await upload(bytes, admin.jar);
          job = await queue(movie.id, source, admin.jar);
          assert.equal(
            (
              await call(
                "/api/stream/session",
                "POST",
                { slug: movie.slug },
                guest,
              )
            ).status,
            409,
          );
          assert.equal(
            (await call("/api/stream/jobs", "GET", undefined, user.jar)).status,
            403,
          );
        },
      );
      await suite.test(
        "failed transcoder never becomes ready; admin retry performs real adaptive processing",
        async () => {
          await worker(job, true);
          assert.equal(
            (await db.videoJob.findUniqueOrThrow({ where: { id: job } }))
              .status,
            "FAILED",
          );
          assert.equal(
            await db.contentAsset.count({ where: { videoJobId: job } }),
            0,
          );
          assert.equal(
            (await call(`/api/stream/jobs/${job}/retry`, "POST", {}, admin.jar))
              .status,
            200,
          );
          await worker(job);
          const result = await db.videoJob.findUniqueOrThrow({
            where: { id: job },
            include: { asset: true },
          });
          assert.equal(result.status, "READY");
          assert.equal(result.progress, 100);
          assert.ok(result.duration! >= 7.9 && result.duration! <= 8.2);
          assert.deepEqual(result.resolutions, [360, 480, 720]);
          assert.ok(result.asset?.ready);
          const manifest = (
            await storage("LOCAL").read(`${result.outputPrefix}/master.m3u8`)
          ).toString();
          assert.equal((manifest.match(/#EXT-X-STREAM-INF/g) || []).length, 3);
          assert.equal(
            (manifest.match(/#EXT-X-MEDIA:TYPE=AUDIO/g) || []).length,
            2,
          );
        },
      );
      await suite.test(
        "guest session uses a signed HttpOnly binding; playlists and every segment remain private",
        async () => {
          const response = await call(
            "/api/stream/session",
            "POST",
            { slug: movie.slug },
            guest,
          );
          assert.equal(response.status, 200, response.text);
          guestSession = response.json.data.id;
          assert.ok(
            response.headers
              .getSetCookie()
              .some(
                (v) => v.includes("HttpOnly") && v.includes("SameSite=Lax"),
              ),
          );
          assert.equal(response.json.data.signedIn, false);
          const master = await call(
            response.json.data.url,
            "GET",
            undefined,
            guest,
          );
          assert.equal(master.status, 200);
          assert.ok(
            !master.text.includes(".local") &&
              !master.text.includes("storageKey"),
          );
          assert.ok(
            master.text.includes(
              `/api/stream/${guestSession}/files/360p/index.m3u8`,
            ),
          );
          assert.equal((await call(response.json.data.url)).status, 401);
          const playlist = await call(
            `/api/stream/${guestSession}/files/360p/index.m3u8`,
            "GET",
            undefined,
            guest,
          );
          assert.equal(playlist.status, 200);
          assert.ok(playlist.text.includes("#EXT-X-ENDLIST"));
          const segment = playlist.text
            .split("\n")
            .find((v) => v.startsWith("/api/stream/"))!;
          const binary = await call(segment, "GET", undefined, guest);
          assert.equal(binary.status, 200);
          assert.ok(binary.bytes.length > 188);
          assert.equal(binary.bytes[0], 0x47);
          assert.equal((await call(segment)).status, 401);
          assert.equal(
            (
              await call(
                `/api/stream/${guestSession}/files/source.mp4`,
                "GET",
                undefined,
                guest,
              )
            ).status,
            404,
          );
          assert.equal(
            (
              await call(
                `/api/stream/${guestSession}/files/master.m3u8`,
                "GET",
                undefined,
                {
                  cookie: guest.cookie.replace(
                    /frame_bd_viewer=./,
                    "frame_bd_viewer=X",
                  ),
                },
              )
            ).status,
            401,
          );
        },
      );
      await suite.test(
        "subtitles convert SRT and are authorized by viewing session",
        async () => {
          const subtitle = await call(
            "/api/v1/admin/upload?kind=SUBTITLE",
            "POST",
            undefined,
            admin.jar,
            Buffer.from(
              "1\n00:00:00,000 --> 00:00:06,000\nOwned streaming sample\n",
            ),
            { "Content-Type": "application/octet-stream" },
          );
          assert.equal(subtitle.status, 201);
          const mediaId = subtitle.json.data.id;
          mediaIds.push(mediaId);
          const attach = await call(
            "/api/v1/admin/subtitles",
            "POST",
            {
              contentId: movie.id,
              episodeId: null,
              mediaId,
              language: "English",
            },
            admin.jar,
          );
          assert.equal(attach.status, 201);
          const response = await call(
            "/api/stream/session",
            "POST",
            { slug: movie.slug },
            guest,
          );
          const track = response.json.data.subtitles[0];
          assert.ok(track);
          const vtt = await call(track.url, "GET", undefined, guest);
          assert.equal(vtt.status, 200);
          assert.ok(vtt.text.startsWith("WEBVTT"));
          assert.ok(vtt.text.includes("00:00:00.000 --> 00:00:06.000"));
          assert.equal((await call(`/api/media/${mediaId}`)).status, 404);
        },
      );
      await suite.test(
        "real duration, stable episode identity, bounded progress and resume are server owned",
        async () => {
          assert.equal(
            (
              await call(
                "/api/v1/me/progress",
                "POST",
                { slug: movie.slug, position: 3 },
                user.jar,
              )
            ).status,
            200,
          );
          const response = await call(
            "/api/stream/session",
            "POST",
            { slug: movie.slug },
            user.jar,
          );
          assert.equal(response.status, 200);
          userSession = response.json.data.id;
          assert.equal(response.json.data.resumePosition, 3);
          assert.equal(response.json.data.signedIn, true);
          assert.equal(
            (
              await call(
                "/api/v1/me/progress",
                "POST",
                { slug: movie.slug, position: 100 },
                user.jar,
              )
            ).status,
            400,
          );
          const progress = await db.watchProgress.findUniqueOrThrow({
            where: {
              userId_contentId_episodeKey: {
                userId: user.user.id,
                contentId: movie.id,
                episodeKey: "",
              },
            },
          });
          assert.equal(progress.duration, 8);
          assert.equal(
            (
              await call(
                "/api/stream/session",
                "POST",
                { slug: movie.slug, sessionId: userSession },
                user.jar,
              )
            ).status,
            200,
          );
          assert.equal(
            (
              await call(
                `/api/stream/${userSession}/files/master.m3u8`,
                "GET",
                undefined,
                { cookie: guest.cookie },
              )
            ).status,
            403,
          );
        },
      );
      await suite.test(
        "premium and expired membership checks apply to manifests and cached session URLs",
        async () => {
          await db.content.update({
            where: { id: movie.id },
            data: { access: "PREMIUM" },
          });
          assert.equal(
            (
              await call(
                `/api/stream/${guestSession}/files/master.m3u8`,
                "GET",
                undefined,
                guest,
              )
            ).status,
            403,
          );
          assert.equal(
            (
              await call(
                "/api/stream/session",
                "POST",
                { slug: movie.slug },
                user.jar,
              )
            ).status,
            403,
          );
          const plan = await db.subscriptionPlan.findUniqueOrThrow({
            where: { slug: "premium-monthly" },
          });
          const subscription = await db.subscription.create({
            data: {
              userId: user.user.id,
              planId: plan.id,
              status: "ACTIVE",
              startsAt: new Date(Date.now() - 10000),
              expiresAt: new Date(Date.now() + 60000),
            },
          });
          await db.payment.create({
            data: {
              userId: user.user.id,
              subscriptionId: subscription.id,
              provider: "streaming-integration-fixture",
              amount: plan.price,
              currency: plan.currency,
              status: "VERIFIED",
              liveMode: true,
              verifiedAt: new Date(),
            },
          });
          assert.equal(
            (
              await call(
                "/api/stream/session",
                "POST",
                { slug: movie.slug },
                user.jar,
              )
            ).status,
            200,
          );
          await db.subscription.update({
            where: { id: subscription.id },
            data: { expiresAt: new Date(Date.now() - 1000) },
          });
          assert.equal(
            (
              await call(
                `/api/stream/${userSession}/files/master.m3u8`,
                "GET",
                undefined,
                user.jar,
              )
            ).status,
            403,
          );
          await db.content.update({
            where: { id: movie.id },
            data: { access: "FREE" },
          });
        },
      );
      await suite.test(
        "episode selection has its own processed asset and stable progress relation",
        async () => {
          const series = await content("TV_SERIES");
          const season = await db.season.create({
            data: { contentId: series.id, number: 1, title: "Test season" },
          });
          const episodes = [];
          for (let number = 1; number <= 2; number++) {
            const episode = await db.episode.create({
              data: {
                seasonId: season.id,
                number,
                title: `Episode ${number}`,
                description: "Owned test pattern",
                duration: 1,
                thumbnailPath: "/artwork/mountains.jpg",
                status: "PUBLISHED",
              },
            });
            episodes.push(episode);
            const queued = await queue(
              series.id,
              source,
              admin.jar,
              episode.id,
            );
            await worker(queued);
          }
          const first = await call(
            "/api/stream/session",
            "POST",
            { slug: series.slug, episodeKey: "s1e1" },
            user.jar,
          );
          const second = await call(
            "/api/stream/session",
            "POST",
            { slug: series.slug, episodeKey: "s1e2" },
            user.jar,
          );
          assert.equal(first.status, 200);
          assert.equal(second.status, 200);
          assert.notEqual(first.json.data.id, second.json.data.id);
          assert.equal(
            (
              await call(
                "/api/v1/me/progress",
                "POST",
                { slug: series.slug, episodeKey: "s1e2", position: 4 },
                user.jar,
              )
            ).status,
            200,
          );
          assert.equal(
            (
              await db.watchProgress.findUniqueOrThrow({
                where: {
                  userId_contentId_episodeKey: {
                    userId: user.user.id,
                    contentId: series.id,
                    episodeKey: "s1e2",
                  },
                },
              })
            ).episodeId,
            episodes[1].id,
          );
          assert.equal(
            (
              await call(
                "/api/stream/session",
                "POST",
                { slug: series.slug, episodeKey: "s1e99" },
                user.jar,
              )
            ).status,
            404,
          );
          await db.episode.update({
            where: { id: episodes[1].id },
            data: { status: "DRAFT" },
          });
          assert.equal(
            (
              await call(
                `/api/stream/${second.json.data.id}/files/master.m3u8`,
                "GET",
                undefined,
                user.jar,
              )
            ).status,
            403,
          );
        },
      );
      await suite.test(
        "suspension, publication, session expiry and unused-video deletion are enforced",
        async () => {
          await db.user.update({
            where: { id: user.user.id },
            data: { suspendedAt: new Date() },
          });
          assert.equal(
            (
              await call(
                `/api/stream/${userSession}/files/master.m3u8`,
                "GET",
                undefined,
                user.jar,
              )
            ).status,
            401,
          );
          await db.user.update({
            where: { id: user.user.id },
            data: { suspendedAt: null },
          });
          await db.content.update({
            where: { id: movie.id },
            data: { status: "DRAFT" },
          });
          assert.equal(
            (
              await call(
                `/api/stream/${guestSession}/files/master.m3u8`,
                "GET",
                undefined,
                guest,
              )
            ).status,
            403,
          );
          await db.content.update({
            where: { id: movie.id },
            data: { status: "PUBLISHED" },
          });
          await db.playbackSession.updateMany({
            where: { asset: { contentId: movie.id } },
            data: { expiresAt: new Date(Date.now() - 1000) },
          });
          assert.equal(
            (
              await call(
                `/api/stream/${guestSession}/files/master.m3u8`,
                "GET",
                undefined,
                guest,
              )
            ).status,
            403,
          );
          assert.equal(
            (
              await call(
                `/api/stream/jobs/${job}`,
                "DELETE",
                undefined,
                admin.jar,
              )
            ).status,
            409,
          );
          assert.equal(
            (
              await call(
                `/api/v1/admin/media/${source}`,
                "DELETE",
                undefined,
                admin.jar,
              )
            ).status,
            409,
          );
        },
      );
    } finally {
      await db.payment.deleteMany({ where: { userId: { in: userIds } } });
      await db.subscription.deleteMany({ where: { userId: { in: userIds } } });
      await db.watchProgress.deleteMany({
        where: { contentId: { in: contentIds } },
      });
      await db.watchHistory.deleteMany({
        where: { contentId: { in: contentIds } },
      });
      await db.contentAsset.deleteMany({
        where: { contentId: { in: contentIds } },
      });
      const jobs = await db.videoJob.findMany({
        where: { id: { in: jobIds } },
      });
      for (const job of jobs)
        if (job.outputPrefix)
          await storage("LOCAL").removePrefix(job.outputPrefix);
      await db.videoJob.deleteMany({ where: { id: { in: jobIds } } });
      await db.content.deleteMany({ where: { id: { in: contentIds } } });
      for (const id of mediaIds) {
        const media = await db.mediaUpload.findUnique({ where: { id } });
        if (!media) continue;
        if (media.kind === "VIDEO")
          await storage("LOCAL").removePrefix(
            media.storageKey.split("/").slice(0, 2).join("/"),
          );
        else {
          const { unlink } = await import("node:fs/promises");
          await unlink(path.resolve(".local/media", media.storageKey)).catch(
            () => {},
          );
        }
        await db.mediaUpload.delete({ where: { id } });
      }
      await db.user.deleteMany({ where: { id: { in: userIds } } });
      await db.$disconnect();
      const root = path.resolve(".local/fixtures");
      if (work.startsWith(root + path.sep))
        await rm(work, { recursive: true, force: true });
    }
  },
);
