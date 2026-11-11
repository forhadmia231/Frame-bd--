import "server-only";
import { createHash } from "node:crypto";
import { getDb } from "./db";
import { ApiError } from "./api";

export async function consumeRateLimit(
  key: string,
  max: number,
  windowSeconds: number,
) {
  const digest = createHash("sha256").update(key).digest("hex");
  const resetAt = new Date(Date.now() + windowSeconds * 1000);
  const rows = await getDb().$queryRaw<{ count: number; resetAt: Date }[]>`
    INSERT INTO "ApiRateLimit" ("key", "count", "resetAt") VALUES (${digest}, 1, ${resetAt})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "ApiRateLimit"."resetAt" <= NOW() THEN 1 ELSE "ApiRateLimit"."count" + 1 END,
      "resetAt" = CASE WHEN "ApiRateLimit"."resetAt" <= NOW() THEN EXCLUDED."resetAt" ELSE "ApiRateLimit"."resetAt" END
    RETURNING "count", "resetAt"`;
  return {
    allowed: rows[0].count <= max,
    retryAfter:
      rows[0].count > max
        ? Math.max(
            1,
            Math.ceil((rows[0].resetAt.getTime() - Date.now()) / 1000),
          )
        : null,
  };
}
export async function rateLimit(key: string, max = 60, window = 60) {
  const result = await consumeRateLimit(key, max, window);
  if (!result.allowed)
    throw new ApiError(
      429,
      "RATE_LIMITED",
      "Too many attempts. Please try again later.",
    );
}
