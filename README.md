# Aegis AI

Aegis AI is an enterprise-style AI workspace built as a portfolio project. The
chat workflow streams responses and stores conversations in a local SQLite
database through Drizzle ORM.

## Getting Started

Install dependencies and start the development server:

```bash
npm install
npm run db:migrate
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in a browser.

## OpenAI API key

Add your key to `.env.local` in the project root:

```text
OPENAI_API_KEY=your_api_key_here
```

Next.js loads `.env.local` for server-side code. Keep this key out of browser
code and do not rename it with a `NEXT_PUBLIC_` prefix. Git ignores `.env.local`.

Authentication also requires a private `AUTH_SECRET` value in `.env.local`.
It is used only by server code to sign session tokens. Do not add a `NEXT_PUBLIC_`
prefix or commit `.env.local`. New accounts require a valid email and a password
of at least 12 characters. Passwords are stored as Argon2id hashes; raw
passwords are never stored.

Public registration is available in development but closed by default when
`NODE_ENV=production`. For a limited onboarding window, set
`AEGIS_ALLOW_PUBLIC_REGISTRATION=true`, create the initial account, then remove
that setting and restart. Use a controlled operator procedure to bootstrap a
production admin account.

## Local admin access

There is no public role-change endpoint. To promote one existing account in the
local development database, register it normally, then run:

```bash
npm run db:promote-admin -- user@example.com --local
```

The command updates only that email in local `aegis.db`. It refuses to run when
`NODE_ENV=production`. After promotion, log out and back in; the server loads
the role from SQLite on each request rather than trusting a role in the JWT.

## Available scripts

- `npm run dev` starts the local development server.
- `npm run lint` checks the code with ESLint.
- `npm run test:sse` and `npm run test:step11` run focused streaming and isolated
  SQLite integrity tests.
- `npm run build` creates a production build and runs Next.js type checks.
- `npm run start` serves the production build.
- `npm run db:generate` creates a migration from changes to `db/schema.ts`.
- `npm run db:migrate` applies pending migrations to `aegis.db`.

## Local database

The server stores conversations in `aegis.db` at the project root. This local
SQLite file is ignored by Git. Table structure lives in `db/schema.ts`; generated
SQL migrations are kept in `drizzle/`. Run migrations with `npm run db:migrate`
after generating them. Conversation IDs appear in the `/chat` URL so the page
can reload messages after a refresh. For isolated local testing, both the app and
Drizzle CLI accept the server-side `AEGIS_DATABASE_PATH` environment variable;
otherwise they use `./aegis.db`.

## Run with Docker

Docker packages the app and its production runtime into an image. A container
is one running instance of that image. The image is built in stages: Node
dependencies (including native SQLite/password modules) are installed and the
Next.js standalone server is built, then only the runtime files are copied into
the final image. The runtime uses the Node 24 LTS Debian slim image and runs as
the unprivileged `node` user.

Docker Compose defines the local app service and a named volume for SQLite.
The database lives at `/data/aegis.db` inside the container; `aegis_data` keeps
it outside the replaceable container and image. The host's `aegis.db` is neither
copied into the image nor mounted into the container. The app applies already
generated Drizzle migrations on startup, before starting Next.js; it never
generates migrations at runtime. Run one app container at a time because this
simple setup is intended for a single instance, not multi-replica deployment.

The Compose configuration requires `OPENAI_API_KEY` and `AUTH_SECRET` from
`.env.local`. Compose passes them to the running server; the Dockerfile does
not bake them into an image. Keep the Docker daemon and access to it trusted,
since runtime environment variables can be inspected by Docker administrators.
Local Compose binds the app only to `127.0.0.1:3000`, closes public registration,
and disables Secure cookies only for local plain-HTTP testing. Use HTTPS and
Secure cookies for a public deployment.

From the repository root, validate the Compose file without printing resolved
environment values, then build and start the app:

```bash
docker compose --env-file .env.local config --quiet
docker compose --env-file .env.local up --build -d
docker compose --env-file .env.local ps
docker compose --env-file .env.local logs --tail=100 aegis
```

Open [http://localhost:3000](http://localhost:3000). The service health check
requests the home page. On startup, migration logs should report that the
database is up to date. To stop the container while retaining data, use
`docker compose --env-file .env.local down` (do not add `-v` if you want to
keep the database). Starting it again with
`docker compose --env-file .env.local up -d` reuses the same named volume.

To confirm the migration history survives replacing the container, compare the
count before and after a recreate:

```bash
docker compose --env-file .env.local exec -T aegis node -e "const D=require('better-sqlite3');const d=new D('/data/aegis.db',{readonly:true});console.log(d.prepare('select count(*) as migrations from __drizzle_migrations').get().migrations);d.close()"
docker compose --env-file .env.local up --force-recreate -d aegis
docker compose --env-file .env.local exec -T aegis node -e "const D=require('better-sqlite3');const d=new D('/data/aegis.db',{readonly:true});console.log(d.prepare('select count(*) as migrations from __drizzle_migrations').get().migrations);d.close()"
```

For a consistent SQLite backup, use SQLite's backup API from the running
container, then copy that completed backup to the ignored local `backups/`
directory:

```bash
mkdir -p backups
container_id=$(docker compose --env-file .env.local ps -q aegis)
docker exec "$container_id" node -e "const D=require('better-sqlite3');new D('/data/aegis.db',{readonly:true}).backup('/tmp/aegis-backup.db').then(()=>console.log('Backup ready'))"
docker cp "$container_id:/tmp/aegis-backup.db" backups/aegis-container-backup.db
```

The backup is a separate file; protect it like production data. Test restores
against a separate disposable database, never by overwriting the live volume.
Keep backups outside Git and make sure your hosting provider also protects and
backs up its persistent storage.

For another CPU architecture, build on that architecture or use Buildx, for
example `docker buildx build --platform linux/amd64 -t aegis-ai:local .`. The
container still expects one persistent writable volume at `/data`. Before
upgrading, back up the database, then build and recreate the app. Migrations
run before the server starts; when moving to multiple replicas, use a separate
single-run migration job and deployment coordination instead of letting every
replica migrate concurrently.

## Project structure

- `app/layout.tsx` defines the shared HTML shell and site metadata.
- `app/page.tsx` defines the home page at `/`.
- `app/chat/page.tsx` checks the signed-in user on the server before rendering
  the protected workspace; `app/chat/chat-client.tsx` handles streaming in the browser.
- `app/login/page.tsx` and `app/register/page.tsx` render the simple auth forms.
- `app/api/auth/` contains registration, login, and logout route handlers.
- `app/admin/page.tsx` and `app/api/admin/users/route.ts` are admin-only views
  guarded by the server-side role helper. The admin page provisions member
  accounts in small batches, lets admins enable or disable accounts, and edit a
  user's AI policy inline.
- `app/api/admin/users/[id]/route.ts` updates one account's active/disabled status.
- `app/api/admin/users/[id]/ai-policy/route.ts` lets admins read and update a
  user's AI policy; `/admin` exposes the small inline editor.
- `app/admin/audit/page.tsx` and `app/api/admin/audit/route.ts` show the latest
  account provisioning and status-change events to admins.
- `app/api/chat/route.ts` handles `POST /api/chat` requests on the server and
  checks the user's AI policy and UTC-day usage before writing messages or
  streaming text from the OpenAI Responses API.
- `app/api/conversations/[id]/route.ts` loads messages only after checking that
  the signed-in user owns the conversation.
- `db/schema.ts` defines the SQLite tables and their relationships. AI policy
  rows are optional; users without one receive the defaults (AI enabled, 4,000
  prompt characters, and 100 accepted requests per UTC day). `ai_usage` records
  accepted requests, not tokens or successful completions.
- Users have a database-constrained `member`/`admin` role and
  `active`/`disabled` status. Registration and provisioning always create
  active members; disabled users cannot log in or use existing sessions.
- `lib/auth.ts` verifies signed sessions and loads the current user on the server.
- `lib/authorization.ts` centralizes authenticated-user and admin checks.
- `lib/audit.ts` writes audit entries in the same transaction as user mutations
  and reads a safe, newest-first list for admin views.
- `lib/ai-policy.ts` contains server-side policy defaults and database fallback.
- `lib/password.ts` hashes and verifies passwords on the server.
- `db/index.ts` opens the server-only SQLite connection and creates the Drizzle
  client.
- Production deployment should use a persistent SQLite volume or another
  explicitly supported persistent host. The app does not configure WAL; SQLite
  still has a single writer, and a local file may be ephemeral on serverless
  hosting. Apply edge-level rate limiting before opening public access.
- `app/globals.css` contains Tailwind CSS and global theme styles.
- `public/` is reserved for static assets that are served from the site root.
