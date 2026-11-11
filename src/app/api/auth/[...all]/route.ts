import { getAuth } from "@/lib/auth";
import { endpoint, sameOrigin, ApiError, readText } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { emailConfigured } from "@/modules/auth/email";
import { z } from "zod";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
async function handler(request: Request) {
  return endpoint(async () => {
    sameOrigin(request);
    const authPath = new URL(request.url).pathname.replace("/api/auth", "");
    const allowedPost = [
      "/sign-up/email",
      "/sign-in/email",
      "/sign-out",
      "/request-password-reset",
      "/reset-password",
      "/send-verification-email",
      "/change-password",
    ];
    if (request.method === "POST" && !allowedPost.includes(authPath))
      throw new ApiError(404, "NOT_FOUND", "Unknown authentication operation.");
    if (
      request.method === "GET" &&
      !["/get-session", "/verify-email"].includes(authPath) &&
      !authPath.startsWith("/reset-password/")
    )
      throw new ApiError(404, "NOT_FOUND", "Unknown authentication operation.");
    if (request.method === "POST") {
      const raw = await readText(request.clone());
      if (Buffer.byteLength(raw) > 16384)
        throw new ApiError(413, "BODY_TOO_LARGE", "Request too large.");
      let input: Record<string, unknown>;
      try {
        input = JSON.parse(raw);
      } catch {
        throw new ApiError(400, "INVALID_JSON", "Invalid JSON body.");
      }
      const path = new URL(request.url).pathname;
      if (path.endsWith("/sign-up/email") || path.endsWith("/sign-in/email")) {
        z.object({
          email: z.email().max(254),
          password: z.string().min(1).max(128),
        }).parse(input);
        if (path.endsWith("/sign-up/email"))
          z.object({
            name: z.string().trim().min(2).max(60),
            password: z.string().min(12).max(128),
          }).parse(input);
        if ("role" in input || "emailVerified" in input)
          throw new ApiError(
            400,
            "READ_ONLY_FIELD",
            "Authorization fields cannot be supplied.",
          );
        await rateLimit(
          `auth-account:${String(input.email).trim().toLowerCase()}:${path}`,
          path.endsWith("/sign-in/email") ? 10 : 5,
          900,
        );
      }
      await rateLimit(`auth-global:${path}`, 200, 60);
      if (
        [
          "/sign-up/email",
          "/request-password-reset",
          "/send-verification-email",
        ].some((suffix) => path.endsWith(suffix)) &&
        !emailConfigured()
      )
        throw new ApiError(
          503,
          "EMAIL_NOT_CONFIGURED",
          "Email verification and recovery await SMTP configuration.",
        );
    }
    const response = await getAuth().handler(request);
    if (
      response.ok &&
      response.headers.get("content-type")?.includes("application/json")
    ) {
      const data = await response.clone().json();
      if (data && typeof data === "object") {
        if (
          authPath === "/sign-up/email" &&
          data.user?.id &&
          (await getDb().user.findUnique({
            where: { id: data.user.id },
            select: { id: true },
          }))
        )
          await getDb().auditLog.create({
            data: { userId: data.user.id, action: "USER_REGISTERED" },
          });
        delete data.token;
        if (data.session) delete data.session.token;
        const headers = new Headers(response.headers);
        headers.set("Cache-Control", "no-store");
        return Response.json(data, { status: response.status, headers });
      }
    }
    return response;
  });
}
export { handler as GET, handler as POST };
