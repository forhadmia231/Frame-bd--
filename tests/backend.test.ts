import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import { getDb } from "../src/lib/db";
import { activePremium } from "../src/modules/subscriptions/access";
import { StripeProvider } from "../src/modules/subscriptions/providers";
import { processPaymentWebhook } from "../src/modules/subscriptions/webhooks";
import { consumeRateLimit } from "../src/lib/rate-limit";

const origin = process.env.TEST_ORIGIN || "http://localhost:3000";
if (
  !["localhost", "127.0.0.1"].includes(new URL(origin).hostname) ||
  process.env.EMAIL_DELIVERY_MODE !== "local" ||
  !["localhost", "127.0.0.1"].includes(
    new URL(process.env.DATABASE_URL!).hostname,
  )
)
  throw new Error(
    "Integration tests require the isolated local database and local SMTP inbox.",
  );
const db = getDb();
const tag = randomUUID().replaceAll("-", "").slice(0, 12);
const password = "Frame-test-strong-123456!";
const users: string[] = [];
const contents: string[] = [];
type Jar = { cookie: string };
async function call(
  path: string,
  method = "GET",
  data?: unknown,
  jar: Jar = { cookie: "" },
  customHeaders: Record<string, string> = {},
  attempt = 0,
) {
  const response = await fetch(origin + path, {
    method,
    headers: {
      Origin: origin,
      ...(data !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(jar.cookie ? { Cookie: jar.cookie } : {}),
      ...customHeaders,
    },
    ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
    redirect: "manual",
    signal: AbortSignal.timeout(30000),
  });
  if (response.status === 429 && path.startsWith("/api/auth/") && attempt < 2) {
    const wait = Number(
      response.headers.get("x-retry-after") ||
        response.headers.get("retry-after"),
    );
    if (wait > 0 && wait <= 15) {
      await response.text();
      await new Promise((resolve) => setTimeout(resolve, (wait + 1) * 1000));
      return call(path, method, data, jar, customHeaders, attempt + 1);
    }
  }
  const cookies = response.headers.getSetCookie();
  if (cookies.length) {
    const map = new Map(
      jar.cookie
        .split("; ")
        .filter(Boolean)
        .map((cookie) => {
          const index = cookie.indexOf("=");
          return [cookie.slice(0, index), cookie.slice(index + 1)];
        }),
    );
    for (const cookie of cookies) {
      const [pair] = cookie.split(";");
      const index = pair.indexOf("=");
      map.set(pair.slice(0, index), pair.slice(index + 1));
    }
    jar.cookie = [...map].map(([key, value]) => `${key}=${value}`).join("; ");
  }
  const text = await response.text(); // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Each HTTP response shape is asserted by the integration flow.
  let json: Record<string, any> = {};
  try {
    json = JSON.parse(text);
  } catch {
    /* Redirects and HTML need no JSON decoding. */
  }
  return { status: response.status, json, text, headers: response.headers };
}
async function mailLink(email: string, kind: string) {
  for (let attempt = 0; attempt < 30; attempt++) {
    if (existsSync(".local/mailbox/messages.jsonl")) {
      const rows = readFileSync(".local/mailbox/messages.jsonl", "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
      const message = rows
        .reverse()
        .find((row) => row.to.includes(email) && row.raw.includes(kind));
      if (message) {
        const decoded = message.raw
          .replace(/=\r?\n/g, "")
          .replace(/=([A-F0-9]{2})/g, (_: string, hex: string) =>
            String.fromCharCode(parseInt(hex, 16)),
          );
        const link = decoded.match(
          /http:\/\/localhost:3000\/api\/auth\/[^\s<>]+/,
        )?.[0];
        if (link) return link;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    "Expected verification email was not delivered to the local SMTP inbox.",
  );
}
async function register(name: string) {
  const email = `frame-test-${tag}-${name}@example.test`;
  const result = await call("/api/auth/sign-up/email", "POST", {
    name: `Test ${name}`,
    email,
    password,
  });
  assert.equal(
    result.status,
    200,
    "Registration must succeed with configured local SMTP",
  );
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  users.push(user.id);
  assert.equal(user.emailVerified, false);
  return { email, user, jar: { cookie: "" } as Jar };
}
async function verify(email: string) {
  const url = await mailLink(email, "Verify your Frame BD email");
  const response = await fetch(url, { redirect: "manual" });
  assert.ok([200, 302, 303, 307].includes(response.status));
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { email } })).emailVerified,
    true,
  );
}
async function fixture(slug: string, extra: Record<string, unknown> = {}) {
  const value = await db.content.create({
    data: {
      slug: `test-${tag}-${slug}`,
      title: `Test ${slug}`,
      description: "Isolated integration fixture",
      type: "MOVIE",
      status: "PUBLISHED",
      publishedAt: new Date(),
      releaseYear: 2026,
      duration: 100,
      posterPath: "/artwork/mountains.jpg",
      ...extra,
    },
  });
  contents.push(value.id);
  return value;
}

test(
  "PostgreSQL, authentication, ownership and billing integration",
  { timeout: 240000 },
  async (suite) => {
    try {
      const alice = await register("alice");
      const bob = await register("bob");
      await suite.test(
        "registration hashes passwords and rejects role injection",
        async () => {
          const account = await db.account.findFirstOrThrow({
            where: { userId: alice.user.id, providerId: "credential" },
          });
          assert.notEqual(account.password, password);
          assert.ok(!account.password?.includes(password));
          assert.equal(alice.user.role, "USER");
          assert.equal(
            (
              await call("/api/auth/sign-up/email", "POST", {
                name: "Bad role",
                email: `blocked-${tag}@example.test`,
                password,
                role: "SUPER_ADMIN",
              })
            ).status,
            400,
          );
          const duplicate = await call("/api/auth/sign-up/email", "POST", {
            name: "Duplicate",
            email: alice.email,
            password,
          });
          assert.equal(duplicate.status, 200);
          assert.equal(
            await db.user.count({ where: { email: alice.email } }),
            1,
          );
        },
      );
      await suite.test(
        "unverified login is denied and email verification uses delivered tokens",
        async () => {
          assert.equal(
            (
              await call(
                "/api/auth/sign-in/email",
                "POST",
                { email: alice.email, password },
                alice.jar,
              )
            ).status,
            403,
          );
          await verify(alice.email);
          await verify(bob.email);
        },
      );
      await suite.test(
        "login, CSRF, secret redaction and private resource authentication",
        async () => {
          const login = await call(
            "/api/auth/sign-in/email",
            "POST",
            { email: alice.email, password },
            alice.jar,
          );
          assert.equal(login.status, 200);
          assert.ok(
            login.headers
              .getSetCookie()
              .some(
                (cookie) =>
                  /httponly/i.test(cookie) && /samesite=lax/i.test(cookie),
              ),
          );
          assert.equal("token" in login.json, false);
          assert.equal(
            (
              await call("/api/auth/sign-in/email", "POST", {
                email: alice.email,
                password: "incorrect-password",
              })
            ).status,
            401,
          );
          assert.equal(
            (
              await call("/api/auth/sign-in/email", "POST", {
                email: `missing-${tag}@example.test`,
                password: "incorrect-password",
              })
            ).status,
            401,
          );
          assert.equal((await call("/api/v1/me/profile")).status, 401);
          assert.equal(
            (
              await call(
                "/api/v1/me/profile",
                "PATCH",
                { name: "Attack" },
                alice.jar,
                { Origin: "https://evil.example" },
              )
            ).status,
            403,
          );
          const profile = await call(
            "/api/v1/me/profile",
            "GET",
            undefined,
            alice.jar,
          );
          assert.equal(profile.json.data.id, alice.user.id);
          assert.ok(!profile.text.includes("password"));
          const session = await call(
            "/api/auth/get-session",
            "GET",
            undefined,
            alice.jar,
          );
          assert.equal("token" in session.json.session, false);
          assert.equal(
            (
              await call(
                "/api/v1/me/profile",
                "PATCH",
                { name: "Spoof", role: "SUPER_ADMIN" },
                alice.jar,
              )
            ).status,
            400,
          );
          assert.equal(
            (
              await call(
                "/api/v1/me/profile",
                "PATCH",
                { name: "Alice Updated", bio: "A real profile update" },
                alice.jar,
              )
            ).status,
            200,
          );
        },
      );
      const free = await fixture("free");
      const premium = await fixture("premium", { access: "PREMIUM" });
      const draft = await fixture("draft", { status: "DRAFT" });
      const regional = await fixture("regional", { allowedRegions: ["US"] });
      const expired = await fixture("expired", {
        availableUntil: new Date(Date.now() - 1000),
      });
      await db.contentAsset.create({
        data: {
          contentId: free.id,
          kind: "HLS",
          privateStorageKey: "PRIVATE_STREAM_CANARY_DO_NOT_RETURN",
          ready: true,
        },
      });
      await suite.test(
        "public catalog exposes only published regional content and never private assets",
        async () => {
          assert.equal(
            (await call(`/api/v1/content/${draft.slug}`)).status,
            404,
          );
          assert.equal(
            (
              await call(
                `/api/v1/content/${regional.slug}`,
                "GET",
                undefined,
                undefined,
                { "x-country": "US" },
              )
            ).status,
            404,
          );
          assert.equal(
            (await call(`/api/v1/content/${expired.slug}`)).status,
            404,
          );
          const result = await call(`/api/v1/content/${free.slug}`);
          assert.equal(result.status, 200);
          assert.ok(!result.text.includes("privateStorageKey"));
          assert.ok(!result.text.includes("PRIVATE_STREAM_CANARY"));
          const lookup = await call("/api/v1/catalog/lookup", "POST", {
            slugs: [draft.slug, free.slug, regional.slug, free.slug, expired.slug],
          });
          assert.equal(lookup.status, 200);
          assert.deepEqual(lookup.json.data.map((item: { slug: string }) => item.slug), [free.slug]);
          assert.ok(!lookup.text.includes("PRIVATE_STREAM_CANARY"));
          assert.equal((await call("/api/v1/catalog/lookup", "POST", {
            slugs: Array(201).fill(free.slug),
          })).status, 400);
          assert.equal(
            (await call("/api/v1/catalog?pageSize=99999")).status,
            400,
          );
          assert.equal(
            (await call("/api/v1/catalog?sort=injected")).status,
            400,
          );
          const search = await call(
            `/api/v1/search?q=${encodeURIComponent(free.title)}`,
          );
          assert.ok(
            search.json.data.some(
              (item: { slug: string }) => item.slug === free.slug,
            ),
          );
          const injection = await call(
            "/api/v1/search?q=%27%3B%20DROP%20TABLE%20User%3B--",
          );
          assert.equal(injection.status, 200);
          assert.equal(
            (await call("/api/v1/catalog?type=WEB_SERIES")).status,
            200,
          );
        },
      );
      await call(
        "/api/auth/sign-in/email",
        "POST",
        { email: bob.email, password },
        bob.jar,
      );
      await suite.test(
        "watchlist is persisted, idempotent and isolated by authenticated owner",
        async () => {
          for (let i = 0; i < 2; i++)
            assert.equal(
              (
                await call(
                  "/api/v1/me/watchlist",
                  "POST",
                  { slug: free.slug },
                  alice.jar,
                )
              ).status,
              200,
            );
          const list = await call(
            "/api/v1/me/watchlist",
            "GET",
            undefined,
            alice.jar,
          );
          assert.equal(
            list.json.data.filter(
              (item: { slug: string }) => item.slug === free.slug,
            ).length,
            1,
          );
          assert.equal(
            (
              await call(
                `/api/v1/me/watchlist?userId=${alice.user.id}`,
                "GET",
                undefined,
                bob.jar,
              )
            ).json.data.length,
            0,
          );
          assert.equal(
            (
              await call(
                "/api/v1/me/watchlist",
                "POST",
                { slug: free.slug, userId: bob.user.id },
                alice.jar,
              )
            ).status,
            400,
          );
          assert.equal(
            (
              await call(
                "/api/v1/me/watchlist",
                "POST",
                { slug: draft.slug },
                alice.jar,
              )
            ).status,
            404,
          );
        },
      );
      await suite.test(
        "progress, history, ratings and cross-user history deletion",
        async () => {
          assert.equal(
            (
              await call(
                "/api/v1/me/progress",
                "POST",
                { slug: free.slug, position: 120 },
                alice.jar,
              )
            ).status,
            200,
          );
          assert.equal(
            (
              await call(
                "/api/v1/me/progress",
                "POST",
                { slug: free.slug, position: 999999 },
                alice.jar,
              )
            ).status,
            400,
          );
          const history = await call(
            "/api/v1/me/history",
            "GET",
            undefined,
            alice.jar,
          );
          const row = history.json.data.find(
            (item: { title: { slug: string } }) =>
              item.title.slug === free.slug,
          );
          assert.ok(row);
          assert.equal(
            (
              await call(
                `/api/v1/me/history/${row.id}`,
                "DELETE",
                undefined,
                bob.jar,
              )
            ).status,
            404,
          );
          assert.equal(
            (
              await call(
                "/api/v1/me/continue-watching",
                "GET",
                undefined,
                alice.jar,
              )
            ).json.data.length,
            1,
          );
          assert.equal(
            (
              await call(
                "/api/v1/me/ratings",
                "POST",
                { slug: free.slug, value: 9 },
                alice.jar,
              )
            ).status,
            200,
          );
          assert.equal(
            (
              await call(
                "/api/v1/me/ratings",
                "POST",
                { slug: free.slug, value: 11 },
                alice.jar,
              )
            ).status,
            400,
          );
          assert.equal(
            (
              await call(
                `/api/v1/me/history/${row.id}`,
                "DELETE",
                undefined,
                alice.jar,
              )
            ).status,
            200,
          );
          assert.equal(
            (
              await call(
                "/api/v1/me/continue-watching",
                "GET",
                undefined,
                alice.jar,
              )
            ).json.data.length,
            0,
          );
        },
      );
      await suite.test(
        "administrative roles are server-enforced and never imply premium",
        async () => {
          assert.equal(
            (
              await call(
                "/api/v1/admin/audit-logs",
                "GET",
                undefined,
                alice.jar,
              )
            ).status,
            403,
          );
          await db.user.update({
            where: { id: alice.user.id },
            data: { role: "ADMIN" },
          });
          assert.equal(
            (
              await call(
                "/api/v1/admin/audit-logs",
                "GET",
                undefined,
                alice.jar,
              )
            ).status,
            200,
          );
          assert.equal(
            (await call("/api/v1/admin/settings", "GET", undefined, alice.jar))
              .status,
            403,
          );
          assert.equal(
            (
              await call(
                `/api/v1/content/${premium.slug}/access`,
                "GET",
                undefined,
                alice.jar,
              )
            ).status,
            403,
          );
          await db.user.update({
            where: { id: alice.user.id },
            data: { role: "SUPER_ADMIN" },
          });
          assert.equal(
            (await call("/api/v1/admin/settings", "GET", undefined, alice.jar))
              .status,
            200,
          );
          await db.user.update({
            where: { id: alice.user.id },
            data: { role: "USER" },
          });
        },
      );
      await suite.test(
        "premium requires verified live payment and unexpired dates",
        async () => {
          assert.equal(
            (await call(`/api/v1/content/${premium.slug}/access`)).status,
            401,
          );
          const plan = await db.subscriptionPlan.findUniqueOrThrow({
            where: { slug: "premium-monthly" },
          });
          const subscription = await db.subscription.create({
            data: {
              userId: alice.user.id,
              planId: plan.id,
              status: "ACTIVE",
              startsAt: new Date(Date.now() - 86400000),
              expiresAt: new Date(Date.now() + 86400000),
            },
          });
          assert.equal(await activePremium(alice.user.id), false);
          const payment = await db.payment.create({
            data: {
              userId: alice.user.id,
              subscriptionId: subscription.id,
              provider: "integration-fixture",
              amount: plan.price,
              currency: plan.currency,
              status: "VERIFIED",
              verifiedAt: new Date(),
              liveMode: false,
            },
          });
          assert.equal(await activePremium(alice.user.id), false);
          await db.payment.update({
            where: { id: payment.id },
            data: { liveMode: true },
          });
          assert.equal(
            (
              await call(
                `/api/v1/content/${premium.slug}/access`,
                "GET",
                undefined,
                alice.jar,
              )
            ).status,
            200,
          );
          await db.subscription.update({
            where: { id: subscription.id },
            data: { expiresAt: new Date(Date.now() - 1000) },
          });
          assert.equal(await activePremium(alice.user.id), false);
          assert.equal(
            (
              await call(
                "/api/v1/me/progress",
                "POST",
                { slug: premium.slug, position: 60 },
                alice.jar,
              )
            ).status,
            403,
          );
        },
      );
      await suite.test(
        "Stripe signatures, replay rejection, atomic duplicate protection and sandbox isolation",
        async () => {
          const stripe = new Stripe("sk_test_integration_only");
          const secret = `whsec_${randomUUID()}`;
          const verifier = new StripeProvider(stripe, secret);
          const plan = await db.subscriptionPlan.findUniqueOrThrow({
            where: { slug: "premium-monthly" },
          });
          const subscription = await db.subscription.create({
            data: { userId: bob.user.id, planId: plan.id },
          });
          const reference = `cs_test_${tag}`;
          await db.payment.create({
            data: {
              userId: bob.user.id,
              subscriptionId: subscription.id,
              provider: "stripe",
              providerReference: reference,
              amount: plan.price,
              currency: plan.currency,
            },
          });
          const payload = JSON.stringify({
            id: `evt_${tag}`,
            type: "checkout.session.completed",
            livemode: false,
            data: {
              object: {
                id: reference,
                mode: "payment",
                payment_status: "paid",
                amount_total: plan.price,
                currency: plan.currency.toLowerCase(),
              },
            },
          });
          const headers = new Headers({
            "stripe-signature": stripe.webhooks.generateTestHeaderString({
              payload,
              secret,
            }),
          });
          assert.throws(() =>
            verifier.verify(
              payload,
              new Headers({ "stripe-signature": "invalid" }),
            ),
          );
          const first = await processPaymentWebhook(
            "stripe",
            payload,
            headers,
            verifier,
          );
          assert.equal(first.duplicate, false);
          assert.equal(
            (await processPaymentWebhook("stripe", payload, headers, verifier))
              .duplicate,
            true,
          );
          assert.equal(
            await db.paymentTransaction.count({
              where: { providerEventId: `stripe:evt_${tag}` },
            }),
            1,
          );
          assert.equal(
            (
              await db.subscription.findUniqueOrThrow({
                where: { id: subscription.id },
              })
            ).status,
            "PENDING",
          );
          assert.equal(await activePremium(bob.user.id), false);
          const changed = payload.replace(
            '"amount_total":19900',
            '"amount_total":19800',
          );
          await assert.rejects(() =>
            processPaymentWebhook(
              "stripe",
              changed,
              new Headers({
                "stripe-signature": stripe.webhooks.generateTestHeaderString({
                  payload: changed,
                  secret,
                }),
              }),
              verifier,
            ),
          );
          assert.equal(
            (await call("/api/webhooks/bkash", "POST", {})).status,
            503,
          );
        },
      );
      await suite.test(
        "signed live fixtures activate once, refunds revoke, and invalid events roll back",
        async () => {
          // Isolated signed fixtures exercise the handler; no provider account or money is involved.
          const stripe = new Stripe("sk_test_integration_only");
          const secret = `whsec_${randomUUID()}`;
          const verifier = new StripeProvider(stripe, secret);
          const plan = await db.subscriptionPlan.findUniqueOrThrow({
            where: { slug: "premium-monthly" },
          });
          const subscription = await db.subscription.create({
            data: { userId: bob.user.id, planId: plan.id },
          });
          const reference = `cs_live_fixture_${tag}`;
          await db.payment.create({
            data: {
              userId: bob.user.id,
              subscriptionId: subscription.id,
              provider: "stripe",
              providerReference: reference,
              amount: plan.price,
              currency: plan.currency,
            },
          });
          const send = (
            id: string,
            type = "checkout.session.completed",
            amount = plan.price,
          ) => {
            const object =
              type === "charge.refunded"
                ? {
                    amount_refunded: amount,
                    currency: plan.currency.toLowerCase(),
                    metadata: { frameBdCheckoutReference: reference },
                  }
                : {
                    id: reference,
                    mode: "payment",
                    payment_status: "paid",
                    amount_total: amount,
                    currency: plan.currency.toLowerCase(),
                  };
            const raw = JSON.stringify({
              id,
              type,
              livemode: true,
              data: { object },
            });
            return processPaymentWebhook(
              "stripe",
              raw,
              new Headers({
                "stripe-signature": stripe.webhooks.generateTestHeaderString({
                  payload: raw,
                  secret,
                }),
              }),
              verifier,
            );
          };
          const invalid = `evt_${tag}_invalid`;
          await assert.rejects(() =>
            send(invalid, "checkout.session.completed", plan.price - 1),
          );
          assert.equal(
            await db.paymentWebhookEvent.count({ where: { eventId: invalid } }),
            0,
          );
          const eventId = `evt_${tag}_live`;
          const results = await Promise.all([
            send(eventId),
            send(eventId),
            send(eventId),
          ]);
          assert.equal(results.filter((result) => !result.duplicate).length, 1);
          assert.equal(await activePremium(bob.user.id), true);
          const original = await db.subscription.findUniqueOrThrow({
            where: { id: subscription.id },
          });
          await send(`evt_${tag}_paid_again`);
          assert.equal(
            (
              await db.subscription.findUniqueOrThrow({
                where: { id: subscription.id },
              })
            ).expiresAt?.getTime(),
            original.expiresAt?.getTime(),
          );
          await send(`evt_${tag}_refund`, "charge.refunded");
          assert.equal(await activePremium(bob.user.id), false);
          await send(`evt_${tag}_late_paid`);
          assert.equal(
            (
              await db.subscription.findUniqueOrThrow({
                where: { id: subscription.id },
              })
            ).status,
            "REVOKED",
          );
        },
      );
      await suite.test(
        "password change and reset revoke sessions; reset token is single-use",
        async () => {
          const second: Jar = { cookie: "" };
          await call(
            "/api/auth/sign-in/email",
            "POST",
            { email: alice.email, password },
            second,
          );
          const nextPassword = "Frame-next-password-123456!";
          assert.equal(
            (
              await call(
                "/api/auth/change-password",
                "POST",
                {
                  currentPassword: password,
                  newPassword: nextPassword,
                  revokeOtherSessions: true,
                },
                alice.jar,
              )
            ).status,
            200,
          );
          assert.equal(
            (await call("/api/v1/me/profile", "GET", undefined, second)).status,
            401,
          );
          const reset = await call("/api/auth/request-password-reset", "POST", {
            email: alice.email,
            redirectTo: `${origin}/reset-password`,
          });
          const absent = await call(
            "/api/auth/request-password-reset",
            "POST",
            {
              email: `absent-${tag}@example.test`,
              redirectTo: `${origin}/reset-password`,
            },
          );
          assert.equal(reset.status, absent.status);
          const resetLink = await mailLink(
            alice.email,
            "Reset your Frame BD password",
          );
          const landing = await fetch(resetLink, { redirect: "manual" });
          const location = landing.headers.get("location");
          assert.ok(location);
          const token = new URL(location!, origin).searchParams.get("token");
          assert.ok(token);
          const finalPassword = "Frame-reset-password-123456!";
          assert.equal(
            (
              await call("/api/auth/reset-password", "POST", {
                token,
                newPassword: finalPassword,
              })
            ).status,
            200,
          );
          assert.ok(
            (
              await call("/api/auth/reset-password", "POST", {
                token,
                newPassword: password,
              })
            ).status >= 400,
          );
          assert.equal(
            (await call("/api/v1/me/profile", "GET", undefined, alice.jar))
              .status,
            401,
          );
          assert.equal(
            (
              await call(
                "/api/auth/sign-in/email",
                "POST",
                { email: alice.email, password: finalPassword },
                alice.jar,
              )
            ).status,
            200,
          );
        },
      );
      await suite.test(
        "logout invalidates the stored session and expired sessions are rejected",
        async () => {
          const oldCookie = alice.jar.cookie;
          assert.equal(
            (await call("/api/auth/sign-out", "POST", {}, alice.jar)).status,
            200,
          );
          assert.equal(
            (
              await call("/api/v1/me/profile", "GET", undefined, {
                cookie: oldCookie,
              })
            ).status,
            401,
          );
          await db.session.updateMany({
            where: { userId: bob.user.id },
            data: { expiresAt: new Date(Date.now() - 1000) },
          });
          assert.equal(
            (await call("/api/v1/me/profile", "GET", undefined, bob.jar))
              .status,
            401,
          );
        },
      );
      await suite.test(
        "rate limits increment atomically under concurrent requests",
        async () => {
          const results = await Promise.all(
            Array.from({ length: 10 }, () =>
              consumeRateLimit(`test:${tag}`, 3, 60),
            ),
          );
          assert.equal(results.filter((result) => result.allowed).length, 3);
        },
      );
    } finally {
      await db.paymentTransaction.deleteMany({
        where: { payment: { userId: { in: users } } },
      });
      await db.paymentWebhookEvent.deleteMany({
        where: { eventId: { contains: tag } },
      });
      await db.payment.deleteMany({ where: { userId: { in: users } } });
      await db.subscription.deleteMany({ where: { userId: { in: users } } });
      await db.content.deleteMany({ where: { id: { in: contents } } });
      await db.user.deleteMany({ where: { id: { in: users } } });
      await db.$disconnect();
    }
  },
);
