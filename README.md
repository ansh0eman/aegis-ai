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
- `app/chat/page.tsx` defines the interactive chat page at `/chat` and reads the
  response stream in the browser and reloads saved messages by conversation ID.
- `app/api/chat/route.ts` handles `POST /api/chat` requests on the server and
  stores user/assistant messages through Drizzle while streaming text from the
  OpenAI Responses API.
- `app/api/conversations/[id]/route.ts` loads saved messages for one conversation.
- `db/schema.ts` defines the SQLite tables and their relationship.
- `db/index.ts` opens the server-only SQLite connection and creates the Drizzle
  client.
- `app/globals.css` contains Tailwind CSS and global theme styles.
- `public/` is reserved for static assets that are served from the site root.
