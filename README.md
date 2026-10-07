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
- `npm run build` creates a production build and runs Next.js type checks.
- `npm run start` serves the production build.
- `npm run db:generate` creates a migration from changes to `db/schema.ts`.
- `npm run db:migrate` applies pending migrations to `aegis.db`.

## Local database

The server stores conversations in `aegis.db` at the project root. This local
SQLite file is ignored by Git. Table structure lives in `db/schema.ts`; generated
SQL migrations are kept in `drizzle/`. Run migrations with `npm run db:migrate`
after generating them. Conversation IDs appear in the `/chat` URL so the page
can reload messages after a refresh.

## Project structure

- `app/layout.tsx` defines the shared HTML shell and site metadata.
- `app/page.tsx` defines the home page at `/`.
- `app/chat/page.tsx` checks the signed-in user on the server before rendering
  the protected workspace; `app/chat/chat-client.tsx` handles streaming in the browser.
- `app/login/page.tsx` and `app/register/page.tsx` render the simple auth forms.
- `app/api/auth/` contains registration, login, and logout route handlers.
- `app/admin/page.tsx` and `app/api/admin/users/route.ts` are admin-only views
  guarded by the server-side role helper. The admin page provisions member
  accounts in small batches and lets admins enable or disable accounts.
- `app/api/admin/users/[id]/route.ts` updates one account's active/disabled status.
- `app/api/chat/route.ts` handles `POST /api/chat` requests on the server and
  stores user/assistant messages through Drizzle while streaming text from the
  OpenAI Responses API.
- `app/api/conversations/[id]/route.ts` loads messages only after checking that
  the signed-in user owns the conversation.
- `db/schema.ts` defines the SQLite tables and their relationship.
- Users have a database-constrained `member`/`admin` role and
  `active`/`disabled` status. Registration and provisioning always create
  active members; disabled users cannot log in or use existing sessions.
- `lib/auth.ts` verifies signed sessions and loads the current user on the server.
- `lib/authorization.ts` centralizes authenticated-user and admin checks.
- `lib/password.ts` hashes and verifies passwords on the server.
- `db/index.ts` opens the server-only SQLite connection and creates the Drizzle
  client.
- `app/globals.css` contains Tailwind CSS and global theme styles.
- `public/` is reserved for static assets that are served from the site root.
