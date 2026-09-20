# UgaMarket — Production Deployment

Production-oriented deployment foundation for the UgaMarket — home to home
marketplace (customer web, admin web, Node/Express backend, PostgreSQL 17 +
Prisma).

## 1. Architecture

```
                 INTERNET
                     │
              Reverse proxy (nginx)   ← TLS terminates here
               │                   │
        Customer web :80      Admin web :8080 / admin.<domain>
               └────────┬──────────┘
                        │ /api, /images
                        ▼
                 Backend API (Node/Express, internal)
                  │               │
                  ▼               ▼
           PostgreSQL 17     uploads volume (/images)
```

- One nginx service (`web`) serves BOTH static frontends and proxies the
  backend. No unnecessary containers.
- The backend and PostgreSQL are internal to the compose network — neither is
  published to the host.
- Uploaded product images remain on **local disk inside a persistent named
  volume** (`uploads:/app/uploads`); the `/images` application contract is
  unchanged. No object storage in this phase.

## 2. Prerequisites

- Docker Engine + Compose v2
- A filled-in `.env.production` (see §3) — never committed
- (Production host) TLS certificates for the customer and admin domains

## 3. Environment variables

Copy `.env.production.example` → `.env.production` and replace every
`<PLACEHOLDER>`. Generate secrets:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Required in production (startup **fails fast** otherwise —
`backend/src/config/envValidation.js`):

| Variable | Rule |
|---|---|
| `DATABASE_URL` | required; points at the compose `postgres` service |
| `JWT_SECRET`, `ADMIN_JWT_SECRET` | ≥32 chars, **must differ**, no placeholders |
| `ADMIN_1_PASSWORD`, `ADMIN_2_PASSWORD` | explicit; placeholder/default values rejected |
| `PAYMENT_WEBHOOK_SECRET` | explicit; ≥32 chars; mock default rejected |
| `CORS_ORIGIN` | explicit origins; wildcard `*` rejected |
| `PAYMENT_PROVIDER` | `MOCK` rejected (`FLUTTERWAVE`/`MTN_MOMO`/`AIRTEL_MONEY` allowed values; real adapters arrive in a later phase) |
| `POSTGRES_USER/PASSWORD/DB` | postgres container bootstrap |

`REACT_APP_API_URL` / `VITE_API_URL` are **public, build-time** values only
(never secrets). Unset builds use same-origin `/api` behind the proxy.

## 4. PostgreSQL configuration

- Official `postgres:17-alpine` image, credentials via environment only.
- Persistent named volume `pgdata`.
- Healthcheck: `pg_isready`.
- **No published ports** — reachable only inside the compose network.
- The stack creates its own **fresh** volume; it never connects to a local
  development database.

## 5. Building images

```bash
docker compose --env-file .env.production -f docker-compose.production.yml build
```

Images: `ugamarket-backend:latest` (Node 22 Alpine, non-root `node` user,
Prisma client generated at build) and `ugamarket-web:latest` (multi-stage:
customer CRA build + admin Vite build → nginx 1.27 Alpine).

## 6. Running the production compose

```bash
docker compose --env-file .env.production -f docker-compose.production.yml up -d
docker compose --env-file .env.production -f docker-compose.production.yml ps
```

## 7. Prisma migration procedure (explicit, never automatic)

Migrations never run inside application startup. Apply them explicitly with
the dedicated tool service (uses the same backend image):

```bash
docker compose --env-file .env.production -f docker-compose.production.yml \
  --profile tools run --rm migrate
```

This runs `npx prisma migrate deploy` (forward-only, non-destructive).
NEVER run `prisma migrate reset` or `prisma db push` against production data.

## 8. Reverse proxy

`deploy/nginx.conf`:

- `location /api/` → `proxy_pass http://backend:4000` (URI preserved)
- `location /images/` → backend (7-day cache headers)
- everything else → SPA fallback to `index.html` (customer on `:80`,
  admin on `:8080` — separate origins, so no router base-path changes)
- Forwards `Host`, `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto`;
  backend sets `trust proxy = 1` so rate limiting/audit logs see real IPs

## 9. TLS certificate placement

Not committed to the repository. In production, mount certificates into the
web container and enable the `listen 443 ssl` block documented in
`deploy/nginx.conf`:

```
/etc/nginx/certs/fullchain.pem
/etc/nginx/certs/privkey.pem
```

## 10. URLs

- Customer frontend: `https://<customer-domain>/` (nginx :80)
- Admin frontend: `https://<admin-domain>/` (nginx :8080 / dedicated origin)
- Backend API: `https://<customer-domain>/api` (same-origin via proxy)
- Product images: `https://<customer-domain>/images/<name>`

`CORS_ORIGIN` must list both public origins (comma-separated).

## 11. Persistent uploads & backups

- Product images live in the `uploads` named volume (mounted at
  `/app/uploads`). Replacing/recreating containers or images **never**
  removes the volume.
- **Backups:** back up the `pgdata` volume (e.g. scheduled `pg_dump`) AND the
  `uploads` volume, and keep the two restore points coordinated (a restored
  DB references image files by `/images/<name>`).
- Deleting containers must not delete volumes (`docker compose down` without
  `-v`; `-v` removes the volumes).

## 12. Health checks

- PostgreSQL: `pg_isready` (compose healthcheck)
- Backend: `GET /api/health` — verifies process liveness AND database
  connectivity (no secrets in the response)
- Web: HTTP fetch of the customer index
- Compose `depends_on: service_healthy` gates startup order

## 13. Logs & shutdown

- The backend never logs secrets (validated in tests); production stack traces
  are suppressed outside development.
- `SIGTERM`/`SIGINT` trigger graceful shutdown: stop accepting connections →
  finish in-flight requests → disconnect Prisma → exit 0 (10 s force timeout).

## 14. Rollback considerations

- Images are tagged (`ugamarket-backend:latest`, `ugamarket-web:latest`);
  retag a known-good build and `up -d` to roll back the application.
- Rollbacks must not revert applied database migrations — write a new
  forward-only migration instead.
- Volumes (`pgdata`, `uploads`) are independent of image versions.

## 15. Local smoke test (isolated)

The compose stack is self-contained: it builds fresh containers and a fresh
database volume with test credentials from `.env.production`. To verify
end-to-end (proxy → backend → postgres → uploads persistence), fill
`.env.production` with disposable test values and follow §6–§7. Destroy the
disposable stack with `docker compose ... down -v`.
