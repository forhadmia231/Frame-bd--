import "server-only";
import { createHash } from "node:crypto";
import { getDb } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { paymentProvider, type PaymentProvider } from "./providers";
import { z } from "zod";

export async function processPaymentWebhook(
  providerName: string,
  raw: string,
  headers: Headers,
  verifier?: PaymentProvider,
) {
  const event = z
    .object({
      eventId: z.string().min(1).max(255),
      type: z.enum(["paid", "refunded", "ignored"]),
      reference: z.string().max(255),
      amount: z.number().int().min(0),
      currency: z.string().max(3),
      liveMode: z.boolean(),
    })
    .parse((verifier || paymentProvider(providerName)).verify(raw, headers));
  const digest = createHash("sha256").update(raw).digest("hex");
  const db = getDb();
  const apply = () =>
    db.$transaction(
      async (tx) => {
        // The insert is inside the same transaction as entitlement changes. A failed
        // event does not consume the event ID, so a corrected provider retry can work.
        await tx.$executeRaw`INSERT INTO "PaymentWebhookEvent" ("id", "provider", "eventId", "digest", "createdAt") VALUES (${crypto.randomUUID()}, ${providerName}, ${event.eventId}, ${digest}, NOW()) ON CONFLICT ("provider", "eventId") DO NOTHING`;
        const record = await tx.paymentWebhookEvent.findUniqueOrThrow({
          where: {
            provider_eventId: {
              provider: providerName,
              eventId: event.eventId,
            },
          },
        });
        if (record.digest !== digest)
          throw new ApiError(
            409,
            "EVENT_CONFLICT",
            "The payment event does not match the recorded event.",
          );
        if (record.processedAt) return { received: true, duplicate: true };
        if (event.type !== "ignored") {
          const payment = await tx.payment.findFirst({
            where: {
              provider: providerName,
              providerReference: event.reference,
            },
            include: { subscription: { include: { plan: true } } },
          });
          if (
            !payment ||
            (event.type === "paid"
              ? payment.amount !== event.amount
              : event.amount <= 0 || event.amount > payment.amount) ||
            payment.currency !== event.currency ||
            payment.userId !== payment.subscription.userId ||
            payment.amount !== payment.subscription.plan.price ||
            payment.currency !== payment.subscription.plan.currency
          )
            throw new ApiError(
              400,
              "PAYMENT_MISMATCH",
              "The event does not match an expected payment.",
            );
          if (event.type === "paid" && payment.status === "PENDING") {
            const now = new Date();
            await tx.payment.update({
              where: { id: payment.id },
              data: {
                status: "VERIFIED",
                liveMode: event.liveMode,
                verifiedAt: now,
              },
            });
            if (event.liveMode)
              await tx.subscription.update({
                where: { id: payment.subscriptionId },
                data: {
                  status: "ACTIVE",
                  startsAt: now,
                  expiresAt: new Date(
                    now.getTime() +
                      payment.subscription.plan.durationDays * 86400000,
                  ),
                },
              });
          } else if (event.type === "refunded") {
            await tx.payment.update({
              where: { id: payment.id },
              data: { status: "REFUNDED" },
            });
            await tx.subscription.update({
              where: { id: payment.subscriptionId },
              data: { status: "REVOKED" },
            });
          }
          await tx.paymentTransaction.create({
            data: {
              paymentId: payment.id,
              providerEventId: `${providerName}:${event.eventId}`,
              kind: event.type,
              amount: event.amount,
              currency: event.currency,
            },
          });
          await tx.auditLog.create({
            data: {
              userId: payment.userId,
              action: `PAYMENT_${event.type.toUpperCase()}`,
              resourceId: payment.id,
            },
          });
        }
        await tx.paymentWebhookEvent.update({
          where: { id: record.id },
          data: { processedAt: new Date() },
        });
        return { received: true, duplicate: false };
      },
      { isolationLevel: "Serializable" },
    );
  for (let attempt = 0; ; attempt++) {
    try {
      return await apply();
    } catch (error) {
      if (attempt >= 2 || (error as { code?: string }).code !== "P2034")
        throw error;
      await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }
}
