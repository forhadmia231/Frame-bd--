import "dotenv/config";
import pg from "pg";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
const url = new URL(process.env.DIRECT_URL || "");
if (
  url.hostname !== "127.0.0.1" ||
  url.port !== "55432" ||
  url.pathname !== "/frame_bd"
)
  throw new Error(
    "This helper is restricted to the isolated Frame BD local database.",
  );
const client = new pg.Client({ connectionString: url.toString() });
await client.connect();
try {
  const exists = await client.query(
    "SELECT 1 FROM pg_roles WHERE rolname = $1",
    ["frame_bd_app"],
  );
  const current = new URL(process.env.DATABASE_URL || "");
  if (!exists.rowCount) {
    const password = randomBytes(32).toString("hex");
    // The generated password is hex-only; role and identifier are fixed literals.
    await client.query(
      `CREATE ROLE frame_bd_app LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION`,
    );
    const runtime = new URL(url);
    runtime.username = "frame_bd_app";
    runtime.password = password;
    const text = readFileSync(".env", "utf8").replace(
      /^DATABASE_URL=.*$/m,
      `DATABASE_URL=${runtime}`,
    );
    writeFileSync(".env", text, { mode: 0o600 });
  } else if (current.username !== "frame_bd_app")
    throw new Error(
      "Existing runtime role retained; configure its credentials manually.",
    );
  await client.query("GRANT CONNECT ON DATABASE frame_bd TO frame_bd_app");
  await client.query("GRANT USAGE ON SCHEMA public TO frame_bd_app");
  await client.query(
    "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO frame_bd_app",
  );
  await client.query(
    "GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO frame_bd_app",
  );
  await client.query(
    "ALTER DEFAULT PRIVILEGES FOR ROLE frame_bd IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO frame_bd_app",
  );
  await client.query(
    "ALTER DEFAULT PRIVILEGES FOR ROLE frame_bd IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO frame_bd_app",
  );
  await client.query(
    'REVOKE ALL ON TABLE "_prisma_migrations" FROM frame_bd_app',
  );
  console.log(
    "Runtime now uses a non-superuser DML-only database role. Direct migration credentials are separate; no secret values printed.",
  );
} finally {
  await client.end();
}
