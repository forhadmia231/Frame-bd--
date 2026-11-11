# Frame BD — Step 3 implementation report

Implemented 8 November 2026 in the existing Next.js application. Step 4 has not started.

## Architecture and decisions

PostgreSQL stores the catalog, accounts, viewing activity and billing records. Prisma provides typed queries and versioned SQL migrations; its PostgreSQL adapter uses a bounded connection pool. Better Auth supplies password hashing, verification/reset tokens, database sessions and cookie handling. Zod validates requests at server boundaries. Nodemailer delivers verification/recovery messages through configured SMTP. Stripe's official SDK verifies raw webhook signatures; it does not create checkout sessions in this phase.

সহজ ভাষায়: browser শুধু অনুরোধ পাঠায়। পরিচয়, মালিকানা এবং premium অনুমতি server ও database যাচাই করে। Admin হওয়া আর premium সদস্য হওয়া আলাদা বিষয়।

```text
src/app/                       Pages, server layouts and thin route handlers
  api/auth/[...all]/            Allowlisted Better Auth endpoints
  api/v1/[...path]/             Versioned application API
  api/webhooks/[provider]/      Signed provider events
  api/health/ready/             Database readiness
src/components/                Existing cinematic UI + real account controls
src/lib/                       Environment, DB, auth, errors, limits, client helpers
src/modules/api/               API dispatch and private resource ownership
src/modules/auth/              Authorization, permissions, mail, client integration
src/modules/catalog/           Public DTOs, publication/region filters, query service
src/modules/subscriptions/     Entitlements, provider adapters, atomic webhooks
src/modules/viewing/           Progress/history validation and persistence
src/modules/watchlist/         Account persistence and separate guest browser list
src/modules/streaming/         Access-aware playback boundary; no media URL yet
src/schemas/                   Shared request validation
src/types/                     Public frontend contracts
prisma/schema.prisma           Relational models
prisma/migrations/             Four checked-in migrations
prisma/seed.ts                 Permissions, inactive plans; optional fictional catalog
scripts/                      Windows local services, migration replay, maintenance
tests/                        UI contracts and real database/HTTP/SMTP integration
.local/                       Ignored local database, inbox and private credentials
```

## 1–2. Database schema and models

39 Prisma models, with foreign keys, unique constraints, targeted indexes and database integrity checks:

| Area | Models |
| --- | --- |
| Identity | User, Account, Session, Verification, UserProfile, UserPreference, RolePermission, ApiRateLimit |
| Catalog | Content, Season, Episode, Genre, Category, ContentGenre, ContentCategory, Person, ContentCast, ContentCrew, ContentLanguage, Subtitle, ContentAsset, ContentBanner |
| Activity | Watchlist, WatchlistItem, WatchProgress, WatchHistory, UserRating |
| Billing | SubscriptionPlan, Subscription, Payment, PaymentTransaction, PaymentWebhookEvent, Coupon, CouponRedemption |
| Platform | HomepageSection, HomepageSectionItem, PlatformSetting, Notification, AuditLog |

`Verification` maps to the `VerificationToken` database table; Better Auth also uses it for expiring password-reset tokens. `AdministrativeRole` plus `RolePermission` covers role/permission definitions without duplicate UserRole/UserPermission tables. Content represents movies and series using a type discriminator; seasons/episodes attach to series. Person is shared by cast and crew. All seven requested content types are represented.

User deletion cascades private activity/auth records. Billing references restrict accidental deletion; audit identity references can become null. Timestamps use PostgreSQL TIMESTAMPTZ and UTC connections. Uniques protect email, slugs, watchlist entries, progress identity and provider event identity. SQL checks reject negative amounts, invalid time windows, out-of-range ratings and invalid progress. Money uses integer minor units, never floating point.

## 3. Implemented API routes

Application responses use `{ data, meta? }` or `{ error: { code, message, fields? } }`. Better Auth preserves its native response/error contract, with session tokens removed from JSON; cookies remain the session mechanism. Versioned resources below are relative to `/api/v1`.

| Method | Resource | Access |
| --- | --- | --- |
| GET | /homepage, /genres, /status, /plans | Public |
| GET | /catalog, /catalog/trending, /catalog/latest, /catalog/popular, /search | Public, paginated |
| GET | /content/:slug | Published metadata only |
| GET | /content/:slug/related, /content/:slug/recommendations | Genre-based recommendations |
| GET | /content/:slug/seasons, /content/:slug/seasons/:number | Published episode metadata |
| GET | /content/:slug/access | Server checks free/premium entitlement |
| GET, PATCH | /me/profile, /me/preferences | Verified account, own data |
| GET, POST, DELETE | /me/watchlist | Verified account, own list |
| DELETE | /me/watchlist/:slug | Own list entry |
| GET | /me/history, /me/continue-watching | Own activity |
| DELETE | /me/history/:id | Own history and matching progress |
| POST | /me/progress, /me/ratings | Own data, validated content access |
| GET | /me/subscription, /me/payments | Own membership and redacted payment history |
| POST | /me/subscription/cancel | Disable renewal for own active membership |
| POST | /checkout | Explicit 503; checkout unavailable |
| GET | /admin/audit-logs | Admin or Super Admin |
| GET | /admin/settings | Super Admin; safe setting keys only |

Catalog filters: `q`/`query`, `type`, `genre`, `year`, minimum `rating`, `access=Free|Premium`, `sort=popularity|latest|rating|az`, `page`, `pageSize` (maximum 100). Trending/popular currently use editorial popularity ranking, not invented live audience statistics. Recommendations use shared genres, not claimed personalization.

Native authentication routes under `/api/auth`: POST `/sign-up/email`, `/sign-in/email`, `/sign-out`, `/request-password-reset`, `/reset-password`, `/send-verification-email`, `/change-password`; GET `/get-session`, `/verify-email`, `/reset-password/:token`. Other vendor endpoints are blocked.

POST `/api/webhooks/stripe` validates raw signed events when configured. Unsupported providers return 503. `/api/health` is liveness; `/api/health/ready` checks the database.

## 4. Authentication

Email/password registration, scrypt password hashing, required delivered email verification, expiring recovery links, single-use reset, password change, logout and database-backed seven-day sessions. Reset revokes sessions; password change can revoke other sessions. Passwords require 12–128 characters. Browser sessions use HttpOnly, SameSite=Lax cookies and Secure on HTTPS deployments. HTTP loopback development is the documented exception.

Duplicate registration and absent-account recovery return generic eligible-account messages. Sign-in uses generic invalid-credential errors; unverified accounts receive a verification-required message. Role and verification flags cannot be submitted by registration clients. No mobile login or invented OTP is enabled.

## 5. Authorization

Guests browse published regional metadata and access free content checks. Verified free users additionally own watchlists, profiles, ratings and progress/history. Premium access requires ACTIVE membership with current start/expiry dates and a matching VERIFIED **live-mode** payment with a verification timestamp. Sandbox payments cannot grant access. Admin/Super Admin permissions are independently read from the database; neither bypasses premium checks.

`requirePageUser`, `requireUser`, `requireRole` and the central access service enforce this on the server. Client-supplied user IDs/roles never establish ownership. Admin management permissions are defined for later admin workflows; this step exposes only the administrative reads listed above. No default admin or paid account is seeded. Explicit local promotion, after registering and verifying the intended account:

```powershell
npm.cmd run admin:grant -- owner@example.com SUPER_ADMIN
```

## 6. Security and payment integrity

Strict origin checks on browser mutations; Better Auth's own CSRF/origin checks; bounded JSON/raw request bodies; Zod input validation; Prisma queries and parameterized SQL; safe public DTOs; generic internal error messages; no password/token/credential/asset-key JSON exposure. CSP nonces and strict-dynamic scripts, frame denial, nosniff, no-referrer and browser capability restrictions are installed. React escapes displayed strings; no user HTML is rendered.

Shared PostgreSQL atomic rate counters cover auth/account/global limits and private mutations. Production proxy-aware per-IP limits require a trusted proxy that overwrites `x-real-ip`; `TRUST_PROXY` is false by default. Publication, release windows and configured `APP_REGION` apply server-side, ignoring spoofed caller country headers. This phase uses the deployment region; trusted per-viewer geolocation is a future deployment integration.

Webhook signatures are verified before parsing trusted event fields. Unique event IDs, SHA-256 payload digests, serializable transactions and bounded serialization retries prevent duplicate grants. Expected provider reference, user, plan, amount and currency must match. Refunds revoke access; later paid events cannot restore refunded payments. Any partial refund also revokes access as a conservative policy. Failed events roll back their event record for legitimate retries. No raw provider payload or card details are stored.

The Stripe adapter supports one-time Checkout paid events and charge refunds using the expected checkout reference in charge metadata. A future real checkout integration must persist the expected payment first and set that metadata. bKash/Nagad/Rocket deliberately have no guessed verification implementation. End-of-period cancellation is prepared for one-time memberships; recurring provider cancellation requires its future provider integration.

Local runtime DB credentials use a separate DML-only role; migration credentials are server-only and separate. Important authentication, profile, role and payment actions are audited. Run `npm.cmd run db:maintenance` periodically to remove expired sessions, tokens and rate windows. Deployment log redaction/retention must also be configured at the hosting proxy/provider.

## 7. Frontend integration

Homepage, discovery/type listings, genres, search, details and episode metadata read PostgreSQL. No runtime catalog imports use the temporary mock adapter; the adapter remains only for opt-in fictional seed data and existing UI contract tests. Registration/login/recovery/reset/password forms submit real requests. Profile/edit/history/continue pages are protected. Signed-in watchlists are stored in PostgreSQL; guest browser lists stay separate. Settings save own account preferences. Membership pages display actual status and payment history alongside clearly inactive proposed plans.

Loading, empty and error states are retained. Player access checks are real; video playback remains explicitly unavailable until licensed HLS assets and delivery are implemented. Consequently actual player-driven progress is not generated yet; the progress/history APIs are tested using isolated fixtures.

## 8–9. Environment and Windows setup

See `.env.example` and README for exact commands. Required: `DATABASE_URL` (runtime), `DIRECT_URL` (migrations), `BETTER_AUTH_SECRET` (32+ random characters), `BETTER_AUTH_URL` (canonical HTTPS deployment origin). Optional regional configuration: `APP_REGION=BD`; trust proxy only after configuring sanitized proxy headers.

SMTP verification/recovery: `EMAIL_DELIVERY_MODE`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `EMAIL_FROM`; `SMTP_USER`/`SMTP_PASSWORD` when required. Local mode uses a real loopback SMTP receiver and private inbox file; it sends no internet email. External mode requires authenticated provider configuration and TLS. Missing email configuration fails closed rather than claiming success.

Optional signed webhook configuration: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`. Neither enables checkout. Future storage variables (`S3_*`, signing/gateway/queue values) are reserved and currently unused. No secret uses a NEXT_PUBLIC prefix. Never commit `.env`, `.local` or inbox data.

Four SQL migrations create the schema, add integrity constraints, normalize UTC timestamps and remove an unused auth counter table. Use `npm.cmd run db:migrate` for checked-in migrations; use `npm.cmd exec -- prisma migrate dev --config prisma.config.ts --name descriptive_name` only when intentionally developing a new schema migration against a development database. Back up deployed databases before migrations; never use a destructive reset against user data. Fresh installs have been replay-tested.

## 10. Verification results

- Prisma validation and migration status: passed; four migrations applied.
- Fresh disposable database migration replay and schema comparison: passed, no schema drift.
- TypeScript check and production Webpack build: passed.
- ESLint: passed.
- Existing catalog/playback contract tests: 6/6 passed.
- Real PostgreSQL + HTTP + SMTP integration: 14/14 passed against the production server. Covers registration/hashing, delivered verification, login/logout, CSRF, session expiry/revocation, roles, ownership/IDOR, search/filter validation, publication/regions, asset redaction, progress/history/ratings, live-payment requirement and subscription expiry.
- Signed webhook fixtures cover invalid signatures, replay conflicts, concurrent duplicate delivery, sandbox isolation, live-event activation, refund revocation and transaction rollback. These are disposable tests; no real money, provider account or persistent membership was created.
- Frontend HTTP smoke: 79 URLs, four expected 404s, six expected redirects and health passed.
- Browser: real verified disposable account login, watchlist save and reload, profile edit/persistence, logout/protected redirect passed. Reviewed at 390px mobile and 1440px desktop; mobile watchlist had no horizontal overflow and no observed browser errors. Test accounts were removed. Screenshot: `docs/step3-mobile-watchlist.png`.

## 11. Remaining integration work

External email delivery needs the user's SMTP provider/domain configuration. Real merchant onboarding and checkout, recurring billing synchronization, trusted per-viewer geolocation, licensed video ingest/transcoding/private CDN delivery and full admin content-management screens remain later work. They are not simulated. Catalog metadata remains the 30 explicitly fictional development titles; optional demo seeding is restricted to local non-production use. Inactive plan prices are proposals, not purchasable offers.

The dependency audit reports eight moderate findings in the development ESLint/TypeScript-ESLint/minimatch chain, with no high or critical findings. The production-only dependency audit reports zero vulnerabilities. The development findings remain a tooling dependency maintenance item; no forced major-version audit fix was applied to the working Next.js lint configuration.

Deployment still needs TLS, provider credentials, backups/restoration drills, scheduled maintenance, monitoring, proxy rate-limit configuration and a full deployment security/load review. Catalog search is bounded case-insensitive PostgreSQL search; large catalogs should add full-text/trigram indexes and avoid loading up to 100 detailed titles into the root catalog provider. The current implementation is a modular single application, ready for that evolution. No public deployment or Step 4 work has been performed.
