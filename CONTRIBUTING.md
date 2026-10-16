# Contributing

Thanks for considering a contribution. Aegis AI is a learning/reference project; please keep changes small enough to review and describe what they do and what they do not prove.

## Before opening a change

1. Open an issue for larger behavior or schema changes so the tradeoffs can be discussed first.
2. Read the relevant source and documentation under `docs/`.
3. Do not include `.env.local`, API keys, JWTs, passwords, database files, backups, or real conversation data.
4. Keep public demo state isolated from private account APIs and databases.

## Development workflow

Use Node.js 24 and the committed npm lockfile:

```bash
npm ci
cp .env.example .env.local
npm run db:migrate
npm run dev
```

Inference keys are not needed for automated checks. If you choose to test real inference locally, use your own server-side credential, never print it, and do not add provider calls to tests or CI.

Run the focused checks relevant to your change, then the full suite:

```bash
npm run test:sse
npm run test:step11
npm run test:demo
npm run lint
npx tsc --noEmit
npm run build -- --webpack
git diff --check
```

For a schema change, edit `db/schema.ts`, generate a migration with `npm run db:generate`, inspect the generated SQL and migration journal, and test applying it to a fresh database. Never replace an existing migration to change its meaning.

## Pull requests

Describe the user-visible or operational change, the security/data boundaries affected, tests run, and any known limitations. Include a migration or documentation update when appropriate. Do not claim a production deployment or security property based only on a local build/test.

## Scope and style

- Preserve server-side authorization and input validation.
- Keep secrets and database access out of client modules.
- Prefer focused tests using isolated temporary SQLite databases.
- Keep public demo interactions clearly labeled synthetic or live; never silently route scripted prompts to real private APIs.
- Avoid new dependencies unless the change needs them and the tradeoff is explained.
