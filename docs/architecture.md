# Architecture

## Purpose

Aegis is a single-application reference for the path from a browser message to governed model inference and back. It makes identity, role checks, per-user admission, persistence, and administrative records visible in code. It is not currently a tenant-isolated or horizontally scaled service.

## Main components

| Component | Source | Responsibility |
| --- | --- | --- |
| App Router pages | `app/` | Server-rendered pages, protected-page checks, and client interaction surfaces |
| Route handlers | `app/api/` | HTTP input validation, authorization, database operations, provider calls, SSE responses |
| Domain/server helpers | `lib/` | Auth, role checks, request admission, audit writes, stream parsing, demo limits |
| Persistence | `db/schema.ts`, `db/index.ts`, `drizzle/` | SQLite tables, Drizzle connection, versioned SQL migrations |
| Runtime | `Dockerfile`, `compose.yaml`, `scripts/migrate.mjs` | Standalone Node container and migration-before-start behavior |

The app uses Next.js App Router server components for protected page data and client components for interactive forms/stream readers. `server-only` imports mark key modules such as `db/index.ts`, `lib/auth.ts`, and provider/limit helpers as server code.

## Private chat request

```mermaid
sequenceDiagram
  participant B as Browser
  participant R as POST /api/chat
  participant A as Auth + admission
  participant D as SQLite / Drizzle
  participant O as OpenAI Responses API
  B->>R: JSON message + optional conversationId, cookie
  R->>A: verify session, active account, same origin
  A->>D: check owner, policy, daily usage; reserve message/usage
  D-->>A: recent history and admitted conversation
  R->>O: history + current user message, stream=true
  O-->>R: response events
  R-->>B: SSE delta events as text arrives
  R->>D: save one complete assistant row after completed event
  R-->>B: SSE done with conversationId
```

`app/api/chat/route.ts` authenticates and validates the request. `lib/chat-admission.ts` uses a SQLite immediate transaction to recheck account status and policy, verify conversation ownership, select at most 12 previous messages, and write the new user message and usage row. The route maps the ordered history to Responses API input and appends the current request exactly once. `lib/chat-stream.ts` accumulates output while emitting deltas; the assistant row is inserted only after provider completion.

The user message and usage admission are committed before the network call. If the provider subsequently fails or the client cancels, the user row and admitted usage remain, but no assistant row is written. A repeated request is a new admitted user message; there is no idempotency key.

## Public demo boundaries

There are two different things named “demo” in the code:

1. `GET /demo` renders the interactive synthetic playground. Its governance state and scripted answers live in browser memory; reloading resets it. Optional live mode calls only `POST /api/demo/chat`, which accepts a bounded prompt, uses `GROQ_API_KEY`, and is disabled unless flags and provider settings allow it. It does not read or write real account/conversation tables; its persistent abuse counters live in `demo_request_buckets`.
2. A separately configured shared-account demonstration uses the regular authentication, `/chat`, and `/admin` flows against a dedicated `aegis-public-demo.db` path. Those three accounts share persisted data intentionally. It must be separately hosted/configured; no such deployment is asserted here. Its private chat flow uses the normal OpenAI route, with additional public-demo limits and an OpenAI-specific daily cap.

Do not confuse the synthetic role switcher with authentication or RBAC. The first is a client-side illustration; only the server-side account flow enforces authorization.

## Why Next.js and TypeScript

The App Router keeps the UI and same-origin route handlers in one TypeScript project. Server components can gate pages and query safe view data; route handlers use standard `Request`/`Response`; client components handle forms and incremental SSE rendering. This keeps the learning surface compact. A separate API service could improve independent scaling or deployment boundaries, but adds operational complexity that is not needed for this single-instance project.

## Failure behavior

- Invalid JSON/fields are rejected before a provider call.
- Unauthenticated and unauthorized operations receive 401/403 or a protected-page redirect/denial.
- Policy, ownership, account, and quota failures are rejected before OpenAI.
- Provider failures return safe messages/events; internal exceptions and keys are not sent to the browser.
- Incomplete/canceled generations do not create a completed assistant record.
- SQLite busy/transaction failures fail the admission/mutation rather than silently writing half of a guarded operation; no general retry queue exists.

## Security assumptions

The app assumes its Node process, host, environment, and SQLite volume are controlled by the operator. TLS and secure-cookie settings are deployment responsibilities. `AUTH_SECRET` and provider keys must be runtime secrets. Application-layer audit records are not tamper-proof against someone with file/host access.

## Limits and open work

- No organizations/tenants, SSO, MFA, external SIEM, billing enforcement, or provider-agnostic inference abstraction.
- SQLite with one app instance and a process-local concurrency cap is not a multi-replica deployment design.
- The shared demo's account state is deliberately visible to other visitors who use those credentials.
- Rate limits are useful admission controls, not a guarantee of provider spend or abuse prevention.
- No hosted Aegis deployment is verified by this repository task; Ubuntu and Cloudflare Tunnel steps remain a future runbook.
