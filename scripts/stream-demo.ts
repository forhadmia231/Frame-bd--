import "dotenv/config";
import path from "node:path";
import { stat, mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { getDb } from "../src/lib/db";
import { storage, storageProvider } from "../src/modules/streaming/storage";
import { generateOwnedSample } from "./media-fixture";
if (
  storageProvider() !== "LOCAL" ||
  !["localhost", "127.0.0.1"].includes(
    new URL(process.env.BETTER_AUTH_URL!).hostname,
  )
)
  throw new Error(
    "The synthetic streaming demo is restricted to explicit loopback local storage.",
  );
const db = getDb(),
  slug = "frame-bd-streaming-lab";
try {
  let content = await db.content.findUnique({
    where: { slug },
    include: {
      assets: { where: { kind: "HLS", ready: true }, select: { id: true } },
    },
  });
  if (content && !content.isDemo)
    throw new Error(
      "Existing non-demo title retained. Choose another sample slug.",
    );
  if (content?.assets.length) {
    console.log(
      "Authorized generated sample is ready: http://localhost:3000/watch/" +
        slug,
    );
    process.exitCode = 0;
  } else {
    const filename = path.resolve(
      ".local/fixtures/frame-bd-generated-pattern.mp4",
    );
    await generateOwnedSample(filename, 24);
    const genre = await db.genre.upsert({
      where: { slug: "streaming-lab" },
      create: { slug: "streaming-lab", name: "Streaming Lab" },
      update: {},
    });
    if (!content)
      content = await db.content.create({
        data: {
          slug,
          title: "Frame BD Streaming Lab",
          tagline: "Generated test pattern · owned sample · two test tones",
          description:
            "An original generated color-motion test pattern and synthetic audio tones, made locally to demonstrate secure adaptive streaming. This is a technical sample, not a movie.",
          type: "MOVIE",
          status: "PUBLISHED",
          publishedAt: new Date(),
          releaseYear: 2026,
          duration: 1,
          posterPath: "/artwork/mountains.jpg",
          isDemo: true,
          genres: { create: { genreId: genre.id } },
        },
        include: {
          assets: { where: { kind: "HLS", ready: true }, select: { id: true } },
        },
      });
    const key = `originals/${randomUUID()}/source`;
    await storage("LOCAL").putFile(key, filename, "video/mp4");
    const media = await db.mediaUpload.create({
      data: {
        name: "Original generated Frame BD test pattern",
        kind: "VIDEO",
        mime: "video/mp4",
        bytes: BigInt((await stat(filename)).size),
        storageKey: key,
        provider: "LOCAL",
        status: "UPLOADED",
      },
    });
    const job = await db.videoJob.create({
      data: { contentId: content.id, sourceMediaId: media.id },
    });
    await db.auditLog.create({
      data: {
        action: "OWNED_STREAMING_DEMO_GENERATED",
        resourceId: job.id,
        metadata: {
          rights: "Locally generated original test pattern and synthetic tones",
        },
      },
    });
    const result = spawnSync(
      process.execPath,
      [
        "--conditions=react-server",
        "--import",
        "tsx",
        "scripts/stream-worker.ts",
        "--once",
        `--job=${job.id}`,
      ],
      { windowsHide: true, stdio: "inherit", timeout: 180000 },
    );
    if (result.status !== 0) throw new Error("Sample worker could not finish.");
    if (
      (await db.videoJob.findUniqueOrThrow({ where: { id: job.id } }))
        .status !== "READY"
    )
      throw new Error("Sample processing did not become ready.");
    console.log(
      "Authorized generated sample is ready: http://localhost:3000/watch/" +
        slug,
    );
  }
  const demo = await db.content.findUniqueOrThrow({ where: { slug } });
  if (
    !(await db.subtitle.findFirst({
      where: {
        contentId: demo.id,
        language: "English",
        privateStorageKey: { not: null },
      },
    }))
  ) {
    const key = randomUUID() + ".vtt";
    const captions =
      "WEBVTT\n\n00:00:00.000 --> 00:00:12.000\nFrame BD · Original generated streaming sample\n\n00:00:12.000 --> 00:00:24.000\nSecure HLS · Adaptive video · Authorized test tones\n";
    await mkdir(".local/media", { recursive: true });
    await writeFile(path.resolve(".local/media", key), captions);
    await db.mediaUpload.create({
      data: {
        name: "Owned Streaming Lab English captions",
        kind: "SUBTITLE",
        mime: "text/vtt",
        bytes: BigInt(Buffer.byteLength(captions)),
        provider: "LOCAL",
        status: "READY",
        storageKey: key,
      },
    });
    await db.subtitle.create({
      data: { contentId: demo.id, language: "English", privateStorageKey: key },
    });
  }
} finally {
  await db.$disconnect();
}
