import "server-only";
import path from "node:path";
import {
  mkdir,
  readFile,
  writeFile,
  stat,
  copyFile,
  rm,
  readdir,
} from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { ApiError } from "@/lib/api";
export const streamRoot = path.resolve(".local/streaming");
export function safeKey(key: string) {
  if (
    !/^[a-zA-Z0-9][a-zA-Z0-9/_.,-]{0,450}$/.test(key) ||
    key.split("/").some((v) => !v || v === "." || v === "..")
  )
    throw new ApiError(
      400,
      "INVALID_MEDIA_PATH",
      "Invalid managed media path.",
    );
  return key;
}
export function localPath(key: string) {
  const result = path.resolve(streamRoot, safeKey(key));
  if (!result.startsWith(streamRoot + path.sep))
    throw new ApiError(
      400,
      "INVALID_MEDIA_PATH",
      "Invalid managed media path.",
    );
  return result;
}
export function s3Config() {
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
    bucket: process.env.S3_BUCKET,
    client: new S3Client({
      endpoint: endpoint.href,
      region: process.env.S3_REGION || "auto",
      forcePathStyle: true,
      requestChecksumCalculation: "WHEN_REQUIRED",
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
      },
    }),
  };
}
export function storageProvider() {
  if (s3Config()) return "S3";
  if (
    process.env.STREAM_LOCAL_STORAGE === "true" &&
    ["localhost", "127.0.0.1"].includes(
      new URL(process.env.BETTER_AUTH_URL!).hostname,
    )
  )
    return "LOCAL";
  throw new ApiError(
    503,
    "STORAGE_NOT_CONFIGURED",
    "Configure private R2/S3 storage. Loopback development can explicitly enable STREAM_LOCAL_STORAGE.",
  );
}
export function storage(provider: string) {
  const s3 = provider === "S3" ? s3Config() : null;
  if (provider === "S3" && !s3)
    throw new ApiError(
      503,
      "STORAGE_NOT_CONFIGURED",
      "Private storage is unavailable.",
    );
  if (provider !== "S3" && storageProvider() !== "LOCAL")
    throw new ApiError(
      503,
      "LOCAL_STORAGE_DISABLED",
      "Local streaming storage is unavailable.",
    );
  return {
    async head(key: string) {
      safeKey(key);
      if (s3) {
        const value = await s3.client.send(
          new HeadObjectCommand({ Bucket: s3.bucket, Key: key }),
        );
        return {
          bytes: value.ContentLength || 0,
          mime: value.ContentType || "application/octet-stream",
        };
      }
      return { bytes: (await stat(localPath(key))).size, mime: "" };
    },
    async read(key: string) {
      safeKey(key);
      if (s3) {
        const value = await s3.client.send(
          new GetObjectCommand({ Bucket: s3.bucket, Key: key }),
        );
        return Buffer.from(await value.Body!.transformToByteArray());
      }
      return readFile(localPath(key));
    },
    async put(key: string, bytes: Buffer, mime: string) {
      safeKey(key);
      if (s3)
        await s3.client.send(
          new PutObjectCommand({
            Bucket: s3.bucket,
            Key: key,
            Body: bytes,
            ContentType: mime,
          }),
        );
      else {
        await mkdir(path.dirname(localPath(key)), { recursive: true });
        await writeFile(localPath(key), bytes);
      }
      const head = await this.head(key);
      if (head.bytes !== bytes.length)
        throw new Error("STORAGE_VERIFICATION_FAILED");
    },
    async putFile(key: string, file: string, mime: string) {
      safeKey(key);
      const size = (await stat(file)).size;
      if (s3)
        await s3.client.send(
          new PutObjectCommand({
            Bucket: s3.bucket,
            Key: key,
            Body: createReadStream(file),
            ContentLength: size,
            ContentType: mime,
          }),
        );
      else {
        await mkdir(path.dirname(localPath(key)), { recursive: true });
        await copyFile(file, localPath(key));
      }
      if ((await this.head(key)).bytes !== size)
        throw new Error("STORAGE_VERIFICATION_FAILED");
    },
    async download(key: string, destination: string) {
      safeKey(key);
      if (s3) {
        const value = await s3.client.send(
          new GetObjectCommand({ Bucket: s3.bucket, Key: key }),
        );
        await pipeline(
          value.Body as NodeJS.ReadableStream,
          createWriteStream(destination),
        );
      } else await copyFile(localPath(key), destination);
    },
    async removePrefix(prefix: string) {
      safeKey(prefix);
      if (!/^(hls|originals)\/[a-zA-Z0-9-]+(?:\/[a-zA-Z0-9-]+)?$/.test(prefix))
        throw new Error("UNSAFE_DELETE_PREFIX");
      if (s3) {
        let continuation: string | undefined;
        do {
          const values = await s3.client.send(
            new ListObjectsV2Command({
              Bucket: s3.bucket,
              Prefix: prefix + "/",
              ContinuationToken: continuation,
            }),
          );
          if (values.Contents?.length) {
            const result = await s3.client.send(
              new DeleteObjectsCommand({
                Bucket: s3.bucket,
                Delete: {
                  Objects: values.Contents.map((v) => ({ Key: v.Key! })),
                },
              }),
            );
            if (result.Errors?.length) throw new Error("STORAGE_DELETE_FAILED");
          }
          continuation = values.NextContinuationToken;
        } while (continuation);
      } else {
        const target = localPath(prefix);
        if (!target.startsWith(streamRoot + path.sep))
          throw new Error("UNSAFE_DELETE_PATH");
        await rm(target, { recursive: true, force: true });
      }
    },
  };
}
export async function readSubtitleStorage(key: string, provider: string) {
  safeKey(key);
  if (provider === "S3") return storage("S3").read(key);
  if (!/^[a-z0-9-]+\.vtt$/.test(key)) throw new Error("INVALID_SUBTITLE_KEY");
  return readFile(path.resolve(".local/media", key));
}
export async function listFiles(root: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(path.join(root, prefix), {
    withFileTypes: true,
  });
  const result: string[] = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink()) throw new Error("UNEXPECTED_MEDIA_LINK");
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) result.push(...(await listFiles(root, relative)));
    else result.push(relative);
  }
  return result;
}
