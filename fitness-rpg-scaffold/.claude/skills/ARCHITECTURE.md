# ARCHITECTURE.md

## Repository structure

```
fitness-rpg/
├── CLAUDE.md                        ← Claude Code master context (read first)
├── .claude/
│   └── skills/                      ← skill files for each domain
├── .env.example                     ← document all env vars here
├── package.json                     ← root package.json (workspaces)
├── apps/
│   ├── web/                         ← React + TypeScript + Vite frontend
│   │   ├── src/
│   │   │   ├── components/          ← reusable UI components
│   │   │   │   ├── character/
│   │   │   │   ├── quest/
│   │   │   │   ├── guild/
│   │   │   │   └── ui/              ← generic: Button, Card, Badge, etc.
│   │   │   ├── pages/               ← top-level route pages
│   │   │   │   ├── CharacterPage.tsx
│   │   │   │   ├── QuestBoardPage.tsx
│   │   │   │   ├── GuildPage.tsx
│   │   │   │   ├── ActivityFeedPage.tsx
│   │   │   │   └── SettingsPage.tsx
│   │   │   ├── hooks/               ← custom React hooks (useCharacter, useQuests, etc.)
│   │   │   ├── lib/
│   │   │   │   ├── api.ts           ← typed fetch wrapper for the backend API
│   │   │   │   └── supabase.ts      ← Supabase client (frontend — read-only queries only)
│   │   │   ├── types/               ← re-export from packages/shared
│   │   │   └── main.tsx
│   │   ├── index.html
│   │   └── package.json
│   └── api/                         ← Node.js + Express + TypeScript backend
│       ├── src/
│       │   ├── routes/
│       │   │   ├── auth.routes.ts
│       │   │   ├── activities.routes.ts
│       │   │   ├── character.routes.ts
│       │   │   ├── quests.routes.ts
│       │   │   ├── guilds.routes.ts
│       │   │   └── webhooks.routes.ts
│       │   ├── services/
│       │   │   ├── strava.service.ts      ← Strava API client + token refresh
│       │   │   ├── coros.service.ts       ← Coros API client + token refresh
│       │   │   ├── rpg.service.ts         ← XP, levelling, stat calculations
│       │   │   ├── quest.service.ts       ← AI quest generation + tracking
│       │   │   ├── loot.service.ts        ← loot drop logic
│       │   │   └── sync.service.ts        ← activity ingestion pipeline
│       │   ├── middleware/
│       │   │   ├── auth.middleware.ts     ← verify Supabase JWT on protected routes
│       │   │   └── validate.middleware.ts ← zod schema validation
│       │   ├── lib/
│       │   │   ├── supabase.ts            ← Supabase admin client (service role key)
│       │   │   ├── anthropic.ts           ← Anthropic API client
│       │   │   ├── catchAsync.ts          ← async error wrapper for route handlers
│       │   │   └── logger.ts              ← structured logging utility
│       │   └── index.ts                  ← Express app entry point
│       └── package.json
└── packages/
    └── shared/
        └── src/
            └── types/
                ├── activity.ts            ← Activity, ActivityType interfaces
                ├── character.ts           ← Character, Stats, Equipment interfaces
                ├── quest.ts               ← Quest, QuestStep interfaces
                ├── guild.ts               ← Guild, GuildMember interfaces
                └── index.ts               ← barrel export
```

---

## Why this stack

### React + Vite (not Next.js)
Next.js adds server-side rendering complexity before it's needed. Vite gives fast
hot-reload during development. This app is primarily a client-side dashboard —
SSR buys very little here. Move to Next.js later if SEO matters.

### Express (not Fastify, Hono, etc.)
Express has the largest ecosystem and most examples online. When learning TypeScript
and backend patterns simultaneously, familiar tooling reduces friction. Fastify and
Hono are both better for performance, but performance is not the constraint here.

### Supabase (not raw PostgreSQL + custom auth)
Supabase provides: managed Postgres, row-level security (RLS), auth with OAuth
support, file storage, and a web UI for inspecting data. For a small team project,
this eliminates an enormous amount of infrastructure setup. The tradeoff is vendor
dependency, which is acceptable at this scale.

### Monorepo (not separate repos)
Sharing TypeScript types between frontend and backend is the single biggest DX win
in a full-stack TypeScript project. The `packages/shared` package makes it impossible
for frontend and backend to disagree on data shapes.

---

## Data flow for an activity sync

```
Strava/Coros workout completed
        ↓
Webhook POST → /api/webhooks/strava  (or /coros)
        ↓
Validate webhook signature
        ↓
sync.service.ts: fetch full activity from tracker API
        ↓
Normalise to internal Activity type (strip tracker-specific fields)
        ↓
Store in `activities` table
        ↓
rpg.service.ts: calculate XP from activity metrics
        ↓
rpg.service.ts: update character XP + check for level-up
        ↓
rpg.service.ts: update relevant stats (endurance, strength, etc.)
        ↓
loot.service.ts: roll for loot drop
        ↓
quest.service.ts: check if activity completes any active quest steps
        ↓
Return 200 to webhook sender
```

---

## Authentication flow

1. User signs up / logs in via Supabase Auth (email or Google OAuth)
2. Supabase issues a JWT
3. Frontend stores JWT in memory (not localStorage) and sends as `Authorization: Bearer` header
4. Backend `auth.middleware.ts` verifies the JWT against Supabase's public key
5. `req.user` is populated with the verified user ID for all protected routes
6. Strava/Coros OAuth tokens are stored in the `tracker_connections` table (encrypted at rest
   by Supabase), never sent to the frontend

---

## Environment variables

```bash
# Backend (apps/api/.env)
API_PORT=3001
API_SUPABASE_URL=
API_SUPABASE_SERVICE_ROLE_KEY=    # never expose this to the frontend
API_STRAVA_CLIENT_ID=
API_STRAVA_CLIENT_SECRET=
API_STRAVA_WEBHOOK_VERIFY_TOKEN=  # random string you choose
API_COROS_CLIENT_ID=
API_COROS_CLIENT_SECRET=
API_ANTHROPIC_API_KEY=

# Frontend (apps/web/.env)
VITE_API_URL=http://localhost:3001
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=           # this one is safe to expose
```

---

## Calling conventions between frontend and backend

The frontend **never** writes RPG state directly to Supabase. All game logic
mutations go through the backend API. The frontend may read from Supabase directly
for display-only queries (e.g. fetching the character sheet), but any action that
changes game state (accepting a quest, equipping an item) must go through the API
so the RPG engine can validate it.
