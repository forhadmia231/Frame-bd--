import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, ".local", "postgres");
const envPath = path.join(root, ".env");
const bin = process.env.POSTGRES_BIN || "C:/Program Files/PostgreSQL/17/bin";
const command = process.argv[2] || "start";
const run = (name, args, env) =>
  spawnSync(path.join(bin, name + ".exe"), args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    timeout: 60000,
    stdio: name === "pg_ctl" ? "ignore" : "pipe",
    env: { ...process.env, ...env },
  });
mkdirSync(path.dirname(dir), { recursive: true });
if (command === "stop") {
  const result = run("pg_ctl", ["-D", dir, "-m", "fast", "-w", "stop"]);
  console.log(
    result.status === 0
      ? "Project-local PostgreSQL stopped."
      : "Project-local PostgreSQL is not running.",
  );
  process.exit(result.status || 0);
}
if (!existsSync(path.join(dir, "PG_VERSION"))) {
  if (existsSync(envPath))
    throw new Error(
      "Existing .env retained. Configure its database manually; local setup will not overwrite credentials.",
    );
  const password = randomBytes(32).toString("hex");
  const pwFile = path.join(root, ".local", "postgres-password");
  writeFileSync(pwFile, password, { mode: 0o600 });
  const result = run("initdb", [
    "-D",
    dir,
    "-U",
    "frame_bd",
    "--encoding=UTF8",
    "--locale=C",
    "--auth=scram-sha-256",
    "--pwfile=" + pwFile,
  ]);
  if (result.status !== 0) {
    console.error("Local cluster initialization failed.", result.stderr);
    process.exit(1);
  }
  const url = `postgresql://frame_bd:${password}@127.0.0.1:55432/frame_bd`;
  writeFileSync(
    envPath,
    `DATABASE_URL=${url}\nDIRECT_URL=${url}\nBETTER_AUTH_SECRET=${randomBytes(48).toString("base64url")}\nBETTER_AUTH_URL=http://localhost:3000\nAPP_REGION=BD\nSMTP_HOST=127.0.0.1\nSMTP_PORT=1025\nSMTP_SECURE=false\nEMAIL_FROM=Frame BD <no-reply@framebd.local>\nEMAIL_DELIVERY_MODE=local\n`,
    { mode: 0o600 },
  );
}
if (run("pg_ctl", ["-D", dir, "status"]).status !== 0) {
  const result = run("pg_ctl", [
    "-D",
    dir,
    "-l",
    path.join(root, ".local", "postgres.log"),
    "-o",
    "-p 55432 -h 127.0.0.1",
    "-w",
    "start",
  ]);
  if (result.status !== 0) {
    console.error("Local PostgreSQL could not start.", result.stderr);
    process.exit(1);
  }
}
const password = readFileSync(
  path.join(root, ".local", "postgres-password"),
  "utf8",
);
const result = run(
  "psql",
  [
    "-h",
    "127.0.0.1",
    "-p",
    "55432",
    "-U",
    "frame_bd",
    "-d",
    "postgres",
    "-tAc",
    "SELECT 1 FROM pg_database WHERE datname = 'frame_bd'",
  ],
  { PGPASSWORD: password },
);
if (!result.stdout.trim()) {
  const create = run(
    "createdb",
    ["-h", "127.0.0.1", "-p", "55432", "-U", "frame_bd", "frame_bd"],
    { PGPASSWORD: password },
  );
  if (create.status !== 0)
    throw new Error("Could not create project database.");
}
console.log(
  "Project-local PostgreSQL ready on 127.0.0.1:55432. Credentials stored privately in .env; system databases unchanged.",
);
