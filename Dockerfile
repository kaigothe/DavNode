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
RUN npm ci --omit=dev

COPY --from=build /app/packages/core/dist packages/core/dist
COPY --from=build /app/packages/server/dist packages/server/dist
COPY --from=build /app/packages/admin-api/dist packages/admin-api/dist

# Sensible defaults so the container runs with zero extra configuration:
# a SQLite file under a writable data directory. createDataSource() would
# fall back to an in-memory SQLite database even without these, but a
# real container should persist across restarts rather than start empty.
RUN mkdir -p /app/data
ENV DAVNODE_DB_TYPE=better-sqlite3
ENV DAVNODE_DB_FILE=/app/data/davnode.sqlite

# Placeholder entrypoint (see packages/server/src/main.ts) until the real
# Express server lands in M2.
CMD ["node", "packages/server/dist/main.js"]
