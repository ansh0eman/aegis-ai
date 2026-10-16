# Contributing

Keep changes focused and describe both their behavior and limitations. For larger API/schema changes, open an issue first.

## Local workflow

Use Node.js 24 and the committed lockfile:

```bash
npm ci
cp .env.example .env.local
npm run db:migrate
npm run dev
```

Tests need no inference key. Never commit `.env.local`, credentials, JWTs, database files, backups, or real conversation data. Keep public demo interactions isolated from private account data.

Run relevant tests, then the full checks:

```bash
npm run test:sse
npm run test:step11
npm run test:demo
npm run lint
npx tsc --noEmit
npm run build -- --webpack
git diff --check
```

For schema changes, edit `db/schema.ts`, generate and review a migration with `npm run db:generate`, then test it against a disposable database. Do not rewrite an existing migration.

## Pull requests

Describe behavior, security/data boundaries, tests, migrations, and limitations. Preserve server-side authorization and validation; keep database/secrets in server-only modules. Do not claim production readiness based only on local tests.
