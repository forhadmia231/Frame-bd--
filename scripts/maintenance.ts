import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
try {
  const now = new Date();
  const [sessions, tokens, counters, playback] = await db.$transaction([
    db.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.verification.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.apiRateLimit.deleteMany({ where: { resetAt: { lt: now } } }),
    db.playbackSession.deleteMany({ where: { expiresAt: { lt: now } } }),
  ]);
  console.log({
    expiredSessionsRemoved: sessions.count,
    expiredTokensRemoved: tokens.count,
    expiredRateWindowsRemoved: counters.count,
    expiredPlaybackSessionsRemoved: playback.count,
  });
} finally {
  await db.$disconnect();
}
