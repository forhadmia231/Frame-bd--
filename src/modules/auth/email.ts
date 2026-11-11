import "server-only";
import nodemailer from "nodemailer";
import { getEnv } from "@/lib/env";
import { ApiError } from "@/lib/api";

export function emailConfigured() {
  const env = getEnv();
  return !!(env.SMTP_HOST && env.EMAIL_FROM);
}
export async function sendAuthEmail(to: string, subject: string, url: string) {
  const env = getEnv();
  if (!emailConfigured())
    throw new ApiError(
      503,
      "EMAIL_NOT_CONFIGURED",
      "Email verification and recovery await SMTP configuration.",
    );
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE === "true",
    ...(env.SMTP_USER
      ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } }
      : {}),
    connectionTimeout: 5000,
    socketTimeout: 5000,
    requireTLS:
      env.EMAIL_DELIVERY_MODE !== "local" && env.SMTP_SECURE !== "true",
  });
  await transport.sendMail({
    from: env.EMAIL_FROM,
    to,
    subject,
    text: `${subject}\n\n${url}\n\nIf you did not request this, ignore this email.\n${env.EMAIL_DELIVERY_MODE === "local" ? "LOCAL DEVELOPMENT MAIL — no internet delivery." : "Frame BD"}`,
  });
}
