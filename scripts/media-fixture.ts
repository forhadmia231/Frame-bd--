import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
const require = createRequire(import.meta.url);
export async function generateOwnedSample(filename: string, seconds = 12) {
  await mkdir(path.dirname(filename), { recursive: true });
  const binary =
    process.env.FFMPEG_PATH || (require("ffmpeg-static") as string);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      binary,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-nostdin",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "testsrc2=size=1280x720:rate=30",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:sample_rate=48000",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=880:sample_rate=48000",
        "-t",
        String(seconds),
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-map",
        "2:a:0",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-crf",
        "29",
        "-threads",
        "2",
        "-c:a",
        "aac",
        "-b:a",
        "96k",
        "-metadata:s:a:0",
        "language=eng",
        "-metadata:s:a:1",
        "language=ben",
        "-movflags",
        "+faststart",
        filename,
      ],
      { windowsHide: true, timeout: 120000, stdio: "ignore" },
    );
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error("Synthetic sample generation failed.")),
    );
  });
}
