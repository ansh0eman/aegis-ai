# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# Install dependencies (including native-addon build tools) from the lockfile.
FROM base AS deps
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

# Build Next.js in the same Node, Debian, and CPU architecture as runtime.
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p public \
  && npm run build -- --webpack

# Only the standalone server, static assets, migrations, and migration runner
# are copied into the small, non-root runtime image.
FROM base AS runner
ENV NODE_ENV=production \
  PORT=3000 \
  HOSTNAME=0.0.0.0 \
  AEGIS_DATABASE_PATH=/data/aegis.db

RUN mkdir -p /data \
  && chown node:node /data
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/drizzle ./drizzle
COPY --from=builder --chown=node:node /app/scripts/migrate.mjs ./scripts/migrate.mjs
COPY --from=builder --chown=node:node /app/scripts/setup-public-demo.mjs ./scripts/setup-public-demo.mjs
COPY --from=builder --chown=node:node /app/scripts/reset-public-demo.mjs ./scripts/reset-public-demo.mjs
# The standalone trace does not include Drizzle when it is used only by this
# separate startup migration script, so include that runtime package explicitly.
COPY --from=deps --chown=node:node /app/node_modules/drizzle-orm ./node_modules/drizzle-orm

USER node
EXPOSE 3000

CMD ["sh", "-c", "node scripts/migrate.mjs && exec node server.js"]
