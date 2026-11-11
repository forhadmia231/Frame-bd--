import "server-only";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { getDb } from "./db";
import { getEnv } from "./env";
import { consumeRateLimit } from "./rate-limit";
import { sendAuthEmail } from "@/modules/auth/email";

function createAuth() {
  const env = getEnv();
  return betterAuth({
    logger: { level: "error" },
    appName: "Frame BD",
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: prismaAdapter(getDb(), {
      provider: "postgresql",
      transaction: true,
    }),
    trustedOrigins: [new URL(env.BETTER_AUTH_URL).origin],
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      autoSignIn: false,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) =>
        sendAuthEmail(user.email, "Reset your Frame BD password", url),
      onPasswordReset: async ({ user }) => {
        await getDb().auditLog.create({
          data: { userId: user.id, action: "PASSWORD_RESET" },
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: false,
      autoSignInAfterVerification: false,
      expiresIn: 3600,
      sendVerificationEmail: async ({ user, url }) =>
        sendAuthEmail(user.email, "Verify your Frame BD email", url),
    },
    user: {
      additionalFields: {
        role: {
          type: ["USER", "ADMIN", "SUPER_ADMIN"],
          defaultValue: "USER",
          input: false,
        },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: false },
    },
    advanced: {
      useSecureCookies: env.BETTER_AUTH_URL.startsWith("https://"),
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax" },
      ipAddress: {
        ipAddressHeaders: env.TRUST_PROXY === "true" ? ["x-real-ip"] : [],
      },
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 100,
      customStorage: {
        consume: (key, rule) =>
          consumeRateLimit(`auth:${key}`, rule.max, rule.window),
      },
    },
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            const user = await getDb().user.findUnique({
              where: { id: session.userId },
              select: { suspendedAt: true },
            });
            if (!user || user.suspendedAt)
              throw new APIError("FORBIDDEN", {
                message: "This account is unavailable. Contact support.",
              });
            return { data: session };
          },
          after: async (session) => {
            await getDb().auditLog.create({
              data: { userId: session.userId, action: "SESSION_CREATED" },
            });
          },
        },
        delete: {
          after: async (session) => {
            await getDb().auditLog.create({
              data: { userId: session.userId, action: "SESSION_REVOKED" },
            });
          },
        },
      },
    },
  });
}
let instance: ReturnType<typeof createAuth> | undefined;
export function getAuth() {
  return (instance ??= createAuth());
}
