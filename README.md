# Frame BD

Existing cinematic Next.js frontend integrated with PostgreSQL, Prisma, Better Auth, real SMTP verification and a protected admin CMS. Read [STEP4_REPORT.md](STEP4_REPORT.md) for the dashboard, media workflow, permissions and operator setup; [STEP3_REPORT.md](STEP3_REPORT.md) records the backend foundation. Step 5 has not started.

## Windows setup

Requirements: Node.js 24 LTS, npm and PostgreSQL 17 binaries. This machine has PostgreSQL at `C:\Program Files\PostgreSQL\17\bin`. Set `$env:POSTGRES_BIN` if yours differs. The local helper creates only a project-owned cluster under `.local/postgres`, listening on `127.0.0.1:55432`; it does not alter the system PostgreSQL service. It generates private credentials in `.env` and retains existing configuration.

PowerShell, first terminal:

```powershell
Set-Location 'C:\Users\HP\Documents\ChatGPT\Movie website build\frame-bd'
npm.cmd ci
npm.cmd run db:start
npm.cmd run db:generate
npm.cmd run db:migrate
npm.cmd run db:restrict
npm.cmd run db:seed
# Optional, local development only: 30 fictional titles; no accounts or payments.
npm.cmd run db:seed:demo
npm.cmd run mail:dev
```

Keep that terminal running for the local SMTP receiver. In a second terminal:

```powershell
Set-Location 'C:\Users\HP\Documents\ChatGPT\Movie website build\frame-bd'
npm.cmd run dev
```

Open [Frame BD](http://localhost:3000). Use **localhost**, matching `BETTER_AUTH_URL`, rather than a LAN IP or another origin. Do not run two Next servers on port 3000.

For this existing configured workspace, dependencies, migrations, runtime-role restriction and seeds are already installed. On later starts, run only `db:start`, `mail:dev` and `dev` in the appropriate terminals. Never overwrite the generated `.env` with the empty example.

## Verification emails and accounts

Register from `/register`; email verification is required before login. Local mode receives real SMTP messages into `.local/mailbox/messages.jsonl` instead of sending to internet addresses. Open that private file in your editor and follow the verification link from your latest message. Messages include raw MIME; quoted-printable long lines may contain `=` line wraps, which must be removed when copying a URL. Verification/reset links are sensitive and expire; never publish the inbox or share them. For normal internet delivery, configure your SMTP provider, `EMAIL_DELIVERY_MODE=external`, TLS and your verified sending domain in `.env`, then restart Next.

No default account, admin password or premium entitlement exists. See the report for the explicit verified-account admin promotion command. Guest watchlists stay in the browser; signed-in watchlists persist separately in PostgreSQL.

## Production mode on this machine

Keep PostgreSQL and SMTP running, stop the dev server, then:

```powershell
npm.cmd run build
npm.cmd run start
```

For deployment, configure a hosted PostgreSQL database, separate runtime/migration users, canonical HTTPS origin, secure random auth secret, external SMTP and backups. Run `db:migrate`, `db:generate`, `db:seed` (not demo), then build/start. The loopback database/restrict helpers are for this local cluster only. Configure `.env.example` values in server-side environment settings; no credentials belong in client code.

## Checks

With the local application, database and SMTP receiver running:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run db:validate
npm.cmd run db:status
npm.cmd run db:check
npm.cmd run test:backend
npm.cmd run test:admin
npm.cmd run test:routes
```

`db:check` creates and removes a uniquely named disposable database using local migration credentials; it never resets the application database. Backend tests use only loopback PostgreSQL/SMTP, disposable `example.test` accounts and signed provider fixtures, then remove their own records. They honor auth retry limits, so take approximately 30 seconds. Keep them off shared/production databases. Route smoke expects the optional fictional catalog.

`npm.cmd run db:maintenance` removes expired sessions/tokens/rate windows; schedule it appropriately in deployment. Stop Next/SMTP with Ctrl+C, then `npm.cmd run db:stop` when finished. Database and private inbox files persist across restarts.

## Integration boundaries

Checkout is disabled and no real merchant credentials are configured. Stripe signature verification and transaction-safe event handling exist, but cannot fabricate an expected payment. bKash/Nagad/Rocket require approved provider implementations. The admin CMS, local image/subtitle uploads and private R2/S3 integration are implemented; remote storage requires real credentials/CORS. Licensed HLS playback and transcoding remain later phases. No copyrighted films or unauthorized media sources are included. Fictional metadata is temporary development data stored in PostgreSQL, not real film availability.

Open `/admin` with an existing verified Admin/Super Admin account. For first owner setup, use the explicit `admin:grant` command in the Step 4 report. Test accounts are removed; no default admin password exists. Admin writes are audited; payments and subscriptions cannot be manually marked successful. Run backend and admin integration suites sequentially because they temporarily modify scoped fixtures and platform settings in this isolated local environment.

See [DEVELOPMENT_PROGRESS.md](DEVELOPMENT_PROGRESS.md), [STEP3_REPORT.md](STEP3_REPORT.md) and [architecture](../ARCHITECTURE.md).
