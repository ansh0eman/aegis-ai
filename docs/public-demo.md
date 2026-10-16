# Public demo operator notes

No public Aegis deployment, shared credentials, or DNS setup is claimed here. There are two separate optional demo modes.

## Synthetic `/demo`

The role playground uses fictional browser-side state and scripted responses; those interactions do not call a model or use account data. Optional live Quick Demo inference calls `/api/demo/chat` with a separate `GROQ_API_KEY`. It is disabled unless explicitly enabled, has prompt/output/time and concurrency limits, and writes bounded abuse counters. The app cannot verify provider billing tier; configuration is not a guarantee of free usage.

## Shared-account app demo

This mode uses real login, roles, policies, chat, and audit data. Everyone using the same demo credentials can see the shared records. Use only disposable demo data, a separate deployment/volume, TLS, closed registration, and the dedicated `aegis-public-demo.db` path. Configuration fails closed unless the public-demo flags, expected DB filename, and three distinct demo emails agree. Never point it at a personal database.

After migration, setup runs only in the isolated environment:

```bash
npm run db:migrate
npm run db:setup-public-demo
```

The script hashes generated passwords and prints them once to the operator. Handle them as secrets; publishing them requires a separate decision. Re-running setup does not rotate existing passwords.

Keep `PUBLIC_DEMO_OPENAI_ENABLED=false` unless shared OpenAI billing, limits, and data disclosure have been reviewed. Shared chat uses the private OpenAI route and provider billing.

## Reset

Reset deletes demo histories and resets policies/counters. Verify the dedicated database and back up first. The script requires an explicit confirmation flag and has no HTTP endpoint:

```bash
npm run db:reset-public-demo -- --confirm-public-demo-reset
```

For Compose, run setup/reset inside the `aegis` container using the same `.env.local` and volume. See [demo behavior](demo.md) and [self-hosting](self-hosting.md).
