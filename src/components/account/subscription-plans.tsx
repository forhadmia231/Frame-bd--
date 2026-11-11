"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { PageHeading } from "@/components/ui/states";
import { SubscriptionStatus } from "./subscription-status";
import { useResource } from "@/lib/use-resource";

export function SubscriptionPlans() {
  const [yearly, setYearly] = useState(false);
  const [selected, setSelected] = useState("");
  const { data: plans, error } = useResource<
    {
      id: string;
      name: string;
      price: number;
      currency: string;
      durationDays: number;
      features: string[];
      active: boolean;
    }[]
  >("plans", "public-plans");
  return (
    <div className="container page-content plans-page">
      <SubscriptionStatus />
      <PageHeading
        eyebrow="MORE STORIES. MORE POSSIBILITIES."
        title="A plan for your kind of night"
        description="A preview of the membership experience we are building."
      />
      <div className="billing-toggle" aria-label="Billing period">
        <button
          className={!yearly ? "active" : ""}
          aria-pressed={!yearly}
          onClick={() => setYearly(false)}
        >
          Monthly
        </button>
        <button
          className={yearly ? "active" : ""}
          aria-pressed={yearly}
          onClick={() => setYearly(true)}
        >
          Yearly <span>Proposed savings</span>
        </button>
      </div>
      <p className="plans-notice">
        Illustrative pricing only. Plans are not for sale, and checkout is not
        connected.
      </p>
      <div className="plans-grid">
        <article className="plan-card">
          <Icon name="film" size={27} />
          <h2>Free</h2>
          <p>A little discovery goes a long way.</p>
          <div className="plan-price">
            ৳0<span> / always</span>
          </div>
          <ul>
            {[
              "Browse the public catalog",
              "Selected free titles at launch",
              "Browser watchlist in this preview",
            ].map((item) => (
              <li key={item}>
                <Icon name="check" size={17} />
                {item}
              </li>
            ))}
          </ul>
          <Link
            href="/categories?access=Free"
            className="button button-secondary"
          >
            Explore free collection <Icon name="arrow" size={17} />
          </Link>
        </article>
        {plans
          ?.filter((plan) =>
            yearly ? plan.durationDays > 90 : plan.durationDays <= 90,
          )
          .map((plan) => (
            <article className="plan-card featured-plan" key={plan.id}>
              <span className="plan-recommendation">
                THE FULL FRAME · PROPOSED
              </span>
              <Icon name="crown" size={27} />
              <h2>{plan.name}</h2>
              <p>For the ones who always want one more.</p>
              <div className="plan-price">
                {plan.currency} {(plan.price / 100).toLocaleString()}
                <span> / {plan.durationDays} days</span>
              </div>
              <ul>
                {(plan.features.length
                  ? plan.features
                  : [
                      "Access to eligible premium content",
                      "Account watchlist & viewing progress",
                    ]
                ).map((item) => (
                  <li key={item}>
                    <Icon name="check" size={17} />
                    {item}
                  </li>
                ))}
              </ul>
              <button
                className="button button-primary"
                onClick={() => setSelected(plan.name)}
              >
                View plan availability <Icon name="arrow" size={17} />
              </button>
            </article>
          ))}
      </div>
      {!plans && !error && <p role="status">Loading configured plans…</p>}
      {error && <p role="alert">{error}</p>}
      {selected && (
        <div className="plan-availability" role="status">
          <Icon name="info" size={24} />
          <div>
            <h2>{selected} is not available yet.</h2>
            <p>
              Checkout and server-verified subscriptions will be integrated in
              the payment phase. No payment was taken and no premium access has
              been granted.
            </p>
          </div>
          <button
            className="icon-button"
            onClick={() => setSelected("")}
            aria-label="Dismiss availability message"
          >
            <Icon name="close" />
          </button>
        </div>
      )}
      <div className="plans-faq">
        <h2>A few things to know</h2>
        {[
          [
            "Can I subscribe now?",
            "Not yet. This page demonstrates plan presentation. A real merchant integration and verified server-side billing are required before subscriptions go live.",
          ],
          [
            "What does Premium unlock?",
            "The planned premium catalog and eligible streaming features. Final pricing, device limits and availability will be confirmed before launch.",
          ],
          [
            "Is the free catalog streaming now?",
            "Only titles with a ready authorized video can play. Streaming Lab is an owned generated sample; other fictional development titles remain unavailable until authorized media is processed.",
          ],
        ].map(([question, answer]) => (
          <details key={question}>
            <summary>{question}</summary>
            <p>{answer}</p>
          </details>
        ))}
      </div>
    </div>
  );
}
