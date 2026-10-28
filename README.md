# GET POINT CMS

Receipt-based loyalty points system for Community Malls.

| App                            | Path              | Dev URL                   |
| ------------------------------ | ----------------- | ------------------------- |
| API (NestJS + Prisma)          | `apps/api`        | http://localhost:3000/api |
| Staff CMS (React + Ant Design) | `apps/cms`        | http://localhost:5173     |
| Member LIFF (React)            | `apps/liff`       | http://localhost:5174     |
| Shared types / formatters      | `packages/shared` | —                         |

## Requirements

- Node.js 20+ (developed on 24)
- PostgreSQL 14+ (local install, or `docker compose up -d`)

## First-time setup

```bash
npm install
cp apps/api/.env.example apps/api/.env
```

In `apps/api/.env` set at least `DATABASE_URL`, `JWT_ACCESS_SECRET` (32+ random characters) and
`SEED_ADMIN_PASSWORD`. Then create the database (once), e.g. in psql / pgAdmin:

```sql
CREATE DATABASE getpoint;
```

and create the tables + first accounts:

```bash
npm run db:migrate   # apply migrations
npm run db:seed      # roles, sample Community/Locations, admin account
```

The seed creates `admin@getpoint.local` (password = `SEED_ADMIN_PASSWORD`). In development it also
creates `staff@getpoint.local` and `manager@getpoint.local` with the same password for testing roles.

### Email (forgot password)

Fill the `SMTP_*` settings to send real emails. With `SMTP_HOST` empty, the API prints reset emails
(including the link) in its console instead, so the flow can still be tested.

## Run

```bash
npm run dev      # builds shared, then runs API + CMS + LIFF together
```

## Checks

```bash
npm run lint
npm test         # unit tests + API end-to-end tests
npm run build
```

API end-to-end tests use a separate database named `<your database>_test` (created automatically).
They never touch the development database.

## Deployment

Production runs with Docker: `docker-compose.prod.yml` (PostgreSQL + API + CMS + LIFF).
See [deploy/README.md](deploy/README.md) for first install, updates, backups and the go-live checklist.

## Git workflow

- `main` contains only user-confirmed work.
- Each session is developed on `session/NN-<name>` and merged + tagged `v0.NN` after confirmation.
