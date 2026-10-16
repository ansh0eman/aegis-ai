# Architecture

Aegis is a single-instance reference app showing how identity, policy, persistence, and model inference fit together. It is not tenant-isolated or horizontally scaled.

| Area | Location | Role |
| --- | --- | --- |
| UI | `app/` | Server-rendered pages and client interactions |
| HTTP | `app/api/` | Validation, authorization, database work, provider calls, SSE |
| Server helpers | `lib/` | Auth, admission, audit, streams, demo limits |
| Storage | `db/`, `drizzle/` | SQLite/Drizzle schema and migrations |
| Runtime | `Dockerfile`, `compose.yaml` | Standalone Node container and persistent volume |

## Private chat

```mermaid
sequenceDiagram
  participant B as Browser
  participant R as POST /api/chat
  participant D as SQLite / Drizzle
  participant O as OpenAI
  B->>R: Message and session cookie
  R->>D: Verify owner, policy, quota; save user message/usage
  R->>O: Recent history plus new message
  O-->>R: Streamed output
  R-->>B: SSE deltas
  R->>D: Save complete assistant response
```

`lib/chat-admission.ts` rechecks account status, ownership, and quota in an immediate transaction, loading up to 12 earlier messages. The current message is added once. The provider call occurs after commit; if generation fails or is cancelled, the user row and admitted usage remain, but no assistant row is saved.

## Demo modes

- `/demo` is a synthetic browser-side playground. Scripted responses do not call a model or access user records. Optional live demo chat uses a separate `/api/demo/chat` route and `GROQ_API_KEY`; it is disabled by default and writes only bounded abuse counters.
- The optional shared-account demo uses real auth and a dedicated `aegis-public-demo.db`. Its users intentionally share their records. It requires explicit configuration and separate deployment.

Do not treat simulated roles as authorization. Real page and API access checks run on the server.

## Failure and limits

Invalid or unauthorized requests are rejected before private inference. Provider/internal errors are returned safely; incomplete streams are not persisted as complete assistant messages. SQLite busy errors fail the guarded write; no general retry queue exists. The app assumes a trusted host, secret environment, and persistent SQLite volume. TLS, backups, provider billing limits, and monitoring remain operator responsibilities.

No SSO/MFA, tenancy, external SIEM, billing enforcement, or multi-replica architecture is included. See [authentication](authentication-and-rbac.md), [database/concurrency](database-and-concurrency.md), and [self-hosting](self-hosting.md).
