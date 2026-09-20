# ── UgaMarket web (customer + admin static + nginx reverse proxy) ────────────
# Build context is the REPOSITORY ROOT:
#   docker build -f deploy/web.Dockerfile -t ugamarket-web .
#
# Both client bundles are built inside the image (deterministic, no host
# artifacts). REACT_APP_API_URL / VITE_API_URL are PUBLIC, build-time
# configuration only — never secrets. When unset, both apps fall back to
# same-origin '/api' behind this proxy.

# ── Stage 1: customer frontend build ─────────────────────────────────────────
FROM node:22-alpine AS customer-build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
ARG REACT_APP_API_URL
ENV REACT_APP_API_URL=$REACT_APP_API_URL
RUN npm run build

# ── Stage 2: admin build ─────────────────────────────────────────────────────
FROM node:22-alpine AS admin-build
WORKDIR /app
COPY admin/package.json admin/package-lock.json ./
RUN npm ci
COPY admin/ ./
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# ── Stage 3: nginx runtime ───────────────────────────────────────────────────
FROM nginx:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/nginx.conf
COPY --from=customer-build /app/build /usr/share/nginx/html/customer
COPY --from=admin-build /app/dist /usr/share/nginx/html/admin
EXPOSE 80 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=5 \
  CMD wget -qO- http://127.0.0.1:80/ >/dev/null 2>&1 || exit 1
