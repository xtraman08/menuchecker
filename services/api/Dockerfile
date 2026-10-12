# syntax=docker/dockerfile:1
# Build context: repository root (see docker-compose.yml).
#   target `runtime` (default): the Fastify API, non-root.
#   target `migrate`:           one-shot migrations / seed runner for db/.

ARG NODE_IMAGE=node:24-slim

# ---- manifests: every workspace package.json so `npm ci` matches the lockfile ----
FROM ${NODE_IMAGE} AS manifests
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY db/package.json db/
COPY services/api/package.json services/api/
COPY apps/mobile/package.json apps/mobile/
COPY e2e/package.json e2e/

# ---- build: full deps for api + shared, then bundle with tsup ----
FROM manifests AS build
RUN --mount=type=cache,target=/root/.npm \
    npm ci -w @fare/api -w @fare/shared --include-workspace-root=false --no-audit --no-fund
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY services/api services/api
RUN npm run build -w @fare/api

# ---- prod-deps: runtime dependencies only ----
FROM manifests AS prod-deps
RUN --mount=type=cache,target=/root/.npm \
    npm ci -w @fare/api --omit=dev --include-workspace-root=false --no-audit --no-fund \
 && mkdir -p services/api/node_modules

# ---- migrate: db workspace (pg + plain SQL) ----
FROM ${NODE_IMAGE} AS migrate
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=manifests /repo /repo
RUN --mount=type=cache,target=/root/.npm \
    npm ci -w @fare/db --omit=dev --include-workspace-root=false --no-audit --no-fund
COPY db db
USER node
CMD ["node", "db/scripts/migrate.mjs"]

# ---- runtime ----
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=prod-deps --chown=node:node /repo/node_modules node_modules
COPY --from=prod-deps --chown=node:node /repo/services/api/package.json services/api/package.json
COPY --from=prod-deps --chown=node:node /repo/services/api/node_modules services/api/node_modules
COPY --from=build --chown=node:node /repo/services/api/dist services/api/dist
WORKDIR /repo/services/api
USER node
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.API_PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
