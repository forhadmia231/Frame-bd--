import "server-only";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  APP_REGION: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z.enum(["true", "false"]).default("false"),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  EMAIL_DELIVERY_MODE: z.enum(["local", "external"]).default("external"),
  TRUST_PROXY: z.enum(["true", "false"]).default("false"),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  PLAYBACK_SIGNING_SECRET: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(32).optional(),
  ),
  STREAM_LOCAL_STORAGE: z.enum(["true", "false"]).default("false"),
  STREAM_THUMBNAILS: z.enum(["true", "false"]).default("false"),
  TRANSCODE_TIMEOUT_SECONDS: z.coerce
    .number()
    .int()
    .min(30)
    .max(86400)
    .default(10800),
  TRANSCODE_PRESET: z
    .enum([
      "ultrafast",
      "superfast",
      "veryfast",
      "faster",
      "fast",
      "medium",
      "slow",
    ])
    .default("veryfast"),
});
export function getEnv() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success)
    throw new Error(
      "Server configuration is incomplete. Check the documented environment variables.",
    );
  const env = parsed.data;
  if (
    env.EMAIL_DELIVERY_MODE === "local" &&
    !/^(localhost|127\.0\.0\.1)$/.test(new URL(env.BETTER_AUTH_URL).hostname)
  )
    throw new Error(
      "Local SMTP is allowed only on a loopback development origin.",
    );
  if (
    process.env.NODE_ENV === "production" &&
    !new URL(env.BETTER_AUTH_URL).hostname.match(
      /^(localhost|127\.0\.0\.1)$/,
    ) &&
    !env.BETTER_AUTH_URL.startsWith("https://")
  )
    throw new Error("A deployed authentication origin must use HTTPS.");
  return env;
}
