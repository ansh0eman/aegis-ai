# Self-hosting

This guide describes the repository's current Docker path for local or later operator-controlled hosting. It does not deploy the app or enable public access.

## Prerequisites

- Docker Engine and Docker Compose v2.
- A stable writable volume for SQLite.
- A random `AUTH_SECRET` of at least 32 bytes.
- An `OPENAI_API_KEY` only if private live chat should run.
- A TLS/reverse-proxy plan before any public exposure.

## Local Compose run

```bash
cp .env.example .env.local
# Edit .env.local locally; do not share or commit it.
docker compose --env-file .env.local config --quiet
docker compose --env-file .env.local up --build -d
docker compose --env-file .env.local ps
docker compose --env-file .env.local logs --tail=100 aegis
```

Compose binds `127.0.0.1:3000`, closes public registration, and mounts a named volume at `/data`. The default path is `/data/aegis.db`. Do not map a personal development database into a public demo. For a shared-account demo, use a separate deployment and volume with `AEGIS_DATABASE_PATH=/data/aegis-public-demo.db` and the explicit demo flags; review [`docs/demo.md`](demo.md) and existing operator guidance in [`docs/public-demo.md`](public-demo.md) first.

## Container details

`Dockerfile` uses Node 24 Debian slim dependency/build/runtime stages. Native SQLite and Argon2 packages are installed against the runtime family; the final image runs as the unprivileged `node` user with `no-new-privileges` and dropped Linux capabilities in Compose. `next.config.ts` selects standalone output. The builder creates `.next/standalone`; the runtime copies that output, static files, public assets, migrations, and the migration script. The runtime executes `node scripts/migrate.mjs` before `server.js`.

Docker image is the packaged filesystem; a container is one running instance. The SQLite named volume survives container replacement but is not itself a backup. Runtime secrets are supplied through Compose environment, not Docker build args or image files; Docker administrators can inspect container configuration, so protect the host/daemon.

## Data and operations

- Keep exactly one app instance for this SQLite/process-limit design.
- Back up consistently with SQLite's backup API or a stopped/controlled filesystem snapshot; store backups outside the app volume and Git.
- Test restore into a separate disposable database before relying on a backup.
- Back up before migrations/upgrades. Startup migrations run automatically; inspect the migration list and SQL first.
- Monitor container health, disk space, restarts, provider errors, and logs. The current health check only confirms the home page responds; it is not deep readiness or external monitoring.
- Use `AUTH_COOKIE_SECURE=true` behind HTTPS. Compose's default false is only local HTTP convenience.
- Keep registration closed in production and provision an initial admin through a deliberate operator process.

## Release readiness

### License choice

MIT is the simpler permissive option for this portfolio/reference app: it permits reuse and redistribution with the copyright and license notice retained, without an express patent grant. Apache-2.0 is also permissive, but adds an explicit contributor patent license/termination terms and more notice requirements. The repository history identifies `ansh0eman` as the project owner and sole commit author, so the root [LICENSE](../LICENSE) uses that repository identity as copyright holder; no personal contact details are published.

The hero JPEG had no reliable source, creator, or license metadata. It has been removed from the release tree and replaced with original inline SVG. The app now uses system font stacks instead of build-downloaded Geist font files, avoiding a separate bundled font license. The committed source does not vendor `node_modules`; direct package metadata declares MIT/Apache-2.0, with their respective licenses supplied by npm installs. This is not a full audit of all transitive runtime packages.

- [ ] Confirm the repository owner is comfortable with the MIT copyright line and permissive reuse.
- [ ] Review transitive runtime dependency notices before redistributing a bundled deployment image.
- [ ] Configure repository description/topics/portfolio website; do not claim a hosted app URL.
- [ ] Run CI from a clean install and inspect final Git diff for secrets/data.
- [ ] Pick and test initial-admin bootstrap, secret rotation, backup and restore procedures.
- [ ] Configure TLS, secure cookies, registration, provider-side quotas, and host-level controls before exposure.
- [ ] Verify Cloudflare Tunnel and DNS only when the server is available; this repository phase made no DNS or hosting changes.
