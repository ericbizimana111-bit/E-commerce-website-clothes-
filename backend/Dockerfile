# ── UgaMarket backend — production image ─────────────────────────────────────
# Build:   docker build -t ugamarket-backend ./backend
# Run:     docker run --env-file .env.production ugamarket-backend
#
# Notes:
# - `prisma` CLI lives in `dependencies` (not devDependencies) so the release
#   image can run `npx prisma migrate deploy` as an explicit deployment step.
# - Migrations are NEVER run automatically at container startup; use the
#   dedicated `migrate` service in docker-compose.production.yml.
# - Never bake .env or secrets into the image (see backend/.dockerignore).

# ── Stage 1: install dependencies + generate the Prisma client ──────────────
FROM node:22-alpine AS build
WORKDIR /app
# openssl is required by Prisma engines on Alpine.
RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci
RUN npx prisma generate

# ── Stage 2: production runtime ──────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl wget
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
# Overlay the Prisma client generated in the build stage (engine + generated
# code live under node_modules/.prisma and node_modules/@prisma).
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
# Schema + migrations are needed for the explicit `prisma migrate deploy`
# deployment operation.
COPY prisma ./prisma
COPY src ./src
COPY server.js ./

# Uploaded product images are persistent data: the image ships an EMPTY,
# node-owned directory and production mounts a volume over /app/uploads.
RUN mkdir -p /app/uploads/images && chown -R node:node /app/uploads

# Run as the non-root `node` user shipped with the official image.
USER node

EXPOSE 4000
CMD ["node", "server.js"]
