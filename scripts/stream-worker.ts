import "dotenv/config";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, rm, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { getDb } from "../src/lib/db";
import { storage, listFiles } from "../src/modules/streaming/storage";
const require = createRequire(import.meta.url);
const ffmpeg = process.env.FFMPEG_PATH || (require("ffmpeg-static") as string);
const ffprobe =
  process.env.FFPROBE_PATH ||
  (require("@ffprobe-installer/ffprobe") as { path: string }).path;
const workRoot = path.resolve(
  process.env.TRANSCODE_WORK_DIR || ".local/transcode",
);
const db = getDb();
const requestedJob =
  process.argv.find((arg) => arg.startsWith("--job="))?.slice(6) || null;
if (requestedJob && !/^[a-zA-Z0-9-]+$/.test(requestedJob))
  throw new Error("Invalid job ID.");
if (
  process.env.NODE_ENV === "production" &&
  (!process.env.FFMPEG_PATH || !process.env.FFPROBE_PATH)
)
  throw new Error(
    "Production workers require explicitly configured, maintained FFmpeg/FFprobe binaries.",
  );
type Probe = {
  format: { duration: string };
  streams: {
    codec_type: string;
    width?: number;
    height?: number;
    tags?: { language?: string; title?: string };
  }[];
};
function run(
  binary: string,
  args: string[],
  signal?: AbortSignal,
  progress?: (seconds: number) => void,
) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(binary, args, {
      windowsHide: true,
      shell: false,
      env: {
        NODE_ENV: process.env.NODE_ENV || "development",
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
      },
      signal,
    });
    const timeout = setTimeout(
      () => {
        child.kill();
        reject(new Error("TRANSCODE_TIMEOUT"));
      },
      Number(process.env.TRANSCODE_TIMEOUT_SECONDS || 10800) * 1000,
    );
    timeout.unref();
    let output = "",
      line = "";
    child.stdout.on("data", (chunk) => {
      if (!progress) {
        output += chunk.toString();
        if (output.length > 2000000) child.kill();
      } else {
        line += chunk.toString();
        const lines = line.split("\n");
        line = lines.pop() || "";
        for (const value of lines) {
          const matched = value.match(/^out_time_us=(\d+)/);
          if (matched) progress(Number(matched[1]) / 1000000);
        }
      }
    });
    child.stderr.resume();
    child.once("error", () => {
      clearTimeout(timeout);
      reject(new Error("TRANSCODER_UNAVAILABLE"));
    });
    child.once("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve(output);
      else reject(new Error("TRANSCODE_FAILED"));
    });
  });
}
async function claim() {
  await db.videoJob.updateMany({
    where: {
      status: "PROCESSING",
      leaseExpiresAt: { lt: new Date() },
      attempts: { gte: 3 },
    },
    data: { status: "FAILED", errorCode: "WORKER_LEASE_EXPIRED" },
  });
  const token = randomUUID();
  const rows = await db.$queryRaw<
    { id: string }[]
  >`UPDATE "VideoJob" SET status='PROCESSING', "leaseToken"=${token}, "leaseExpiresAt"=NOW()+INTERVAL '2 minutes', attempts=attempts+1, progress=0, "errorCode"=NULL,"updatedAt"=NOW() WHERE id=(SELECT id FROM "VideoJob" WHERE (status='QUEUED' OR (status='PROCESSING' AND "leaseExpiresAt"<NOW())) AND attempts<3 AND (${requestedJob}::text IS NULL OR id=${requestedJob}) ORDER BY "createdAt" FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING id`;
  return rows[0] ? { id: rows[0].id, token } : null;
}
export async function processOne() {
  const reservation = await claim();
  if (!reservation) return false;
  const job = await db.videoJob.findUniqueOrThrow({
    where: { id: reservation.id },
    include: { sourceMedia: true },
  });
  const work = path.resolve(workRoot, job.id + "-" + reservation.token);
  if (!work.startsWith(workRoot + path.sep))
    throw new Error("UNSAFE_WORK_PATH");
  const prefix = `hls/${job.id}/${reservation.token}`;
  const store = storage(job.sourceMedia.provider);
  const controller = new AbortController();
  let percent = 1,
    lastProgress = 0;
  const heartbeat = setInterval(() => {
    db.videoJob
      .updateMany({
        where: {
          id: job.id,
          status: "PROCESSING",
          leaseToken: reservation.token,
        },
        data: {
          leaseExpiresAt: new Date(Date.now() + 120000),
          progress: percent,
        },
      })
      .then((result) => {
        if (!result.count) controller.abort();
      })
      .catch(() => controller.abort());
  }, 15000);
  try {
    await mkdir(work, { recursive: true });
    const source = path.join(work, "source");
    await store.download(job.sourceMedia.storageKey, source);
    if ((await stat(source)).size !== Number(job.sourceMedia.bytes))
      throw new Error("SOURCE_SIZE_MISMATCH");
    const restrictions = [
      "-protocol_whitelist",
      "file,pipe",
      "-format_whitelist",
      "mov,matroska,webm",
    ];
    const probe = JSON.parse(
      await run(
        ffprobe,
        [
          "-v",
          "error",
          ...restrictions,
          "-show_streams",
          "-show_format",
          "-of",
          "json",
          source,
        ],
        controller.signal,
      ),
    ) as Probe;
    const video = probe.streams.find((s) => s.codec_type === "video");
    const duration = Number(probe.format.duration);
    if (
      !video?.height ||
      !video.width ||
      video.width * video.height > 33177600 ||
      !Number.isFinite(duration) ||
      duration <= 0 ||
      duration > 28800
    )
      throw new Error("UNSUPPORTED_SOURCE");
    let heights = [360, 480, 720, 1080].filter((h) => h <= video.height!);
    if (!heights.length)
      heights = [Math.max(2, Math.floor(video.height / 2) * 2)];
    const audios = probe.streams
      .filter((s) => s.codec_type === "audio")
      .slice(0, 4);
    const output = path.join(work, "output");
    await mkdir(output, { recursive: true });
    const total = heights.length + audios.length;
    let done = 0;
    const input = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-nostdin",
      "-y",
      ...restrictions,
      "-i",
      source,
    ];
    const manifest = [
      "#EXTM3U",
      "#EXT-X-VERSION:3",
      "#EXT-X-INDEPENDENT-SEGMENTS",
    ];
    const onProgress = (seconds: number) => {
      percent = Math.min(
        85,
        5 +
          Math.floor(
            ((done + Math.min(1, seconds / duration)) / Math.max(1, total)) *
              80,
          ),
      );
      if (Date.now() - lastProgress > 4000) {
        lastProgress = Date.now();
        void db.videoJob
          .updateMany({
            where: {
              id: job.id,
              leaseToken: reservation.token,
              status: "PROCESSING",
            },
            data: { progress: percent },
          })
          .catch(() => {});
      }
    };
    for (let i = 0; i < audios.length; i++) {
      const folder = `audio_${i}`;
      await mkdir(path.join(output, folder));
      await run(
        ffmpeg,
        [
          ...input,
          "-map",
          `0:a:${i}`,
          "-vn",
          "-c:a",
          "aac",
          "-ac",
          "2",
          "-ar",
          "48000",
          "-b:a",
          "128k",
          "-threads",
          "2",
          "-f",
          "hls",
          "-hls_time",
          "4",
          "-hls_playlist_type",
          "vod",
          "-hls_list_size",
          "0",
          "-hls_segment_filename",
          path.join(output, folder, "seg_%06d.ts"),
          "-progress",
          "pipe:1",
          path.join(output, folder, "index.m3u8"),
        ],
        controller.signal,
        onProgress,
      );
      const language = (audios[i].tags?.language || `audio-${i + 1}`).replace(
        /[^a-zA-Z0-9-]/g,
        "",
      );
      manifest.push(
        `#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="${language} ${i + 1}",LANGUAGE="${language}",DEFAULT=${i === 0 ? "YES" : "NO"},AUTOSELECT=YES,URI="${folder}/index.m3u8"`,
      );
      done++;
    }
    for (const height of heights) {
      const folder = `${height}p`;
      await mkdir(path.join(output, folder));
      const width = Math.ceil(((video.width / video.height) * height) / 2) * 2;
      const bitrate =
        height >= 1080
          ? 5000
          : height >= 720
            ? 2800
            : height >= 480
              ? 1400
              : 800;
      await run(
        ffmpeg,
        [
          ...input,
          "-map",
          "0:v:0",
          "-an",
          "-vf",
          `scale=${width}:${height},setsar=1`,
          "-c:v",
          "libx264",
          "-preset",
          process.env.TRANSCODE_PRESET || "veryfast",
          "-profile:v",
          "main",
          "-level:v",
          "4.1",
          "-pix_fmt",
          "yuv420p",
          "-r",
          "30",
          "-g",
          "120",
          "-keyint_min",
          "120",
          "-sc_threshold",
          "0",
          "-force_key_frames",
          "expr:gte(t,n_forced*4)",
          "-b:v",
          `${bitrate}k`,
          "-maxrate",
          `${Math.floor(bitrate * 1.1)}k`,
          "-bufsize",
          `${bitrate * 2}k`,
          "-threads",
          "2",
          "-f",
          "hls",
          "-hls_time",
          "4",
          "-hls_list_size",
          "0",
          "-hls_playlist_type",
          "vod",
          "-hls_flags",
          "independent_segments",
          "-hls_segment_filename",
          path.join(output, folder, "seg_%06d.ts"),
          "-progress",
          "pipe:1",
          path.join(output, folder, "index.m3u8"),
        ],
        controller.signal,
        onProgress,
      );
      manifest.push(
        `#EXT-X-STREAM-INF:BANDWIDTH=${(bitrate + (audios.length ? 128 : 0)) * 1100},AVERAGE-BANDWIDTH=${(bitrate + (audios.length ? 128 : 0)) * 1000},RESOLUTION=${width}x${height},CODECS="avc1.4d4029${audios.length ? ",mp4a.40.2" : ""}"${audios.length ? ',AUDIO="audio"' : ""}`,
        `${folder}/index.m3u8`,
      );
      done++;
    }
    await writeFile(
      path.join(output, "master.m3u8"),
      manifest.join("\n") + "\n",
    );
    if (process.env.STREAM_THUMBNAILS === "true")
      await run(
        ffmpeg,
        [
          ...input,
          "-ss",
          String(Math.min(1, duration / 3)),
          "-frames:v",
          "1",
          "-vf",
          "scale=320:-2",
          path.join(output, "preview.jpg"),
        ],
        controller.signal,
      );
    const files = await listFiles(output);
    for (const file of files.filter((f) => f.endsWith(".m3u8"))) {
      const playlist = await readFile(path.join(output, file), "utf8");
      if (
        !playlist.startsWith("#EXTM3U") ||
        (file !== "master.m3u8" && !playlist.includes("#EXT-X-ENDLIST"))
      )
        throw new Error("INVALID_GENERATED_PLAYLIST");
      const referenced = [
        ...playlist.split("\n").filter((v) => v && !v.startsWith("#")),
        ...Array.from(playlist.matchAll(/URI="([^"]+)"/g), (m) => m[1]),
      ];
      for (const relative of referenced) {
        if (
          relative.startsWith("/") ||
          relative.includes("..") ||
          relative.includes(":") ||
          !files.includes(path.posix.join(path.posix.dirname(file), relative))
        )
          throw new Error("INVALID_GENERATED_SEGMENT");
      }
    }
    for (let index = 0; index < files.length; index++) {
      if (controller.signal.aborted) throw new Error("WORKER_LEASE_LOST");
      const file = files[index];
      await store.putFile(
        `${prefix}/${file}`,
        path.join(output, file),
        file.endsWith(".m3u8")
          ? "application/vnd.apple.mpegurl"
          : file.endsWith(".jpg")
            ? "image/jpeg"
            : "video/mp2t",
      );
      percent = 85 + Math.floor(((index + 1) / files.length) * 14);
    }
    await db.$transaction(async (tx) => {
      const result = await tx.videoJob.updateMany({
        where: {
          id: job.id,
          leaseToken: reservation.token,
          status: "PROCESSING",
        },
        data: {
          status: "READY",
          progress: 100,
          duration,
          resolutions: heights,
          outputPrefix: prefix,
          leaseExpiresAt: null,
          errorCode: null,
        },
      });
      if (!result.count) throw new Error("WORKER_LEASE_LOST");
      await tx.contentAsset.create({
        data: {
          contentId: job.contentId,
          episodeId: job.episodeId,
          kind: "HLS",
          privateStorageKey: `${prefix}/master.m3u8`,
          ready: true,
          videoJobId: job.id,
        },
      });
      if (job.episodeId)
        await tx.episode.update({
          where: { id: job.episodeId },
          data: { duration: Math.max(1, Math.ceil(duration / 60)) },
        });
      else
        await tx.content.update({
          where: { id: job.contentId },
          data: { duration: Math.max(1, Math.ceil(duration / 60)) },
        });
      await tx.auditLog.create({
        data: {
          action: "VIDEO_PROCESSING_READY",
          resourceId: job.id,
          metadata: {
            resolutions: heights,
            duration: Math.round(duration),
            files: files.length,
          },
        },
      });
    });
    console.log(`Video job ${job.id}: READY (${heights.join(",")}p).`);
  } catch (error) {
    const code =
      error instanceof Error && /^[A-Z_]+$/.test(error.message)
        ? error.message
        : "PROCESSING_FAILED";
    await db.videoJob.updateMany({
      where: {
        id: job.id,
        leaseToken: reservation.token,
        status: "PROCESSING",
      },
      data: {
        status: "FAILED",
        errorCode: code,
        progress: 0,
        leaseExpiresAt: null,
      },
    });
    await db.auditLog.create({
      data: {
        action: "VIDEO_PROCESSING_FAILED",
        resourceId: job.id,
        metadata: { code },
      },
    });
    await store.removePrefix(prefix).catch(() => {});
    console.error(`Video job ${job.id}: ${code}.`);
  } finally {
    clearInterval(heartbeat);
    if (work.startsWith(workRoot + path.sep))
      await rm(work, { recursive: true, force: true });
  }
  return true;
}
if (process.argv.includes("--once")) {
  await processOne();
  await db.$disconnect();
} else {
  console.log("Frame BD media worker started.");
  let stopping = false;
  process.on("SIGINT", () => {
    stopping = true;
  });
  process.on("SIGTERM", () => {
    stopping = true;
  });
  while (!stopping) {
    try {
      if (!(await processOne())) await new Promise((r) => setTimeout(r, 3000));
    } catch {
      console.error("Worker database/storage unavailable; retrying.");
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  await db.$disconnect();
}
