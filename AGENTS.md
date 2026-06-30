# AGENTS.md

## Cursor Cloud specific instructions

DiamondEdge Simulator is a single Next.js 14 (App Router) + React + TypeScript app. Next.js serves both the UI and the `/api/*` route handlers, and persists data to PostgreSQL via Prisma. The `mobile/` folder is just an Expo/Capacitor WebView wrapper around the deployed URL and is not needed for local development. Standard scripts live in `package.json` (`dev`, `build`, `lint`, `db:push`, `db:seed`).

### Database (PostgreSQL — required)
- The README says "SQLite (default)" but this is outdated: `prisma/schema.prisma` is hardcoded to `provider = "postgresql"`. A running PostgreSQL instance and a valid `DATABASE_URL` are required for anything touching the DB (signup/login, dashboard, saved slips/sims, community).
- The update script does NOT install or start PostgreSQL (no system deps / no service startup). The local Postgres server, the `diamondedge` database, and the (gitignored) `.env` persist via the VM snapshot. On a fresh boot, start the server before running the app:
  - Start: `sudo pg_ctlcluster 16 main start`
  - Local connection used in `.env`: `postgresql://postgres:postgres@localhost:5432/diamondedge?schema=public`
- After changing `prisma/schema.prisma` (or on first setup), apply it with `npx prisma db push`, then optionally seed sample teams/game/odds with `npm run db:seed`.

### Environment
- `.env` is gitignored; copy from `.env.example` if it is missing. Minimum needed locally: `DATABASE_URL` and `AUTH_SECRET`.
- All external data providers (The Odds API, The Rundown, SportsDataIO, OpenWeather, MLB Stats) have mock-data fallbacks, so their API keys are optional. The UI shows inline "NO ... API KEY" notices but works normally.
- Email: with `RESEND_API_KEY` unset, signup auto-verifies the account and signs the user in immediately (no inbox step) — convenient for testing the logged-in flow.

### Run / lint
- Dev server: `npm run dev` → http://localhost:3000 (do not use `npm run build`/`start` for development; `build` also runs `prisma db push` against `DATABASE_URL`).
- Lint: `npm run lint`.
- Core "hello world" smoke test: sign up at `/signup`, go to `/bet-builder`, add a selection, and click "Run 1,000 simulations" to view `/simulation-results`.
