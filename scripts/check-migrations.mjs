import "dotenv/config";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import pg from "pg";

const url = new URL(process.env.DIRECT_URL || "");
if (
  !["localhost", "127.0.0.1"].includes(url.hostname) ||
  url.port !== "55432" ||
  url.pathname !== "/frame_bd"
)
  throw new Error(
    "Migration replay requires the isolated local database administrator.",
  );
const name = `frame_bd_migration_check_${randomUUID().replaceAll("-", "")}`;
const client = new pg.Client({ connectionString: url.href });
await client.connect();
try {
  await client.query(`CREATE DATABASE "${name}"`);
  url.pathname = "/" + name;
  const env = { ...process.env, DIRECT_URL: url.href, DATABASE_URL: url.href };
  for (const args of [
    ["migrate", "deploy", "--config", "prisma.config.ts"],
    [
      "migrate",
      "diff",
      "--from-config-datasource",
      "--to-schema",
      "prisma/schema.prisma",
      "--config",
      "prisma.config.ts",
      "--exit-code",
    ],
  ]) {
    const result = spawnSync(
      process.execPath,
      ["node_modules/prisma/build/index.js", ...args],
      { env, encoding: "utf8", windowsHide: true, timeout: 120000 },
    );
    if (result.status !== 0)
      throw new Error(
        `Migration replay/schema comparison failed: ${result.stderr || result.stdout}`,
      );
  }
  console.log(
    "All migrations replayed into a fresh disposable database; schema has no drift.",
  );
} finally {
  await client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await client.end();
}
