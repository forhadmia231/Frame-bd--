import { endpoint, ok } from "@/lib/api";
import { getDb } from "@/lib/db";
import { emailConfigured } from "@/modules/auth/email";
import { getEnv } from "@/lib/env";
export const dynamic = "force-dynamic";
export function GET() {
  return endpoint(async () => {
    await getDb().$queryRaw`SELECT 1`;
    return ok({
      database: "connected",
      emailConfigured: emailConfigured(),
      emailMode: getEnv().EMAIL_DELIVERY_MODE,
      streamingConfigured: !!(await getDb().videoJob.count({where:{status:'READY'}})),
      checkoutEnabled: false,
    });
  });
}
