# Deploying GET POINT (Docker)

A generic setup that runs on any server with Docker and the Docker Compose plugin. It starts
four containers:

| Container | What it is                                              | Reached at                                              |
| --------- | ------------------------------------------------------- | ------------------------------------------------------- |
| `db`      | PostgreSQL 16                                           | inside the stack only                                   |
| `api`     | NestJS API (applies database migrations on every start) | inside the stack only, through `cms` / `liff` at `/api` |
| `cms`     | Staff CMS, served by nginx                              | host port `CMS_PORT` (default 8080)                     |
| `liff`    | Member LINE app, served by nginx                        | host port `LIFF_PORT` (default 8081)                    |

Data lives in two named volumes: `pgdata` (database) and `receipts` (uploaded receipt files).
**Back up both.**

## Before you start

- A server with Docker 24+ and Docker Compose v2.
- **HTTPS in front of both apps** (a reverse proxy such as Caddy/nginx/Traefik, or a cloud load
  balancer) with two hostnames, e.g. `cms.example.com` → port 8080 and `liff.example.com` → port 8081.
  LINE only opens LIFF apps over HTTPS, and the staff login cookie is `Secure` in production.
- Real LOGA credentials and the **real GET POINT LOGA card** (`LOGA_CARD_ID`).
- A LINE Login channel and a LIFF app whose endpoint URL is your LIFF address
  (e.g. `https://liff.example.com`).
- SMTP details if staff should receive password-reset emails.

## First install

```bash
git clone https://github.com/Theethuch/GET-POINT.git getpoint && cd getpoint
cp deploy/.env.production.example deploy/.env.production
# edit deploy/.env.production: passwords, JWT secret, addresses, LOGA, LINE, SMTP, first admin

docker compose -f docker-compose.prod.yml --env-file deploy/.env.production up -d --build
docker compose -f docker-compose.prod.yml --env-file deploy/.env.production ps   # wait for "healthy"

# Once: roles, default shop categories and the first admin (SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD).
# In production the seed adds no sample data.
docker compose -f docker-compose.prod.yml --env-file deploy/.env.production run --rm api npx prisma db seed
```

Then sign in to the CMS as the admin, **change the password**, and create the real Communities,
Locations, shops, point rules and staff accounts.

The API refuses to start in production if `LOGA_MODE` or `LINE_MODE` is not `live`, or if
`JWT_ACCESS_SECRET` is still the example value. `docker compose logs api` shows why.

### LINE rich menu

Point the rich-menu buttons at the LIFF URL plus a path:
`https://liff.line.me/<LIFF_ID>/register`, `/scan`, `/points`, `/help`, `/privileges`.

## Updating to a new version

```bash
git pull
docker compose -f docker-compose.prod.yml --env-file deploy/.env.production up -d --build
```

The API applies new database migrations when it starts. Migrations only ever add or change the
schema forwards, so take a backup first (below).

## Backups

```bash
# Database (plain SQL)
docker compose -f docker-compose.prod.yml --env-file deploy/.env.production exec -T db \
  sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > getpoint-db-$(date +%F).sql

# Receipt files
docker run --rm -v getpoint_receipts:/data -v "$PWD":/backup alpine \
  tar czf /backup/getpoint-receipts-$(date +%F).tgz -C /data .
```

Restore the database into an empty `db` with `psql` (same container, `-T`, input from the file),
and the files by extracting the archive back into the `getpoint_receipts` volume.
Keep backups off the server.

## Settings worth knowing

| Variable       | Notes                                                                                                                                                                                              |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TRUST_PROXY`  | How many proxies sit in front of the API: nginx in the app container (1) + your HTTPS proxy (1) = **2**. Needed for real client IPs in rate limits and the Activity Log.                           |
| `CORS_ORIGINS` | The public CMS and LIFF addresses.                                                                                                                                                                 |
| `CMS_URL`      | Used in password-reset emails.                                                                                                                                                                     |
| `SMS_PROVIDER` | Only `mock` exists yet and it never sends in production: keep **Settings → องค์กร → ยืนยันเบอร์โทรด้วยรหัส SMS** switched off until a real provider is added (`apps/api/src/liff/sms.service.ts`). |

## Trying the production stack on a laptop

Without real LOGA/LINE accounts the API won't start in production mode. For a local trial only,
set `NODE_ENV=development`, `LOGA_MODE=mock`, `LINE_MODE=mock` in `deploy/.env.production` and
open http://localhost:8080 (CMS) and http://localhost:8081 (LIFF, with the test LINE login).
**Never expose a stack in that mode to the internet**: the test LINE login lets anyone act as
any member.

## Go-live checklist

- [ ] `deploy/.env.production` filled in; strong `POSTGRES_PASSWORD` and `JWT_ACCESS_SECRET`
- [ ] HTTPS hostnames for CMS and LIFF; `CORS_ORIGINS`, `CMS_URL`, `TRUST_PROXY` match them
- [ ] `LOGA_MODE=live` with the **real GET POINT card** in `LOGA_CARD_ID`; Settings → LOGA → test connection succeeds
- [ ] `LINE_MODE=live`, `LINE_CHANNEL_ID`, `LIFF_ID`; LIFF endpoint URL = the LIFF hostname; rich menu links set
- [ ] SMTP set and Settings → ระบบ → test email received
- [ ] Seed run once; admin password changed; staff accounts created with the right scope
- [ ] Settings reviewed: reject reasons, upload limits, retry, remark template, support contact, login security
- [ ] Backups scheduled for the database and the receipts volume, and one restore tested
