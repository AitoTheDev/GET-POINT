# GET POINT API. Build from the repository root:
#   docker build -f apps/api/Dockerfile -t getpoint-api .
FROM node:24-bookworm-slim AS build
WORKDIR /app
# Prisma's query engine needs OpenSSL.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

# Install from the lockfile (all workspace manifests are needed for npm ci to match it).
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/cms/package.json apps/cms/
COPY apps/liff/package.json apps/liff/
RUN npm ci -w @getpoint/api -w @getpoint/shared --include-workspace-root --ignore-scripts

COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @getpoint/shared \
  && cd apps/api && npx prisma generate && npx nest build

FROM node:24-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /data/receipts && chown node:node /data/receipts
ENV NODE_ENV=production \
    RECEIPT_STORAGE_DIR=/data/receipts \
    PORT=3000
# Prisma CLI (migrations) and ts-node (seed) stay available, so dev dependencies are kept.
COPY --from=build --chown=node:node /app /app
USER node
WORKDIR /app/apps/api
EXPOSE 3000
# Apply pending migrations (safe with several containers: Prisma takes a lock), then start.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
