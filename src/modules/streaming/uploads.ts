import "server-only";
import { randomUUID, createHash } from "node:crypto";
import { mkdir, writeFile, readFile, open, rm } from "node:fs/promises";
import path from "node:path";
import {
  CreateMultipartUploadCommand,
  UploadPartCommand,
  ListPartsCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getDb } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { storageProvider, storage, s3Config, localPath } from "./storage";
export const partSize = 8 * 1024 * 1024;
export async function initializeUpload(
  input: { name: string; bytes: number; mime: string; authorized: true },
  actor: string,
) {
  const provider = storageProvider();
  const chosenPartSize = Math.max(
    partSize,
    Math.ceil(input.bytes / 10000 / 1048576) * 1048576,
  );
  if (provider === "LOCAL" && input.bytes > 128 * 1024 * 1024)
    throw new ApiError(
      413,
      "LOCAL_UPLOAD_LIMIT",
      "Loopback test uploads are limited to 128 MB; configure R2/S3 for larger originals.",
    );
  const key = `originals/${randomUUID()}/source`;
  const s3 = s3Config();
  let multipartId: string | undefined;
  if (provider === "S3")
    multipartId = (
      await s3!.client.send(
        new CreateMultipartUploadCommand({
          Bucket: s3!.bucket,
          Key: key,
          ContentType: input.mime,
        }),
      )
    ).UploadId;
  const media = await getDb().mediaUpload.create({
    data: {
      name: input.name,
      bytes: BigInt(input.bytes),
      mime: input.mime,
      kind: "VIDEO",
      provider,
      storageKey: key,
      status: "UPLOADING",
      multipartId,
      partSize: chosenPartSize,
    },
  });
  await getDb().auditLog.create({
    data: {
      userId: actor,
      action: "STREAM_UPLOAD_INITIALIZED",
      resourceId: media.id,
      metadata: { bytes: input.bytes, provider },
    },
  });
  return {
    id: media.id,
    partSize: chosenPartSize,
    parts: Math.ceil(input.bytes / chosenPartSize),
    provider,
  };
}
export async function uploadPartUrl(id: string, number: number) {
  const media = await getDb().mediaUpload.findUniqueOrThrow({ where: { id } });
  if (
    media.status !== "UPLOADING" ||
    !media.partSize ||
    number > Math.ceil(Number(media.bytes) / media.partSize)
  )
    throw new ApiError(
      409,
      "INVALID_UPLOAD_PART",
      "This part is not available for upload.",
    );
  const bytes = Math.min(
    media.partSize,
    Number(media.bytes) - (number - 1) * media.partSize,
  );
  if (media.provider === "LOCAL")
    return {
      url: `/api/stream/uploads/${id}/parts/${number}`,
      bytes,
      headers: { "Content-Type": "application/octet-stream" },
    };
  const s3 = s3Config();
  if (!s3 || !media.multipartId)
    throw new ApiError(
      503,
      "STORAGE_NOT_CONFIGURED",
      "Storage is unavailable.",
    );
  return {
    url: await getSignedUrl(
      s3.client,
      new UploadPartCommand({
        Bucket: s3.bucket,
        Key: media.storageKey,
        UploadId: media.multipartId,
        PartNumber: number,
        ContentLength: bytes,
      }),
      { expiresIn: 900 },
    ),
    bytes,
    headers: {},
  };
}
export async function receiveLocalPart(
  request: Request,
  id: string,
  number: number,
) {
  if (storageProvider() !== "LOCAL")
    throw new ApiError(404, "NOT_FOUND", "Local upload is disabled.");
  const media = await getDb().mediaUpload.findUniqueOrThrow({ where: { id } });
  if (
    media.provider !== "LOCAL" ||
    media.status !== "UPLOADING" ||
    !media.partSize ||
    number > Math.ceil(Number(media.bytes) / media.partSize)
  )
    throw new ApiError(409, "INVALID_UPLOAD_PART", "Upload is unavailable.");
  const expected = Math.min(
    media.partSize,
    Number(media.bytes) - (number - 1) * media.partSize,
  );
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "EMPTY_PART", "Choose a file part.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > expected) {
      void reader.cancel();
      throw new ApiError(
        413,
        "PART_TOO_LARGE",
        "The part exceeds its declared size.",
      );
    }
    chunks.push(value);
  }
  if (size !== expected)
    throw new ApiError(
      400,
      "PART_SIZE_MISMATCH",
      "The uploaded part is incomplete.",
    );
  const bytes = Buffer.concat(chunks),
    etag = createHash("sha256").update(bytes).digest("hex");
  const filename = localPath(`${media.storageKey}.parts/${number}`);
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, bytes, { flag: "w" });
  await getDb().uploadPart.upsert({
    where: { mediaId_number: { mediaId: id, number } },
    create: { mediaId: id, number, bytes: size, etag },
    update: { bytes: size, etag },
  });
  return { number, etag };
}
export async function completeUpload(
  id: string,
  parts: { number: number; etag: string }[],
  actor: string,
) {
  const db = getDb();
  const media = await db.mediaUpload.findUniqueOrThrow({ where: { id } });
  if (media.status === "UPLOADED") return { id, status: "UPLOADED" };
  if (media.status !== "UPLOADING" || !media.partSize)
    throw new ApiError(409, "INVALID_UPLOAD_STATE", "Upload is not open.");
  const count = Math.ceil(Number(media.bytes) / media.partSize);
  if (
    parts.length !== count ||
    new Set(parts.map((v) => v.number)).size !== count ||
    parts.some((v, i) => v.number !== i + 1)
  )
    throw new ApiError(
      400,
      "INCOMPLETE_UPLOAD",
      "Every part must appear once, in order.",
    );
  if (media.provider === "LOCAL") {
    const stored = await db.uploadPart.findMany({
      where: { mediaId: id },
      orderBy: { number: "asc" },
    });
    if (
      stored.length !== count ||
      stored.some((v, i) => v.etag !== parts[i].etag)
    )
      throw new ApiError(
        409,
        "PART_VERIFICATION_FAILED",
        "Uploaded parts did not match.",
      );
    const filename = localPath(media.storageKey);
    await mkdir(path.dirname(filename), { recursive: true });
    const target = await open(filename, "w");
    try {
      for (const part of stored) {
        const bytes = await readFile(
          localPath(`${media.storageKey}.parts/${part.number}`),
        );
        if (
          bytes.length !== part.bytes ||
          createHash("sha256").update(bytes).digest("hex") !== part.etag
        )
          throw new ApiError(
            409,
            "PART_VERIFICATION_FAILED",
            "A stored part did not match.",
          );
        await target.write(bytes);
      }
    } finally {
      await target.close();
    }
  } else {
    const s3 = s3Config();
    if (!s3 || !media.multipartId)
      throw new ApiError(
        503,
        "STORAGE_NOT_CONFIGURED",
        "Storage is unavailable.",
      );
    const actual = [];
    let marker: string | undefined;
    do {
      const values = await s3.client.send(
        new ListPartsCommand({
          Bucket: s3.bucket,
          Key: media.storageKey,
          UploadId: media.multipartId,
          PartNumberMarker: marker,
        }),
      );
      actual.push(...(values.Parts || []));
      marker = values.NextPartNumberMarker;
    } while (marker);
    if (
      actual.length !== count ||
      actual.some(
        (p, i) =>
          p.PartNumber !== parts[i].number ||
          p.ETag !== parts[i].etag ||
          p.Size !==
            Math.min(
              media.partSize!,
              Number(media.bytes) - i * media.partSize!,
            ),
      )
    )
      throw new ApiError(
        409,
        "PART_VERIFICATION_FAILED",
        "Provider upload parts did not match.",
      );
    await s3.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: s3.bucket,
        Key: media.storageKey,
        UploadId: media.multipartId,
        MultipartUpload: {
          Parts: parts.map((p) => ({ PartNumber: p.number, ETag: p.etag })),
        },
      }),
    );
  }
  if (
    (await storage(media.provider).head(media.storageKey)).bytes !==
    Number(media.bytes)
  )
    throw new ApiError(
      409,
      "UPLOAD_SIZE_MISMATCH",
      "Stored video size did not match.",
    );
  await db.$transaction(async (tx) => {
    await tx.mediaUpload.update({
      where: { id },
      data: { status: "UPLOADED" },
    });
    await tx.auditLog.create({
      data: {
        userId: actor,
        action: "STREAM_UPLOAD_COMPLETED",
        resourceId: id,
      },
    });
  });
  if (media.provider === "LOCAL") {
    const directory = localPath(`${media.storageKey}.parts`);
    await rm(directory, { recursive: true, force: true });
  }
  return { id, status: "UPLOADED" };
}
export async function abortUpload(id: string, actor: string) {
  const media = await getDb().mediaUpload.findUniqueOrThrow({ where: { id } });
  if (media.status !== "UPLOADING")
    throw new ApiError(
      409,
      "UPLOAD_NOT_OPEN",
      "Only an open upload can be aborted.",
    );
  if (media.provider === "S3") {
    const s3 = s3Config();
    if (!s3)
      throw new ApiError(
        503,
        "STORAGE_NOT_CONFIGURED",
        "Storage is unavailable.",
      );
    await s3.client.send(
      new AbortMultipartUploadCommand({
        Bucket: s3.bucket,
        Key: media.storageKey,
        UploadId: media.multipartId!,
      }),
    );
  } else
    await storage("LOCAL").removePrefix(
      media.storageKey.split("/").slice(0, 2).join("/"),
    );
  await getDb().$transaction(async (tx) => {
    await tx.mediaUpload.update({ where: { id }, data: { status: "FAILED" } });
    await tx.auditLog.create({
      data: { userId: actor, action: "STREAM_UPLOAD_ABORTED", resourceId: id },
    });
  });
  return { aborted: true };
}
