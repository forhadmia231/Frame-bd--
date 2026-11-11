"use client";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { useResource } from "@/lib/use-resource";
import { apiFetch } from "@/lib/api-client";
type Membership = {
  premium: boolean;
  subscriptions: {
    id: string;
    status: string;
    expiresAt: string | null;
    cancelAtPeriodEnd: boolean;
    autoRenew: boolean;
    plan: { name: string };
  }[];
};
export function SubscriptionStatus() {
  const { data: session } = authClient.useSession();
  const result = useResource<Membership>(
    "me/subscription",
    session?.user.id || "guest",
    !!session,
  );
  const payments = useResource<
    {
      id: string;
      amount: number;
      currency: string;
      status: string;
      createdAt: string;
    }[]
  >("me/payments", session?.user.id || "guest", !!session);
  const [message, setMessage] = useState("");
  if (!session) return null;
  return (
    <section className="settings-panel">
      <h2>Your membership</h2>
      <p>
        {result.loading
          ? "Checking membership…"
          : result.error ||
            (result.data?.premium
              ? "Active, verified premium membership"
              : "Free membership — no active verified premium entitlement")}
      </p>
      {result.data?.subscriptions.map((subscription) => (
        <div key={subscription.id}>
          <h3>{subscription.plan.name}</h3>
          <p>
            {subscription.expiresAt &&
            new Date(subscription.expiresAt) <= new Date()
              ? "EXPIRED"
              : subscription.status}{" "}
            {subscription.expiresAt &&
              `· Ends ${new Date(subscription.expiresAt).toLocaleDateString()}`}{" "}
            {subscription.cancelAtPeriodEnd && "· Ends at the current period"}
          </p>
          {subscription.status === "ACTIVE" &&
            !subscription.cancelAtPeriodEnd &&
            !subscription.autoRenew && (
              <button
                className="button button-secondary"
                onClick={async () => {
                  try {
                    await apiFetch("me/subscription/cancel", {
                      method: "POST",
                      body: JSON.stringify({ id: subscription.id }),
                    });
                    setMessage(
                      "Your membership will end at its current expiry date.",
                    );
                    result.reload();
                  } catch (error) {
                    setMessage(
                      error instanceof Error
                        ? error.message
                        : "Cancellation failed.",
                    );
                  }
                }}
              >
                End at expiry
              </button>
            )}
        </div>
      ))}
      <h3>Payment history</h3>
      {payments.error ? (
        <p>{payments.error}</p>
      ) : payments.data?.length ? (
        <ul>
          {payments.data.map((payment) => (
            <li key={payment.id}>
              {payment.currency} {(payment.amount / 100).toFixed(2)} ·{" "}
              {payment.status} ·{" "}
              {new Date(payment.createdAt).toLocaleDateString()}
            </li>
          ))}
        </ul>
      ) : (
        <p>No payment records.</p>
      )}
      <p role="status">{message}</p>
    </section>
  );
}
