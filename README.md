# Levvl

A personal fitness RPG for ~20 users. Real workouts from Strava and Coros are translated into RPG mechanics — XP, character levels, stats, loot, and quests. The harder you train, the stronger your character gets.

## What it does

- Connects to Strava (Coros coming soon) to pull your real workout data
- Processes each activity through an RPG engine: duration × intensity × activity type bonus = XP
- Heart rate zones (based on your personal max HR) drive intensity multipliers
- Six character stats (Endurance, Strength, Agility, Vitality, Focus, Resilience) each grow based on activity type with diminishing returns
- Character levels up as XP accumulates, with a streak multiplier for consecutive training days

## Tech stack

| Layer | Tech |
|---|---|
| API | Express + TypeScript |
| Database | Supabase (PostgreSQL + Auth + RLS) |
| Frontend | React 18 + Vite |
| Shared types | Local `packages/shared` workspace package |
| Auth | Supabase JWT — Strava OAuth for tracker connection |

## Project structure

```
Levvl/
├── apps/
│   ├── api/          # Express API server
│   │   ├── src/
│   │   │   ├── routes/       # auth, character, strava
│   │   │   ├── services/     # rpg.service.ts, strava.service.ts
│   │   │   ├── middleware/   # auth.middleware.ts
│   │   │   └── lib/          # supabase client, logger, catchAsync
│   │   └── scripts/          # seed-strava, apply-rpg-to-seed, get-test-jwt
│   └── web/          # React frontend (character page)
├── packages/
│   └── shared/       # ActivityType, StatName, shared types
└── supabase/
    └── migrations/   # SQL schema + incremental changes
```

## Running locally

### Prerequisites
- Node.js 20+
- A Supabase project (free tier works)
- A Strava API app (for OAuth testing)
- ngrok (for exposing local API to Strava callbacks)

### API server

```bash
cd apps/api
cp .env.example .env   # fill in your Supabase + Strava credentials
npm install
npm run dev            # starts on port 3001
```

### Frontend

```bash
cd apps/web
cp .env.example .env.local   # add VITE_DEV_JWT (see below)
npm install
npm run dev            # starts on port 5173
```

### Getting a dev JWT

While there's no login UI yet, generate a test token:

```bash
cd apps/api
npx tsx scripts/get-test-jwt.ts
```

Paste the output into `apps/web/.env.local` as `VITE_DEV_JWT=<token>`.

### Strava OAuth (local testing)

Run ngrok to expose your local API:

```bash
ngrok http 3001
```

Set `API_STRAVA_REDIRECT_URI` in `apps/api/.env` to `https://<your-ngrok-url>/api/auth/strava/callback`, and add the same URL to your Strava app's allowed redirect URIs.

## API endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `GET` | `/api/character` | Full character state (level, XP, stats, recent activities) |
| `GET` | `/api/auth/strava` | Start Strava OAuth flow |
| `GET` | `/api/auth/strava/callback` | Strava OAuth callback |

## Development scripts

| Script | What it does |
|---|---|
| `seed-strava.ts` | Seeds 30 days of real Strava activities into the DB |
| `apply-rpg-to-seed.ts` | Runs seeded activities through the RPG engine |
| `get-test-jwt.ts` | Generates a Supabase JWT for local dev |

## Build status

**Phase 1 — Foundation** (in progress)

- [x] Database schema — 10 tables, RLS policies, `handle_new_user` trigger
- [x] Strava activity seeding (30 days of real data)
- [x] RPG engine — XP formula, stat gain with diminishing returns, intensity zones
- [x] `GET /api/character` endpoint
- [x] Character page frontend (React, dark mythic design)
- [x] Strava OAuth flow (connect tracker, store tokens)
- [ ] Strava activity webhook (auto-process new workouts)
- [ ] Login / auth UI (replace dev JWT hack)

**Phase 2 — Progression** (upcoming)

- Quests, loot drops, guilds
- Coros integration
- Push notifications for level-ups
