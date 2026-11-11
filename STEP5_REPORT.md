# Frame BD Step 5 — Streaming implementation

Review date: 9 November 2026. Step 6 is not started.

## 1. Streaming architecture

The existing Next.js application remains the viewer/admin frontend and authorization gateway. PostgreSQL holds upload parts, leased processing jobs, HLS asset metadata, playback sessions and viewing progress. A separate Node worker runs FFprobe/FFmpeg. Private originals become verified HLS outputs before an asset is marked ready. Upload completion alone never grants playback.

Code is separated under `src/modules/streaming`, `src/components/player`, `src/components/admin/streaming-admin.tsx` and `scripts/stream-worker.ts`. Six additive migrations and 43 Prisma models are now present. Existing authentication, catalog and billing boundaries remain in use.

সহজভাবে: upload শেষ হওয়া মানেই ভিডিও প্রস্তুত নয়। Worker ভিডিও পরীক্ষা ও processing শেষ করলে তবেই player সেটি চালাতে পারে।

## 2. Storage integration

Private R2/S3 storage supports multipart originals, HLS output, thumbnails and subtitle objects. Server credentials never enter browser bundles. Loopback development uses explicit `STREAM_LOCAL_STORAGE=true`, with originals and HLS under ignored `.local/streaming`; subtitle files remain private under `.local/media`. Object keys are validated against traversal.

Delivery currently passes through the same-origin authorization gateway with private/no-store responses. External CDN delivery is not configured; a future edge gateway must preserve equivalent entitlement checks. Do not expose the bucket publicly.

## 3. Upload functionality

Admin Media includes multipart upload progress, bounded automatic part retries, cancellation, verified completion, source selection, content/episode association, queueing and job monitoring. Remote completion validates listed parts and object size. Local uploads verify bytes and assemble parts privately. Processing retries are explicit. Deletion rejects assets/jobs still referenced by active processing or content. Upload limits are 100 GB for configured cloud storage and 128 MB for local development. The tested multipart boundary is 9 MB across two parts, not a 100 GB transfer.

R2/S3 bucket CORS must allow only the application origin, PUT uploads and the required content headers, and expose ETag. Browser upload URLs expire after 15 minutes. See [Cloudflare presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/) and [CORS](https://developers.cloudflare.com/r2/buckets/cors/).

## 4. FFmpeg workflow

Workers claim PostgreSQL jobs atomically, heartbeat a two-minute lease and fence stale workers. Expired jobs are reclaimed up to three attempts. FFprobe validates source format, video, duration and dimensions. FFmpeg produces H.264/AAC VOD HLS with independent four-second segments, 360p/480p/720p/1080p when supported by source height, without upscaling. Up to four audio streams become selectable tracks. Optional preview generation uses `STREAM_THUMBNAILS=true`.

All generated files and playlist references are checked and stored before READY/100% is committed. Failed jobs retain safe error codes, never publish a playable asset and can be retried. Temporary directories and unused failed outputs are cleaned. Use maintained production FFmpeg binaries; bundled development binaries are for the owned synthetic fixture. [FFmpeg HLS documentation](https://ffmpeg.org/ffmpeg-formats.html#hls-2).

## 5. HLS player features

The custom player provides play/pause, seek/time, volume/mute, speed, automatic/manual rendition selection, audio selection, subtitle selection, buffering/error status, bounded recovery, retry and scoped keyboard shortcuts. HLS.js is loaded only after Play; Safari can use native HLS. Native capability varies, so native controls remain available there. No video bytes load before Play.

Fullscreen uses browser fullscreen/Apple native APIs and attempts landscape locking when supported. Embedded browsers that reject fullscreen use an explicit full-viewport fallback. Escape and the fullscreen button exit that fallback.

## 6. Playback authorization

`POST /api/stream/session` validates publication, regional access, active account and premium entitlement. Sessions expire after ten minutes, renew every two minutes and require a new session after eight hours. A signed HttpOnly SameSite cookie binds requests to the viewer; copied URLs alone fail. Account sessions remain bound to the actual authentication session. Manifest, segment and subtitle requests recheck expiry, suspension, publication and verified live premium payment dates. Private storage paths and credentials are excluded from viewer responses.

এটি DRM নয়। অনুমোদিত দর্শকের screen recording বা সব ধরনের copying ঠেকানোর দাবি করা হচ্ছে না। No fake payment/subscription verification was added.

## 7. Watch progress

Authenticated progress uses account-owned database records and stable episode foreign keys. Playback-session progress uses worker-probed duration instead of trusting the submitted duration. Progress saves periodically, on pause and on page lifecycle events where possible; navigation saves are best effort. Guest progress remains in browser storage. Account progress is not copied into guest storage. Continue Watching selects the latest available unfinished episode; explicit missing episodes return 404. Previous/next and season/episode controls are present. Next-episode autoplay requires an explicit saved browser preference.

## 8. Subtitles

Authorized VTT/SRT uploads are validated; SRT timing is converted to WebVTT and HTML is stripped. Invalid/binary/script input is rejected. Session-protected subtitle routes validate content/episode ownership. The player enables/disables language tracks. The owned demo includes English captions.

## 9. Mobile/browser results

Actual decoded playback reached 720p in Chromium. Manual 360p switching, alternate audio and 1.25x speed were checked. The 390px viewport played HLS with captions and no horizontal overflow. Full-viewport fallback filled the 844px viewport when native fullscreen was blocked by the embedded browser. Real iOS/Android hardware and Safari native fullscreen were not available for verification.

Account browser review paused at seven seconds; after reload and Play, the player displayed `Resuming at 00:07` and continued from that position. Disposable browser accounts were removed after sign-out. Evidence: `docs/step5-mobile-player.png` and `docs/step5-desktop-player.png`.

## 10. Environment and Windows setup

Keep existing private database/auth/SMTP configuration. `.env.example` contains blank server-only cloud credentials and worker configuration. Production requires DATABASE_URL, DIRECT_URL for migrations, BETTER_AUTH_SECRET, canonical HTTPS BETTER_AUTH_URL, private S3_ENDPOINT/S3_REGION/S3_BUCKET/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY, and absolute FFMPEG_PATH/FFPROBE_PATH. PLAYBACK_SIGNING_SECRET is optional; a namespaced key is otherwise derived from the authentication secret. APP_REGION is the configured deployment region, not verified viewer geolocation. TRANSCODE_WORK_DIR needs sufficient disk for input plus renditions; TRANSCODE_TIMEOUT_SECONDS defaults to 10800. No external queue service is required for this phase.

From PowerShell in the project folder:

```powershell
npm install
node node_modules/ffmpeg-static/install.js
npm run db:start
npm run db:migrate
npm run db:restrict
npm run db:generate
npm run mail:dev
```

In another terminal, set `STREAM_LOCAL_STORAGE=true` only in the private local `.env`, then:

```powershell
npm run stream:demo
npm run dev
```

Run the worker in a third terminal:

```powershell
npm run worker:stream
```

The demo command is loopback-only and generates original test patterns/audio; it does not download movies. Open `http://localhost:3000/watch/frame-bd-streaming-lab`. Use Admin → Media for owned uploads. Existing first-owner instructions remain in STEP4_REPORT.md. For production, provision a maintained FFmpeg installation, private cloud bucket/CORS, secure application/worker services, HTTPS, backups and monitoring before deployment. Do not copy development database or mail settings to production.

## 11. Validation

45 automated tests passed: streaming 9, backend 14, admin 13, contracts/subtitles 9. Streaming exercises actual multipart bytes, FFmpeg failure/retry, generated manifests/all segments, signed cookie checks, premium expiry, suspension, publication, protected subtitles, account resume, two processed episode assets and deletion protections. A fresh disposable database replayed all six migrations with no schema drift. ESLint and TypeScript passed. Final build/runtime smoke results are recorded in DEVELOPMENT_PROGRESS.md.

## 12. Known limitations

Remote R2/S3 uploads/CORS have not been exercised without credentials. The owned source is 720p, so 1080p output is implemented but not demonstrated by that fixture. Multi-hour/100 GB processing, heavy concurrent delivery and worker crash/load endurance need production-scale tests. Optional preview generation is not yet browser-tested. Native Safari quality/audio selection follows browser support. Progress during abrupt process/network loss is best effort. Production delivery uses an application gateway rather than an edge CDN; throughput must be measured. Region enforcement currently uses deployment configuration. Signed access is not DRM. A PostgreSQL driver concurrency deprecation warning has appeared in development and should be tracked before a future driver-major upgrade. No payment provider credentials or real subscription purchases were created.
