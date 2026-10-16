# Database and concurrency

SQLite is a file-backed relational database; Drizzle supplies the TypeScript schema/query and migration layer. `db/schema.ts` defines tables, `db/index.ts` creates the server-only connection, and `drizzle/` stores generated migrations.

| Table | Purpose |
| --- | --- |
| `users` | Account identity, role, status, password hash |
| `conversations`, `messages` | Owned chats with ordered role/content rows |
| `ai_policies`, `ai_usage` | Per-user settings and admitted request counts |
| `audit_logs` | Actor, optional target, action, safe metadata, time |
| `demo_request_buckets` | Bounded public-demo counters |

Foreign keys and checks enforce ownership and allowed values. Separate conversation/message rows make ordering and access constraints queryable instead of hiding them in one JSON blob.

## Migrations and transactions

Edit `db/schema.ts`, generate and inspect changes with `npm run db:generate`, then apply locally with `npm run db:migrate`. The container applies committed migrations before startup. Back up data before schema changes and test migrations on a disposable database.

Provisioning, status and policy updates commit their audit records in the same transaction. Chat admission uses an immediate transaction to recheck account status, ownership and quota, then insert the user message and usage row. The provider call happens after commit, so a provider failure keeps the admitted user row/usage but creates no assistant row. Busy locks fail; there is no general retry queue.

No transaction spans a network call. Password hashing is done before the write transaction to avoid holding SQLite's lock during Argon2 work.

## Limits and tests

The intended deployment is one app instance with persistent local SQLite storage. Network filesystems and multiple app replicas require a different data architecture. Audit rows are not tamper-proof against the host/database owner.

`npm run test:step11` covers independent-connection quota races, lock failures, concurrent/duplicate provisioning, audit rollback, status changes, and schema constraints. `npm run test:demo` covers demo DB isolation and limits. These tests do not prove host-level durability, restore recovery, or multi-host behavior.
