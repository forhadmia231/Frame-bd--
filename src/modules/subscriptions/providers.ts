import "server-only";
import Stripe from "stripe";
import { getEnv } from "@/lib/env";
import { ApiError } from "@/lib/api";

export type VerifiedPaymentEvent = {
  eventId: string;
  type: "paid" | "refunded" | "ignored";
  reference: string;
  amount: number;
  currency: string;
  liveMode: boolean;
};
export interface PaymentProvider {
  verify(raw: string, headers: Headers): VerifiedPaymentEvent;
}
export class StripeProvider implements PaymentProvider {
  constructor(
    private readonly stripe: Stripe,
    private readonly secret: string,
  ) {}
  verify(raw: string, headers: Headers): VerifiedPaymentEvent {
    const signature = headers.get("stripe-signature");
    if (!signature)
      throw new ApiError(
        400,
        "INVALID_SIGNATURE",
        "Missing payment signature.",
      );
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(
        raw,
        signature,
        this.secret,
        300,
      );
    } catch {
      throw new ApiError(
        400,
        "INVALID_SIGNATURE",
        "Payment signature verification failed.",
      );
    }
    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      const session = event.data.object as Stripe.Checkout.Session;
      return {
        eventId: event.id,
        type:
          session.payment_status === "paid" && session.mode === "payment"
            ? "paid"
            : "ignored",
        reference: session.id,
        amount: session.amount_total || 0,
        currency: (session.currency || "").toUpperCase(),
        liveMode: event.livemode,
      };
    }
    if (event.type === "charge.refunded") {
      const charge = event.data.object as Stripe.Charge;
      // Checkout reference is stored as the payment-intent reference in provider metadata at creation.
      return {
        eventId: event.id,
        type: charge.amount_refunded > 0 ? "refunded" : "ignored",
        reference: charge.metadata.frameBdCheckoutReference || "",
        amount: charge.amount_refunded,
        currency: charge.currency.toUpperCase(),
        liveMode: event.livemode,
      };
    }
    return {
      eventId: event.id,
      type: "ignored",
      reference: "",
      amount: 0,
      currency: "",
      liveMode: event.livemode,
    };
  }
}
export function paymentProvider(name: string): PaymentProvider {
  const env = getEnv();
  if (name !== "stripe" || !env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET)
    throw new ApiError(
      503,
      "PAYMENT_NOT_CONFIGURED",
      "This payment provider is not configured. No payment or subscription can be activated.",
    );
  return new StripeProvider(
    new Stripe(env.STRIPE_SECRET_KEY),
    env.STRIPE_WEBHOOK_SECRET,
  );
}
// bKash, Nagad and Rocket must implement this interface against their approved
// merchant APIs and documented verification protocol. No guessed HMAC/OTP verifier.
