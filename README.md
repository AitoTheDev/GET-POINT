# GET POINT CMS

Receipt-based loyalty points system for Community Malls.

| App | Path | Dev URL |
|---|---|---|
| API (NestJS + Prisma) | `apps/api` | http://localhost:3000/api |
| Staff CMS (React + Ant Design) | `apps/cms` | http://localhost:5173 |
| Member LIFF (React) | `apps/liff` | http://localhost:5174 |
| Shared types / formatters | `packages/shared` | — |

## Requirements
- Node.js 20+ (developed on 24)
- PostgreSQL 14+ (local install, or `docker compose up -d`)

## First-time setup
```bash
npm install
cp apps/api/.env.example apps/api/.env   # then set DATABASE_URL
```
Create the database (once), e.g. in psql / pgAdmin:
```sql
CREATE DATABASE getpoint;
```

## Run
```bash
npm run dev      # builds shared, then runs API + CMS + LIFF together
```

## Checks
```bash
npm run lint
npm test
npm run build
```

## Git workflow
- `main` contains only user-confirmed work.
- Each session is developed on `session/NN-<name>` and merged + tagged `v0.NN` after confirmation.
