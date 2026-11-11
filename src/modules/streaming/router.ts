import "server-only";
import { z } from "zod";
import { endpoint, body, sameOrigin, ok, ApiError } from "@/lib/api";
import { adminRequest } from "@/modules/admin/access";
import { rateLimit } from "@/lib/rate-limit";
import {
  initializeUpload,
  uploadPartUrl,
  receiveLocalPart,
  completeUpload,
  abortUpload,
} from "./uploads";
import { enqueueVideo, jobList, retryJob, deleteJob } from "./jobs";
import { createPlayback, streamFile, streamSubtitle } from "./playback";
const id = z.string().regex(/^[a-zA-Z0-9-]{1,160}$/);
export function streamingRouter(request: Request, path: string[]) {
  return endpoint(async () => {
    sameOrigin(request);
    const method = request.method;
    if (path[0] === "session" && method === "POST") {
      const input = await body(
        request,
        z
          .object({
            slug: z.string().regex(/^[a-z0-9-]{1,150}$/),
            episodeKey: z
              .string()
              .regex(/^s[1-9]\d*e[1-9]\d*$/)
              .optional(),
            sessionId: z.uuid().optional(),
          })
          .strict(),
      );
      await rateLimit("playback-session-global", 600, 60);
      const value = await createPlayback(request, input);
      const response = ok(value.data);
      if (value.setCookie)
        response.headers.append("Set-Cookie", value.setCookie);
      return response;
    }
    if (path[1] === "files" && method === "GET")
      return streamFile(
        request,
        z.uuid().parse(path[0]),
        path.slice(2).join("/"),
      );
    if (path[1] === "subtitles" && path.length === 3 && method === "GET")
      return streamSubtitle(
        request,
        z.uuid().parse(path[0]),
        id.parse(path[2]),
      );
    const actor = await adminRequest(request);
    if (path[0] === "uploads") {
      if (path.length === 1 && method === "POST")
        return ok(
          await initializeUpload(
            await body(
              request,
              z
                .object({
                  name: z.string().trim().min(1).max(160),
                  bytes: z
                    .number()
                    .int()
                    .min(1)
                    .max(100 * 1024 * 1024 * 1024),
                  mime: z.enum(["video/mp4", "video/webm", "video/quicktime"]),
                  authorized: z.literal(true),
                })
                .strict(),
            ),
            actor.id,
          ),
          undefined,
          201,
        );
      const mediaId = id.parse(path[1]);
      if (path[2] === "parts") {
        const number = z.coerce.number().int().min(1).max(10000).parse(path[3]);
        if (method === "POST") return ok(await uploadPartUrl(mediaId, number));
        if (method === "PUT")
          return ok(await receiveLocalPart(request, mediaId, number));
      }
      if (path[2] === "complete" && method === "POST")
        return ok(
          await completeUpload(
            mediaId,
            (
              await body(
                request,
                z
                  .object({
                    parts: z
                      .array(
                        z
                          .object({
                            number: z.number().int().min(1).max(10000),
                            etag: z.string().min(1).max(128),
                          })
                          .strict(),
                      )
                      .min(1)
                      .max(10000),
                  })
                  .strict(),
                2 * 1024 * 1024,
              )
            ).parts,
            actor.id,
          ),
        );
      if (method === "DELETE" && path.length === 2)
        return ok(await abortUpload(mediaId, actor.id));
    }
    if (path[0] === "jobs") {
      if (method === "GET" && path.length === 1) return ok(await jobList());
      if (method === "POST" && path.length === 1)
        return ok(
          await enqueueVideo(
            await body(
              request,
              z
                .object({
                  contentId: id,
                  episodeId: id.nullable().optional(),
                  sourceMediaId: id,
                })
                .strict(),
            ),
            actor.id,
          ),
          undefined,
          201,
        );
      if (path[2] === "retry" && method === "POST")
        return ok(await retryJob(id.parse(path[1]), actor.id));
      if (method === "DELETE" && path.length === 2)
        return ok(await deleteJob(id.parse(path[1]), actor.id));
    }
    throw new ApiError(404, "NOT_FOUND", "Unknown streaming resource.");
  });
}
