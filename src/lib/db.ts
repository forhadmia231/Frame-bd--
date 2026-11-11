import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { getEnv } from "./env";

const globalDb = globalThis as unknown as { frameDb?: PrismaClient };
export function getDb() {
  if (!globalDb.frameDb) {
    const adapter = new PrismaPg({
      connectionString: getEnv().DATABASE_URL,
      max: 10,
      connectionTimeoutMillis: 5000,
      options: "-c timezone=UTC",
    });
    globalDb.frameDb = new PrismaClient({ adapter });
  }
  return globalDb.frameDb;
}
