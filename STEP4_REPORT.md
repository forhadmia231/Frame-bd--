# Frame BD — Step 4: Admin dashboard and CMS

Implemented in the existing application on 8 November 2026. Step 5 has not started.

## 1. Dashboard pages

Protected `/admin` workspace with responsive sidebar, top bar, branded dark surfaces, database statistics, date-range controls, accessible bar charts, search/status/type filters, 20-record pagination, reusable editors, confirmation dialogs and success/error notifications.

Pages: overview; content library; series management; seasons; episodes; media library and metadata; authorized video references; subtitle references; genres; categories; homepage sections; hero banners; users/details; subscription plans; subscriptions/details; payments/details; coupons; analytics; platform settings; notifications; audit trail. Editors use `/admin/:resource/new` and `/admin/:resource/:id` where creation/editing is supported. Payments/subscriptions/audit/user details use safe read interfaces rather than arbitrary record editors.

## 2. Content management

Create/view/edit drafts; publish/unpublish; archive; schedule visibility through a future publication timestamp; feature titles; choose free/premium access and regional/release windows. Supports all seven requested types. Fields cover title/slug/synopsis/tagline, poster/backdrop, year/duration, age/internal ratings, popularity, production, cast/director, languages, subtitles, genres/categories, access and publication settings. Server validation and transactions protect relation replacement and audit recording. Duplicate slugs/numbers return a useful conflict response.

Deletion protects published or referenced content. Archive is the appropriate action for titles with viewing history, ratings, saved lists, media or homepage assignments. Genre/category deletion is blocked while content still refers to it. Category visibility/order is reflected in public Explore choices; active genre order is reflected in the public navigation. Public filtering supports `category=<slug>`.

## 3. Series and episodes

Manage TV series, web series and anime; create/edit/delete seasons and episodes; choose episode descriptions, thumbnails, language, duration, publication and premium status. Arrow controls reorder all episodes in a selected season atomically, using a temporary positive numbering range to preserve unique constraints. Episode premium checks are enforced in the central access service, watch page and progress API, in addition to parent-content access.

Seasons cannot be moved to another title, or episodes to another season. Numbering changes are blocked when viewer activity exists because the current viewing identity uses season/episode numbers. A dedicated identity/history migration is required for that case. Nonempty seasons and published/referenced episodes cannot be deleted accidentally.

## 4. Media management

Actual image uploads (JPEG/PNG/WebP, maximum 8 MB/25 megapixels) are decoded, stripped/re-encoded to WebP with Sharp. WebVTT subtitles are limited to 1 MB, checked for the expected header and rejected for unsafe markup. Upload status, byte count/type, display-name editing and safe unused-file deletion are provided. Uploaded image paths can be used for posters, backdrops, thumbnails, banners, logos and favicons. Public `/api/media/:id` serves only ready, processed images; subtitle/video objects have no public download endpoint.

On loopback development origins, small files use ignored `.local/media`. Deployments require configured private R2/S3 storage. Video originals use a server-generated random object key, a 15-minute signed PUT, a browser-to-storage upload and a server HEAD check of declared byte size/type before READY status. The current direct-upload limit is 2 GB; files do not pass through Next.js or the database. Only ready managed originals, with an explicit rights confirmation, may be attached to content/episodes. A verified original is not claimed to be transcoded/playable HLS.

Configure `S3_ENDPOINT` (HTTPS S3 API endpoint), `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`. Keep bucket access private and grant the server only the required object operations. Browser PUT uploads also need provider CORS allowing the exact application origin and Content-Type. The application CSP allows only the configured storage origin for direct uploads. Credentials remain server-side; temporary URLs authorize only their specific object operation.

Scalable next-stage design: managed upload record → resumable multipart upload for larger files → verified completion → queued media validation/transcoding → private HLS renditions → signed entitlement-aware delivery. Persist upload IDs/part ETags and use bucket lifecycle rules to abort abandoned multipart uploads. This design is documented; multipart/transcoding/playback have not been falsely presented as implemented. Provider references: [R2 presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/), [R2 CORS](https://developers.cloudflare.com/r2/buckets/cors/), [AWS SDK S3 examples](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/javascript_s3_code_examples.html).

## 5. User management

Search/filter users, inspect verified registration/profile, membership, subscription history and recent account activity without passwords, hashes or session tokens. Admins can suspend/reactivate ordinary users; suspension deletes sessions and the auth session-creation hook rejects new logins. Super Admins manage other administrative accounts/roles. Own-role/own-suspension changes are forbidden; last-active-Super-Admin protection and a transaction-level advisory lock protect role changes. Role changes revoke target sessions. Membership remains independent of administrative role.

## 6. Subscriptions and payments

Super Admins create/edit/activate/deactivate plans, features, minor-unit prices and duration; billing terms already referenced by subscriptions are immutable, requiring a new plan version. Coupons support percentage, expiry, redemption limits and activation. Checkout/redemption execution remains unavailable until the real merchant phase. Public plan cards now read configured database prices/features and clearly retain unavailable-checkout messaging.

Admins inspect subscriptions, expiry, cancellation information, user/plan references, provider payment status and transaction history. Payment/subscription mutation endpoints return 405. There is no manual payment verification, premium grant or fake successful checkout. Provider-verified billing from Step 3 is retained.

## 7. Analytics

Real queries provide total/active/free/premium users, counts by content type/status, episodes, subscription/expiry/payment totals, recent registrations/activity and premium conversion. Date ranges: 7/30/90/365 days, UTC. Active-user label explicitly means a valid session updated in the range. Premium counts require active dates and verified live payments.

Charts show daily/monthly registrations, subscription-record creation, publication dates, verified receipts separated by currency and saved playback positions. Revenue charts show an empty state when no verified receipts exist; amounts are labelled as minor units and refunded payments are excluded. They are not an accounting net-revenue report. Most-watched/category engagement uses distinct saved history entries. Saved positions are snapshots, not measured streaming watch time. Repeat purchasers are labelled accurately rather than claimed to be automatic renewals; confirmed recurring renewal telemetry awaits provider integration.

## 8. Platform settings and homepage

Super-Admin-only validated brand settings: name, managed logo/favicon, accent color, SEO title/description, contact email, HTTPS social links, default-language label, maintenance mode and internal terms/privacy links. Public metadata/navigation/footer reflect changes. Bangla language selection sets the HTML language to `bn`; this is not a claim that every UI string has been translated. Maintenance replaces public page content while retaining login/recovery/admin access for operators.

Homepage editors configure enabled/disabled ordered sections and title order (including featured/trending/popular/anime/documentary/latest/free/premium/custom sections). Hero banners support managed image, title, description, linked content and internal Watch/Info destinations. Only published, rights-window/region-eligible titles enter public sections/banners. Until sections are configured, existing Step 2 curated rows remain intact; once configured, the managed sections control homepage rows, including deliberate hiding of disabled sections.

## 9. APIs

Existing `/api/v1/admin` dispatches to a dedicated admin module. Every call verifies the current database role and session, not client state. Common CRUD collections: `content`, `seasons`, `episodes`, `genres`, `categories`, `sections`, `banners`, `plans`, `coupons`, `notifications`, `assets`, `subtitles`. GET lists/details use bounded pagination; resource-specific strict schemas validate writes. Plan/coupon writes require Super Admin.

Additional endpoints:

| Method | `/api/v1/admin/...` | Purpose |
| --- | --- | --- |
| GET | overview, analytics?days=30 | Real database statistics |
| GET | options | Bounded safe selector records |
| GET/PATCH | settings | Super Admin brand/platform configuration |
| GET | users/:id | Redacted user history/details |
| PATCH | users/:id | Authorized suspension/role changes |
| GET | subscriptions, payments, logs (or audit-logs) | Read-only lists/details |
| POST | upload?kind=IMAGE or SUBTITLE | Bounded validated small uploads |
| GET/PATCH/DELETE | media/:id | Safe metadata/name/deletion |
| POST | video-upload | Authorized, configured signed video upload |
| POST | media/:id/complete | Verify direct-upload metadata |
| POST | episodes/:seasonId/reorder | Atomic validated complete ordering |
| POST | notifications/:id/read | Mark the administrator's own notification read |

GET `/api/media/:id` is ready-image-only. Public `/api/v1/categories`, homepage sections/banners, catalog category filtering, plan features, episode access and platform metadata integrations were added to existing services. Response/error envelopes remain consistent with Step 3.

## 10. Database changes

Additive migration `20261108092322_admin_cms` (fifth migration): new MediaUpload model; account suspension timestamp; content age rating/production/featured flag; episode language/access; genre/category visibility/order; banner copy/destinations; plan features; coupon usage limits; optional safe audit metadata. Existing data and relations are retained. Total: 40 Prisma models.

Apply checked-in migrations and regenerate client:

```powershell
Set-Location 'C:\Users\HP\Documents\ChatGPT\Movie website build\frame-bd'
npm.cmd ci
npm.cmd run db:start
npm.cmd run db:migrate
npm.cmd run db:generate
npm.cmd run db:restrict
npm.cmd run db:status
```

`db:restrict` is only for this isolated local cluster. On hosted databases, use separate properly granted runtime and migration accounts. Keep normal SMTP and application startup instructions from README. No destructive reset or default admin was used.

For first owner access, register and verify your actual intended account, then run this local operator command with its email:

```powershell
npm.cmd run admin:grant -- your-verified-email@example.com SUPER_ADMIN
```

Sign in and open `/admin` (also linked from an administrator's profile). There is no universal admin password. Browser test accounts are disposable and removed, not supplied as production credentials.

## 11. Security

Server page/API authorization, verified accounts, expiring database sessions, fresh role reads, strict mutation origins/CSRF defenses, separate shared read/write rate counters (300 reads/60 writes per minute per admin), bounded bodies, strict Zod schemas and parameterized queries. Safe Prisma conflict errors expose no SQL/credentials. Media keys and auth secrets are not serialized into collection/details responses. Images are re-encoded; premium video/subtitles stay private. Referenced-file deletion and image/reference updates share a transaction advisory lock. Mutation/audit changes commit together where database work is involved; logs record actor/action/record/time and field names, not submitted secrets.

The user-reported hydration mismatch was an extension-injected `cz-shortcut-listen` body attribute. A documented `suppressHydrationWarning` is scoped to the body element so that external attribute mutation does not trigger the overlay; descendant hydration checking remains enabled. No app-wide hydration suppression was added.

## 12. Verification

Final production run: admin integration 13/13, existing backend integration 14/14 and catalog/playback contracts 6/6 passed (33 tests total). Frontend smoke passed 79 URLs, four expected 404s, six redirects and health. TypeScript/production Webpack build, lint, Prisma validation/status and fresh-database migration replay/no drift passed. Production dependency audit: zero findings; the existing development lint chain retains eight moderate findings, no high/critical findings.

Automated admin integration tests use actual registration, SMTP-delivered verification and login, disposable scoped fixtures, strict permissions, CRUD, publication/scheduling, episodes, image/subtitle upload and metadata, category visibility, homepage, user suspension, protected billing, settings/maintenance, analytics and audit logging. All admin page/collection routes receive authenticated HTTP checks. Existing Step 3 tests and Step 2 contracts remain enabled. Suites ran sequentially against the final production server; temporary accounts/content/settings were cleaned/restored. A route-smoke run interrupted by the dev-server restart was rerun successfully against the production server.

Browser review verified login, admin navigation, draft creation/search, confirmation cancellation, desktop/tablet/mobile layout, mobile menu/table scrolling and completed logout/protected redirect. Screenshots under `docs/step4-*` show real database state during disposable UI review; those fixtures were subsequently removed. No browser console errors were observed in that review.

## 13. Remaining external dependencies and limits

Real R2/S3 credentials and bucket CORS were not supplied, so remote direct video upload is implemented but not claimed to have been exercised against a merchant/user cloud account. Small local image/subtitle uploads were exercised. Larger/resumable multipart uploads, media malware scanning/transcoding, licensed playback telemetry and confirmed recurring renewals await the streaming/provider phases. No unauthorized films are bundled. External SMTP and real merchant onboarding remain deployment configuration.

Selectors currently load up to 1,000 safe records; very large installations should replace them with paginated async search. Analytics use operational tables, not a warehouse or measured streaming telemetry. Simultaneous edits use transactional integrity but not an optimistic editor-version conflict UI. Cross-service object deletion can require operator reconciliation after a storage/database outage; production storage lifecycle/orphan monitoring and backup/restore procedures are still required. Development lint dependency audit findings from Step 3 remain a maintenance item; no forceful major-version audit fix was applied. Step 5 requires user review and approval.

সহজ ভাষায়: dashboard-এর কোনো সংখ্যা বানানো নয়। Admin-এর ক্ষমতা server যাচাই করে। ব্যবহৃত content/media হঠাৎ মুছে যেতে বাধা দেওয়া হয়েছে, আর payment সত্যি provider যাচাই না করলে premium চালু হয় না।
