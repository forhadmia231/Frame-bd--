# Frame BD development progress

## Payment method configuration — 9 November 2026

Added Super-Admin-only receiving-account setup under Payments → Manage payment methods and the sidebar Payment methods page. Supports multiple bank, bKash personal, bKash merchant and Nagad entries, display labels, account holder/number, bank/branch/routing fields, instructions and enabled status. Add/edit/remove changes persist only on Save. Server-side strict validation rejects invalid mobile numbers, routing numbers and unexpected fields. Configuration uses the existing PlatformSetting JSON record, so no migration is needed. Audit records store counts without receiving-account details. Existing provider payment records remain read-only; receiving-account setup does not activate checkout, verify payments or grant premium access.

Validation: ESLint, TypeScript and production build passed. Admin integration tests passed 14/14, including all four receiving-account types, persistence, disabling/removal, invalid input, audit records and Super Admin restrictions. Test settings were restored after the suite; no receiving number was configured for the owner.

## Steps 1–2: retained foundation

The existing Next.js App Router/TypeScript application, cinematic dark/red design, responsive discovery pages, hero/carousels, details/episode views, guest browser watchlist and unavailable-playback boundary were inspected and preserved. Architecture remains in `../ARCHITECTURE.md`. Existing fictional catalog and playback contract tests remain available.

## Step 3 — 8 November 2026

Implemented PostgreSQL/Prisma persistence (39 models, four migrations), secure Better Auth email/password accounts, real local SMTP verification/recovery, database sessions and server-side administrative roles separate from premium membership. Added public catalog/search APIs, private profile/watchlist/activity/preferences APIs, centralized entitlement checks and signed, idempotent, transactional Stripe event handling. No checkout, provider payment or premium success is simulated.

Integrated existing frontend with database-backed listings/details, real login/registration/reset forms, guarded account pages, account watchlists, history/continue views and subscription status. Retained separate guest browser storage. Added environment validation, atomic shared rate limits, safe DTOs/errors, strict mutation origins, security headers/CSP, audit logging, restricted local runtime DB credentials, maintenance and migration replay tools.

Validation: lint, TypeScript, Prisma validation/status, fresh migration replay/no drift and production build passed. Six contract tests and 14 backend integration tests passed. Route smoke passed 79 frontend URLs, four expected 404s, six redirects and health. Browser verified delivered-email account login, account watchlist persistence, profile edits and logout/guarded redirect; reviewed mobile 390px and desktop 1440px layouts. Disposable accounts and payment fixtures removed. Detailed evidence, API inventory, environment setup and limits: `STEP3_REPORT.md`.

External email, real merchant checkout, recurring billing/provider synchronization, trusted viewer geolocation, licensed video streaming and full admin management screens await later integration. Step 4 has not started; user review is required first.

## Step 4 — 8 November 2026

Implemented the protected, responsive admin workspace and CMS in the existing application. Added live overview/analytics, content drafts/publication/scheduling, seasons and episode ordering/access, genre/category management, dynamic homepage sections/banners, user suspension/role administration, immutable payment/subscription inspection, Super-Admin plan/coupon management, platform settings/maintenance, notifications and audit trail. Public homepage, categories, plan cards, metadata and branding use managed database values. Five migrations are now applied; additive admin schema changes bring the total to 40 models.

Media management includes actual validated/re-encoded image uploads, private WebVTT uploads, display-name editing, reference-protected deletion and a configured private R2/S3 signed-video-original workflow. Remote uploads await actual credentials/CORS; no HLS playback/transcoding or unverified billing success is simulated. Viewer-history protection prevents unsafe episode renumbering.

Resolved the user-reported hydration mismatch from an extension-added `cz-shortcut-listen` attribute by scoping hydration-warning suppression to the body element, retaining descendant checks. Restarted only confirmed project dev-server processes and left the final production build running on port 3000. Browser verification of the rebuilt profile/login route reported no errors; user can clear the stale overlay with a hard refresh.

Final checks: production build/TypeScript, ESLint, Prisma validation/status and fresh migration replay/no drift passed. Production runtime dependency audit has zero findings; eight existing moderate development lint findings remain. Admin integration 13/13, backend integration 14/14, catalog/playback contracts 6/6 passed: 33 automated tests. Public smoke passed 79 URLs, four 404s, six redirects and health. Admin route tests also exercise 20 management page paths and 17 collection endpoints. Browser tested draft creation/search, confirmation cancellation, responsive menu/table layout at 1440px/768px/390px and logout guards. Disposable UI fixtures removed; integration fixtures cleaned and original platform settings restored. Screenshots: `docs/step4-admin-desktop.png`, `docs/step4-admin-mobile.png`, `docs/step4-content-library.png`, `docs/step4-admin-charts.png` and `docs/hydration-fix-login.png`.

Detailed 13-part implementation/security/API/storage report and first-owner setup: `STEP4_REPORT.md`.

## Step 5 — 9 November 2026

Implemented private multipart video uploads, leased FFmpeg processing jobs, adaptive HLS delivery, signed viewer-bound playback sessions, real premium/account enforcement, custom responsive player controls, audio/captions, account/guest resume and episode navigation. Six migrations and 43 models are present. A locally generated owned 24-second 720p sample with three renditions, two audio tracks and captions is available at `/watch/frame-bd-streaming-lab`. No unauthorized movie sources or simulated subscription verification were introduced.

Validation: 45 automated tests passed (9 streaming, 14 backend, 13 admin, 9 contract/subtitle), including real FFmpeg failure/retry and private segment checks. Fresh migration replay has no drift; ESLint, TypeScript and production build passed. Production smoke passed 81 frontend URLs, four expected 404s, six redirects and health. Production dependency audit has zero vulnerabilities. Browser verified decoded HLS, manual quality/audio/speed, mobile captions/full-viewport fallback and account resume from seven seconds. Disposable browser fixtures were removed. The production server and local media worker are running for review.

The full 12-part architecture/setup/test/limitation report is `STEP5_REPORT.md`. Cloud credentials/CORS and physical mobile hardware were unavailable; large-scale transfers and 1080p source validation remain untested. Step 6 is not started and awaits user review/approval.
