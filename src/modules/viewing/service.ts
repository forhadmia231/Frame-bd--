import "server-only";
import { getDb } from "@/lib/db";
import { getContentsBySlug, publishedWhere } from "@/modules/catalog/service";
import { checkContentAccess } from "@/modules/subscriptions/access";
import { ApiError } from "@/lib/api";
import { z } from "zod";

export const progressSchema = z
  .object({
    slug: z.string().min(1).max(150),
    episodeKey: z
      .string()
      .regex(/^$|^s[1-9]\d*e[1-9]\d*$/)
      .default(""),
    position: z.number().int().min(0).max(86400),
    playbackSessionId: z.uuid().optional(),
  })
  .strict();
export async function saveProgress(
  userId: string,
  input: z.infer<typeof progressSchema>,
) {
  const title = await checkContentAccess(
    input.slug,
    userId,
    input.episodeKey || undefined,
  );
  let minutes = title.duration;
  let episodeId: string | null = null;
  if (title.seasons) {
    const episode = Object.values(title.episodes || {})
      .flat()
      .find((episode) => episode.id === input.episodeKey);
    if (!episode)
      throw new ApiError(
        404,
        "EPISODE_NOT_FOUND",
        "Select a published episode.",
      );
    minutes = episode.duration;
    const match = episode.id.match(/^s(\d+)e(\d+)$/)!;
    episodeId = (
      await getDb().episode.findFirstOrThrow({
        where: {
          number: Number(match[2]),
          season: { contentId: title.id, number: Number(match[1]) },
        },
        select: { id: true },
      })
    ).id;
  } else if (input.episodeKey)
    throw new ApiError(400, "INVALID_EPISODE", "This title is not episodic.");
  const playback = input.playbackSessionId
    ? await getDb().playbackSession.findFirst({
        where: {
          id: input.playbackSessionId,
          userId,
          expiresAt: { gt: new Date() },
          asset: {
            contentId: title.id,
            episodeId,
            ready: true,
            videoJob: { is: { status: "READY" } },
          },
        },
        select: {
          asset: { select: { videoJob: { select: { duration: true } } } },
        },
      })
    : null;
  if (input.playbackSessionId && !playback)
    throw new ApiError(
      403,
      "PLAYBACK_SESSION_UNAVAILABLE",
      "Start an authorized viewing session before saving this progress.",
    );
  const video =
    playback?.asset.videoJob ||
    (await getDb().videoJob.findFirst({
      where: { contentId: title.id, episodeId, status: "READY" },
      orderBy: { createdAt: "desc" },
      select: { duration: true },
    }));
  const duration = video?.duration ? Math.ceil(video.duration) : minutes * 60;
  if (input.position > duration)
    throw new ApiError(
      400,
      "INVALID_PROGRESS",
      "Position exceeds the content duration.",
    );
  const identity = {
    userId,
    contentId: title.id!,
    episodeKey: input.episodeKey,
  };
  return getDb().$transaction(async (tx) => {
    const record = await tx.watchProgress.upsert({
      where: { userId_contentId_episodeKey: identity },
      create: {
        ...identity,
        episodeId,
        duration,
        position: input.position,
        completed: input.position >= duration * 0.95,
      },
      update: {
        episodeId,
        duration,
        position: input.position,
        completed: input.position >= duration * 0.95,
      },
    });
    await tx.watchHistory.upsert({
      where: { userId_contentId_episodeKey: identity },
      create: { ...identity, episodeId },
      update: { updatedAt: new Date(), episodeId },
    });
    return {
      id: record.id,
      position: record.position,
      duration: record.duration,
      completed: record.completed,
    };
  });
}
export async function viewingList(userId: string, continuing = false) {
  const db = getDb();
  const rows = continuing
    ? await db.watchProgress.findMany({
        where: {
          userId,
          completed: false,
          position: { gt: 0 },
          content: publishedWhere(),
        },
        select: {
          id: true,
          episodeKey: true,
          position: true,
          duration: true,
          updatedAt: true,
          content: { select: { slug: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: 100,
      })
    : await db.watchHistory.findMany({
        where: { userId, content: publishedWhere() },
        select: {
          id: true,
          episodeKey: true,
          updatedAt: true,
          content: { select: { slug: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: 100,
      });
  const titles = await getContentsBySlug(
    [...new Set(rows.map((row) => row.content.slug))],
  );
  const bySlug = new Map(titles.map((title) => [title.slug, title]));
  return rows.map(({ content, ...row }) => ({
    ...row,
    title: bySlug.get(content.slug) ?? null,
  }));
}
