import "server-only";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import sharp from "sharp";
import { normalizeSubtitles } from "@/modules/streaming/subtitles";
import { storage as streamStorage } from "@/modules/streaming/storage";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getDb } from "@/lib/db";
import { ApiError } from "@/lib/api";
const root = path.resolve(".local/media");
function storage() {
  if (
    !process.env.S3_ENDPOINT ||
    !process.env.S3_BUCKET ||
    !process.env.S3_ACCESS_KEY_ID ||
    !process.env.S3_SECRET_ACCESS_KEY
  )
    return null;
  const endpoint = new URL(process.env.S3_ENDPOINT);
  if (endpoint.protocol !== "https:")
    throw new ApiError(
      503,
      "STORAGE_CONFIG",
      "Storage endpoint must use HTTPS.",
    );
  return {
    client: new S3Client({
      requestChecksumCalculation: "WHEN_REQUIRED",
      endpoint: endpoint.href,
      region: process.env.S3_REGION || "auto",
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
      },
    }),
    bucket: process.env.S3_BUCKET,
  };
}
function localFile(key: string) {
  if (!/^[a-z0-9-]+\.(webp|vtt)$/.test(key))
    throw new ApiError(400, "INVALID_KEY", "Invalid managed storage key.");
  return path.join(root, key);
}
export async function uploadSmall(request: Request, actor: string) {
  const kind = new URL(request.url).searchParams.get("kind");
  if (!["IMAGE", "SUBTITLE"].includes(kind || ""))
    throw new ApiError(400, "INVALID_KIND", "Choose IMAGE or SUBTITLE.");
  const max = kind === "IMAGE" ? 8 * 1024 * 1024 : 1024 * 1024;
  const chunks = [];
  let size = 0;
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "EMPTY_UPLOAD", "Choose a file.");
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      void reader.cancel();
      throw new ApiError(
        413,
        "UPLOAD_TOO_LARGE",
        "Image limit 8 MB; subtitle limit 1 MB.",
      );
    }
    chunks.push(value);
  }
  let buffer = Buffer.concat(chunks);
  let mime = "text/vtt";
  if (kind === "IMAGE") {
    try {
      const metadata = await sharp(buffer, {
        limitInputPixels: 25000000,
        animated: false,
      }).metadata();
      if (!["jpeg", "png", "webp"].includes(metadata.format || ""))
        throw new Error();
      buffer = await sharp(buffer, { limitInputPixels: 25000000 })
        .rotate()
        .webp({ quality: 88 })
        .toBuffer();
      mime = "image/webp";
    } catch {
      throw new ApiError(
        400,
        "INVALID_IMAGE",
        "Choose a valid JPEG, PNG or WebP image under 25 megapixels.",
      );
    }
  } else {
    try {
      buffer = Buffer.from(normalizeSubtitles(buffer.toString("utf8")));
    } catch {
      throw new ApiError(
        400,
        "INVALID_SUBTITLE",
        "Choose a valid UTF-8 WebVTT or SRT subtitle file.",
      );
    }
  }
  const key = randomUUID() + (kind === "IMAGE" ? ".webp" : ".vtt"),
    s3 = storage();
  if (s3)
    await s3.client.send(
      new PutObjectCommand({
        Bucket: s3.bucket,
        Key: key,
        Body: buffer,
        ContentType: mime,
      }),
    );
  else {
    if (
      !["localhost", "127.0.0.1"].includes(
        new URL(process.env.BETTER_AUTH_URL!).hostname,
      )
    )
      throw new ApiError(
        503,
        "STORAGE_NOT_CONFIGURED",
        "Configure private R2/S3 storage for deployment.",
      );
    await mkdir(root, { recursive: true });
    await writeFile(localFile(key), buffer, { flag: "wx" });
  }
  try {
    return await getDb().$transaction(async (tx) => {
      const media = await tx.mediaUpload.create({
        data: {
          name:
            (request.headers.get("x-file-name") || "Upload")
              .replace(/[^a-zA-Z0-9 ._-]/g, "")
              .slice(0, 160) || "Upload",
          kind: kind!,
          mime,
          bytes: buffer.length,
          storageKey: key,
          provider: s3 ? "S3" : "LOCAL",
          status: "READY",
        },
      });
      await tx.auditLog.create({
        data: {
          userId: actor,
          action: "ADMIN_MEDIA_UPLOADED",
          resourceId: media.id,
          metadata: { kind, bytes: buffer.length },
        },
      });
      return {
        id: media.id,
        path: kind === "IMAGE" ? `/api/media/${media.id}` : null,
        status: "READY",
      };
    });
  } catch (error) {
    if (s3)
      await s3.client.send(
        new DeleteObjectCommand({ Bucket: s3.bucket, Key: key }),
      );
    else await unlink(localFile(key));
    throw error;
  }
}
export async function prepareVideo(
  input: { name: string; bytes: number; mime: string; authorized: true },
  actor: string,
) {
  const s3 = storage();
  if (!s3)
    throw new ApiError(
      503,
      "STORAGE_NOT_CONFIGURED",
      "Configure R2/S3 for direct authorized video uploads.",
    );
  const key = `originals/${randomUUID()}`;
  const media = await getDb().mediaUpload.create({
    data: {
      name: input.name,
      bytes: input.bytes,
      mime: input.mime,
      storageKey: key,
      kind: "VIDEO",
      provider: "S3",
    },
  });
  const url = await getSignedUrl(
    s3.client,
    new PutObjectCommand({
      Bucket: s3.bucket,
      Key: key,
      ContentType: input.mime,
      ContentLength: input.bytes,
    }),
    { expiresIn: 900 },
  );
  await getDb().auditLog.create({
    data: {
      userId: actor,
      action: "ADMIN_VIDEO_UPLOAD_PREPARED",
      resourceId: media.id,
    },
  });
  return { id: media.id, url, expiresIn: 900 };
}
export async function completeVideo(id: string, actor: string) {
  const s3 = storage();
  if (!s3)
    throw new ApiError(
      503,
      "STORAGE_NOT_CONFIGURED",
      "Storage is unavailable.",
    );
  const media = await getDb().mediaUpload.findUniqueOrThrow({ where: { id } });
  if (media.kind !== "VIDEO" || media.provider !== "S3")
    throw new ApiError(400, "INVALID_MEDIA", "Not a direct video upload.");
  const head = await s3.client.send(
    new HeadObjectCommand({ Bucket: s3.bucket, Key: media.storageKey }),
  );
  if (
    head.ContentLength !== Number(media.bytes) ||
    head.ContentType !== media.mime
  )
    throw new ApiError(
      409,
      "UPLOAD_MISMATCH",
      "Uploaded file does not match its declared metadata.",
    );
  return getDb().$transaction(async (tx) => {
    await tx.mediaUpload.update({
      where: { id },
      data: { status: "UPLOADED" },
    });
    await tx.auditLog.create({
      data: {
        userId: actor,
        action: "ADMIN_VIDEO_UPLOAD_COMPLETED",
        resourceId: id,
      },
    });
    return { id, status: "UPLOADED" };
  });
}
export async function deleteMedia(id: string, actor: string) {
  const db = getDb();
  const media = await db.mediaUpload.findUniqueOrThrow({ where: { id } });
  const publicPath = `/api/media/${id}`;
  if (media.kind === "VIDEO" && media.status === "UPLOADING")
    throw new ApiError(
      409,
      "UPLOAD_IN_PROGRESS",
      "Abort the multipart upload before deleting its record.",
    );
  if (await db.videoJob.count({ where: { sourceMediaId: id } }))
    throw new ApiError(
      409,
      "MEDIA_IN_USE",
      "Remove all processing jobs that reference this original before deleting it.",
    );
  if (
    (await db.content.count({
      where: { OR: [{ posterPath: publicPath }, { backdropPath: publicPath }] },
    })) ||
    (await db.episode.count({ where: { thumbnailPath: publicPath } })) ||
    (await db.contentBanner.count({ where: { imagePath: publicPath } })) ||
    (await db.contentAsset.count({
      where: { privateStorageKey: media.storageKey },
    })) ||
    (await db.subtitle.count({
      where: { privateStorageKey: media.storageKey },
    })) ||
    (await db.platformSetting.count({
      where: { key: "brand", value: { path: ["logo"], equals: publicPath } },
    })) ||
    (await db.platformSetting.count({
      where: { key: "brand", value: { path: ["favicon"], equals: publicPath } },
    }))
  )
    throw new ApiError(
      409,
      "MEDIA_IN_USE",
      "Remove all content and brand references before deleting this upload.",
    );
  // A shared advisory lock with catalog mutations closes the reference/delete race.
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(78439012)`;
      const used =
        (await tx.content.count({
          where: {
            OR: [{ posterPath: publicPath }, { backdropPath: publicPath }],
          },
        })) +
        (await tx.contentAsset.count({
          where: { privateStorageKey: media.storageKey },
        })) +
        (await tx.subtitle.count({
          where: { privateStorageKey: media.storageKey },
        })) +
        (await tx.episode.count({ where: { thumbnailPath: publicPath } })) +
        (await tx.contentBanner.count({ where: { imagePath: publicPath } }));
      const settingsUsed = await tx.platformSetting.count({
        where: {
          key: "brand",
          OR: [
            { value: { path: ["logo"], equals: publicPath } },
            { value: { path: ["favicon"], equals: publicPath } },
          ],
        },
      });
      if (
        used ||
        settingsUsed ||
        (await tx.videoJob.count({ where: { sourceMediaId: id } }))
      )
        throw new ApiError(409, "MEDIA_IN_USE", "Upload is referenced.");
      if (media.provider === "S3") {
        const s3 = storage();
        if (!s3)
          throw new ApiError(
            503,
            "STORAGE_NOT_CONFIGURED",
            "Storage is unavailable.",
          );
        await s3.client.send(
          new DeleteObjectCommand({ Bucket: s3.bucket, Key: media.storageKey }),
        );
      } else if (
        media.kind === "VIDEO" &&
        media.storageKey.startsWith("originals/")
      )
        await streamStorage("LOCAL").removePrefix(
          media.storageKey.split("/").slice(0, 2).join("/"),
        );
      else await unlink(localFile(media.storageKey));
      await tx.mediaUpload.delete({ where: { id } });
      await tx.auditLog.create({
        data: { userId: actor, action: "ADMIN_MEDIA_DELETED", resourceId: id },
      });
      return { deleted: true };
    },
    { timeout: 15000 },
  );
}
export async function publicImage(id: string) {
  const media = await getDb().mediaUpload.findFirst({
    where: { id, kind: "IMAGE", status: "READY" },
  });
  if (!media) throw new ApiError(404, "NOT_FOUND", "Image not found.");
  let bytes: Uint8Array;
  if (media.provider === "LOCAL")
    bytes = await readFile(localFile(media.storageKey));
  else {
    const s3 = storage();
    if (!s3)
      throw new ApiError(
        503,
        "STORAGE_NOT_CONFIGURED",
        "Storage is unavailable.",
      );
    const value = await s3.client.send(
      new GetObjectCommand({ Bucket: s3.bucket, Key: media.storageKey }),
    );
    bytes = await value.Body!.transformToByteArray();
  }
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "image/webp",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
