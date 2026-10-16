# Public demo operator notes

This file documents optional repository-supported public-demo modes. It does not claim that any public Aegis deployment exists. The source repository task does not configure hosting, DNS, a public URL, or shared credentials.

## Two separate demo modes

### Quick Demo (`/demo`)

The role-switching playground uses synthetic browser state. Its scripted responses do not call a model or access production user data. Optional live inference uses a separate Groq-compatible route and server-side `GROQ_API_KEY`; it is disabled by default. It has bounded prompt/output/duration settings, a small concurrency cap, a database-backed shared global daily counter, and an optional per-IP counter only when the trusted proxy is configured. The app cannot verify a provider key's billing plan. Set both `DEMO_LIVE_INFERENCE_ENABLED=true` and `DEMO_GROQ_FREE_TIER_CONFIRMED=true` only after verifying account tier/model limits in the provider console. These settings do not guarantee a free request.

### Full Application Demo (shared accounts)

This optional mode uses real login, JWT sessions, account status, role checks, SQLite conversations, policies, usage, and audit behavior. Data is shared among anyone who uses the same demo credentials. Never accept personal, confidential, or sensitive information in those accounts.

The app fails closed unless the public-demo flag, database flag, exact `aegis-public-demo.db` filename, and three distinct configured addresses agree. Use a separate host/service and persistent volume—not a personal or private database. Set `AUTH_COOKIE_SECURE=true`, leave public registration closed, and ensure TLS before enabling sign-in.

## Guarded account setup

First migrate the dedicated DB, then execute setup in the exact deployment environment/container that uses the dedicated volume:

```bash
npm run db:migrate
npm run db:setup-public-demo
```

For Compose:

```bash
docker compose --env-file .env.local exec -T aegis node scripts/setup-public-demo.mjs
```

The setup script checks the explicit public-database flag and expected database filename, creates the designated three accounts if missing, and hashes generated passwords with Argon2id. It prints generated credentials to the operator once; handle them as secrets. Re-running setup does not rotate existing passwords. The repo does not authorize publishing those credentials automatically. If chosen, they must be explicitly approved as disposable public credentials after deployment isolation is verified.

## Public shared-data notice and live OpenAI

The shared login page and authenticated chat/admin pages warn users that other visitors may see content in shared demo accounts. The private OpenAI route has extra limits for configured shared demo accounts, but it still uses the shared OpenAI API key and provider billing if explicitly enabled. Keep `PUBLIC_DEMO_OPENAI_ENABLED=false` unless the operator has reviewed billing, limits, credential publication, and expected data exposure.

## Reset

Reset is destructive to the selected demo's history and policies. Back up anything that must be retained and validate the path/volume first. The script requires a confirmation flag and repeats database identity checks. It restores the three designated account roles/status, resets policies, removes demo conversations/usage/audit and request counters, then seeds synthetic sample conversations. It has no web endpoint.

```bash
npm run db:reset-public-demo -- --confirm-public-demo-reset
```

For Compose:

```bash
docker compose --env-file .env.local exec -T aegis node scripts/reset-public-demo.mjs --confirm-public-demo-reset
```

Do not run setup/reset against a personal database. See [demo behavior](demo.md), [self-hosting](self-hosting.md), and [future Ubuntu runbook](deployment-ubuntu.md).
