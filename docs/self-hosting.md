# Self-hosting

This guide covers the repository's local Docker path and future operator-controlled hosting. It does not deploy the app or enable public access.

## Prerequisites and start

Use Docker Engine/Compose v2, a persistent writable volume, and a random `AUTH_SECRET` of at least 32 bytes. Configure `OPENAI_API_KEY` only if private live chat is needed. Plan TLS before public exposure.

```bash
cp .env.example .env.local
# Set AUTH_SECRET and desired server-side provider keys in .env.local.
docker compose --env-file .env.local config --quiet
docker compose --env-file .env.local up --build -d
docker compose --env-file .env.local ps
docker compose --env-file .env.local logs --tail=100 aegis
```

Compose binds to `127.0.0.1:3000`, closes public registration, and mounts SQLite at `/data/aegis.db`. Never use a personal database for shared demo accounts; see [demo operator notes](public-demo.md).

## Runtime and data

The Node 24 container runs as the unprivileged `node` user and applies committed migrations before startup. Runtime secrets are supplied through environment configuration, not image build args. Protect the host and Docker daemon.

The named volume survives container replacement but is not a backup. Keep one app instance for this SQLite/process-local design. Back up before migrations, store encrypted copies elsewhere, and test restore into a separate database. Monitor disk, container health, SQLite lock errors, provider limits, and backups. No automatic backup or alerting service is included.

Set `AUTH_COOKIE_SECURE=true` behind HTTPS, keep production registration closed, and deliberately establish the first admin. Public deployment also requires host updates, firewall/SSH controls, secret rotation, provider-side limits, and incident/recovery planning.

## License and release notes

Source is MIT-licensed; the copyright line uses the repository author identity `ansh0eman`. The hero image with unknown provenance was removed and replaced by original inline SVG. Dependencies are installed from npm rather than vendored; review package notices before redistributing a bundled image.

The planned Ubuntu/Cloudflare Tunnel hostname is not verified or configured. See the [future deployment runbook](deployment-ubuntu.md); do not change portfolio DNS as part of self-hosting.
