import "server-only";
import { getDb } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { storage } from "./storage";
export async function enqueueVideo(
  input: {
    contentId: string;
    episodeId?: string | null;
    sourceMediaId: string;
  },
  actor: string,
) {
  return getDb().$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(78439012)`;
    const content = await tx.content.findUniqueOrThrow({
      where: { id: input.contentId },
    });
    const source = await tx.mediaUpload.findUniqueOrThrow({
      where: { id: input.sourceMediaId },
    });
    if (
      source.kind !== "VIDEO" ||
      !["UPLOADED", "READY"].includes(source.status)
    )
      throw new ApiError(
        409,
        "SOURCE_NOT_UPLOADED",
        "Complete and verify the original upload first.",
      );
    if (input.episodeId) {
      const episode = await tx.episode.findUniqueOrThrow({
        where: { id: input.episodeId },
        include: { season: true },
      });
      if (episode.season.contentId !== content.id)
        throw new ApiError(
          400,
          "INVALID_EPISODE",
          "The episode belongs to a different title.",
        );
    } else if (["TV_SERIES", "WEB_SERIES", "ANIME"].includes(content.type))
      throw new ApiError(
        400,
        "EPISODE_REQUIRED",
        "Choose the episode for episodic content.",
      );
    const running = await tx.videoJob.findFirst({
      where: {
        contentId: content.id,
        episodeId: input.episodeId || null,
        status: { in: ["QUEUED", "PROCESSING"] },
      },
    });
    if (running)
      throw new ApiError(
        409,
        "JOB_ALREADY_RUNNING",
        "This title or episode already has an active processing job.",
      );
    const job = await tx.videoJob.create({
      data: { ...input, episodeId: input.episodeId || null },
    });
    await tx.auditLog.create({
      data: {
        userId: actor,
        action: "VIDEO_PROCESSING_QUEUED",
        resourceId: job.id,
      },
    });
    return { id: job.id, status: job.status };
  });
}
export async function jobList() {
  const jobs = await getDb().videoJob.findMany({
    take: 100,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      contentId: true,
      episodeId: true,
      sourceMediaId: true,
      status: true,
      progress: true,
      duration: true,
      resolutions: true,
      errorCode: true,
      attempts: true,
      createdAt: true,
      updatedAt: true,
      content: { select: { title: true } },
      episode: { select: { title: true } },
      sourceMedia: { select: { name: true } },
      asset: { select: { id: true } },
    },
  });
  return jobs;
}
export async function retryJob(id: string, actor: string) {
  const changed = await getDb().$transaction(async (tx) => {
    const result = await tx.videoJob.updateMany({
      where: { id, status: "FAILED" },
      data: {
        status: "QUEUED",
        progress: 0,
        errorCode: null,
        attempts: 0,
        leaseToken: null,
        leaseExpiresAt: null,
      },
    });
    if (!result.count)
      throw new ApiError(
        409,
        "JOB_NOT_FAILED",
        "Only a failed job can be retried.",
      );
    await tx.auditLog.create({
      data: {
        userId: actor,
        action: "VIDEO_PROCESSING_RETRIED",
        resourceId: id,
      },
    });
    return { id, status: "QUEUED" };
  });
  return changed;
}
export async function deleteJob(id: string, actor: string) {
  return getDb().$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(78439012)`;
      const job = await tx.videoJob.findUniqueOrThrow({
        where: { id },
        include: { asset: true, sourceMedia: true },
      });
      if (["PROCESSING", "QUEUED"].includes(job.status) || job.asset)
        throw new ApiError(
          409,
          "VIDEO_IN_USE",
          "Stop processing or detach its generated HLS asset reference before deleting this job.",
        );
      if (job.outputPrefix)
        await storage(job.sourceMedia.provider).removePrefix(job.outputPrefix);
      await tx.videoJob.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          userId: actor,
          action: "VIDEO_PROCESSING_DELETED",
          resourceId: id,
        },
      });
      return { deleted: true };
    },
    { timeout: 30000 },
  );
}
