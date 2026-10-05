# Aegis AI

Aegis AI is an enterprise-style AI workspace built as a portfolio project. The
repository currently contains the Step 1 browser-to-API chat workflow.

## Getting Started

Install dependencies and start the development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in a browser.

## Available scripts

- `npm run dev` starts the local development server.
- `npm run lint` checks the code with ESLint.
- `npm run build` creates a production build and runs Next.js type checks.
- `npm run start` serves the production build.

## Project structure

- `app/layout.tsx` defines the shared HTML shell and site metadata.
- `app/page.tsx` defines the home page at `/`.
- `app/chat/page.tsx` defines the interactive chat page at `/chat`.
- `app/api/chat/route.ts` handles `POST /api/chat` requests on the server.
- `app/globals.css` contains Tailwind CSS and global theme styles.
- `public/` is reserved for static assets that are served from the site root.
