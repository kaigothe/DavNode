# syntax=docker/dockerfile:1

# ---- Build stage: compiles all workspace packages ----
FROM node:22-slim AS build
WORKDIR /app

# Copy only the manifests first so `npm ci` is cached unless a
# package.json or the lockfile actually changes.
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/package.json
COPY packages/server/package.json packages/server/package.json
COPY packages/admin-api/package.json packages/admin-api/package.json
COPY packages/admin-ui/package.json packages/admin-ui/package.json
RUN npm ci

COPY tsconfig.json tsconfig.base.json ./
COPY packages ./packages
RUN npm run build --workspaces

# ---- Runtime stage: production dependencies + compiled output only ----
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/package.json
COPY packages/server/package.json packages/server/package.json
COPY packages/admin-api/package.json packages/admin-api/package.json
COPY packages/admin-ui/package.json packages/admin-ui/package.json
# Only the server and the packages it needs: the admin UI is a prebuilt
# static bundle, its React/Ant Design dependencies are not needed at runtime.
RUN npm ci --omit=dev --workspace=@davnode/server --include-workspace-root=false

# The server is started with node; npm (and the packages it bundles, which
# the image scan reports) is only needed for the install above.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

COPY --from=build /app/packages/core/dist packages/core/dist
COPY --from=build /app/packages/server/dist packages/server/dist
COPY --from=build /app/packages/admin-api/dist packages/admin-api/dist
# The built admin UI; the server serves it only when
# DAVNODE_ADMIN_UI_ENABLED=true (off by default).
COPY --from=build /app/packages/admin-ui/dist packages/admin-ui/dist

# Sensible defaults so the container runs with zero extra configuration:
# a SQLite file under a writable data directory. createDataSource() would
# fall back to an in-memory SQLite database even without these, but a
# real container should persist across restarts rather than start empty.
RUN mkdir -p /app/data && chown node:node /app/data
ENV DAVNODE_DB_TYPE=better-sqlite3
ENV DAVNODE_DB_FILE=/app/data/davnode.sqlite

# The server needs no privileges: run as the unprivileged `node` user the
# base image provides.
USER node

# Reports "unhealthy" when /healthz does not answer 200 (the database is
# unreachable, or the process hangs). The slim image has no curl, so node
# itself makes the request.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.DAVNODE_HTTP_PORT || 8080) + '/healthz').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"

CMD ["node", "packages/server/dist/index.js"]
