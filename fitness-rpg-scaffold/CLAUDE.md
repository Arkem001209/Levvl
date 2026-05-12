# CLAUDE.md — Fitness RPG Project

## What this project is

A fitness-based gamified RPG web app. Real workout data from Strava and Coros is
translated into RPG mechanics: XP, character stats, loot drops, quests, and guilds.
AI-powered training plans are the "quest" system, generated via the Anthropic API.

Audience: the developer plus a small group of friends (< 20 users initially).

---

## Read these skill files before touching each area

| Area | Skill file to read first |
|---|---|
| Project goals + constraints | `.claude/skills/PROJECT_OVERVIEW.md` |
| Architecture decisions | `.claude/skills/ARCHITECTURE.md` |
| RPG mechanics + formulas | `.claude/skills/RPG_SYSTEM.md` |
| Strava + Coros API integration | `.claude/skills/TRACKER_INTEGRATIONS.md` |
| AI quest / training plan system | `.claude/skills/QUEST_AI.md` |
| Database tables + relationships | `.claude/skills/DATABASE_SCHEMA.md` |

Always read the relevant skill file before writing, editing, or refactoring code in
that domain. Do not rely on memory of a previous session.

---

## Developer profile + learning goals

- Comfortable with HTML/CSS, backend concepts, Git
- Learning TypeScript/JavaScript — this is an active learning goal
- Wants to understand the majority of the code being written
- Prefers to avoid over-engineering

**Because of this:**
- Add inline comments explaining non-obvious logic, TypeScript types, and any
  patterns the developer may not have seen before
- When introducing a new pattern (e.g. generics, discriminated unions, middleware
  chains), briefly explain it in a code comment the first time it appears
- Prefer explicit over clever. Readable beats concise when they conflict.
- Never add a new npm dependency without explaining what it does and why it's needed
- Never do a large refactor without first describing the plan and asking for approval

---

## Tech stack (do not deviate without discussion)

- **Frontend:** React 18 + TypeScript + Vite — lives in `apps/web/`
- **Backend:** Node.js + Express + TypeScript — lives in `apps/api/`
- **Database:** PostgreSQL via Supabase — schema in `.claude/skills/DATABASE_SCHEMA.md`
- **Auth:** Supabase Auth (JWT-based sessions)
- **AI:** Anthropic API (`claude-sonnet-4-20250514`) — quest generation only
- **Shared types:** `packages/shared/src/types/` — import from here, never duplicate types
- **Deployment:** Vercel (frontend) + Railway (backend) — not set up yet

---

## Code conventions

### TypeScript
- Always use explicit return types on functions
- Prefer `interface` over `type` for object shapes
- Use `zod` for runtime validation of external API responses (Strava, Coros, user input)
- No `any` — use `unknown` and narrow it

### File naming
- React components: `PascalCase.tsx`
- Utility functions, hooks, services: `camelCase.ts`
- Route files: `camelCase.routes.ts`
- Service files: `camelCase.service.ts`

### API responses
All API responses use this shape:
```ts
// Success
{ success: true, data: T }

// Error
{ success: false, error: { message: string, code: string } }
```

### Environment variables
- Never hardcode secrets or API keys
- All env vars documented in `.env.example` at the root
- Backend vars prefixed `API_`, frontend vars prefixed `VITE_`

### Error handling
- All async route handlers wrapped in a `catchAsync` utility (see `apps/api/src/lib/catchAsync.ts`)
- Never swallow errors silently — always log and either re-throw or return a structured error response

---

## Project phases (current: Phase 1)

| Phase | Focus | Status |
|---|---|---|
| 1 | Foundation: auth, Strava OAuth, activity ingestion, XP system | 🔄 In progress |
| 2 | RPG core: stats, loot, levelling, character sheet UI | ⏳ Not started |
| 3 | AI quests: Claude-powered training plans | ⏳ Not started |
| 4 | Social: guilds, leaderboards, friend invites, Coros integration | ⏳ Not started |

Update the status column as phases complete.

---

## Things to never do

- Do not empty-catch errors: `catch (e) {}` is always wrong here
- Do not store OAuth tokens in localStorage — use httpOnly cookies via the backend
- Do not call the Anthropic API from the frontend — always proxy through the backend
- Do not commit `.env` files
- Do not use `console.log` for permanent logging — use the logger utility once created
- Do not mutate Supabase rows directly from the frontend for RPG state — all game
  logic runs through the backend RPG engine service
