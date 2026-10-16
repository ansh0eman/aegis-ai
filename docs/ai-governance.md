# AI governance

## Per-user policy

`ai_policies` stores `aiEnabled`, `maxPromptChars`, and `maxRequestsPerDay` for a user. `lib/ai-policy.ts` defines defaults (enabled, 4,000 prompt characters, 100 requests/day) when no row exists. The admin UI can edit policies within server-validated bounds (up to 20,000 prompt characters and 1,000 requests/day). These are request admission controls, not token accounting or a billing system.

## Admission path

Before private OpenAI inference, `lib/chat-admission.ts` rechecks active status and policy in an immediate SQLite transaction, validates message length and conversation ownership, counts UTC-day usage, checks an optional separate public-account daily cap, and writes the user message and usage row. When rejected, it does not call the provider or persist the new message. The transaction prevents concurrent requests from claiming the same remaining application quota slot.

`ai_usage` is a count of admitted chat requests, not model tokens, latency, dollars, or successful completions. A provider failure after admission still counts. There is no automatic quota reset job: daily usage is computed from timestamps in the current UTC day.

## Admin changes and audit

Admin routes can provision member accounts, enable/disable accounts, and update AI policies. Server-side authorization is checked on each route. Mutation helpers commit the relevant audit event with the successful write. `GET /api/admin/audit` and `/admin/audit` return/show recent events to admins; audit listing is capped at 100. Safe metadata includes the changed action and small context, not credentials.

## Limits are not billing controls

The application can limit admitted requests, prompt characters, and optional output tokens/duration. It cannot guarantee provider spend, inspect the billing tier tied to a key, or prevent every abuse path. Provider-side budgets/alerts, key scoping, and monitoring remain necessary. The optional public Groq mode has its own global daily and optional per-IP admission counters in `demo_request_buckets`, a process concurrency cap, and operator-gated model selection. Shared limits do not become stronger by being described as “governance.”

## Audit limitations

Application writes are append-only by convention—there is no edit/delete audit API. They are not immutable against a host/database administrator. There is no external SIEM export, retention policy, alerting, or cryptographic chain. Keep database backups and host access controlled; do not treat the app audit view as a substitute for infrastructure logs.
