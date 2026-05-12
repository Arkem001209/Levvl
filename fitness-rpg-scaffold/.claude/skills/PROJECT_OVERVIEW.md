# PROJECT_OVERVIEW.md

## Vision

A personal fitness RPG that makes training feel like playing a game. Every run,
ride, swim, or lift is automatically synced and translated into RPG progress:
experience points, character stats, gear drops, and quests. The "quests" are real
AI-generated training plans — not arbitrary challenges, but structured programs
tailored to the user's history, fitness level, and goals.

The app is for the developer and a small group of friends. It is not a startup or
a public product (yet). This means: build for maybe 20 users, keep ops simple,
don't over-engineer for scale that doesn't exist.

---

## Core user loop

1. User completes a real workout (run, ride, strength session, etc.)
2. Strava or Coros syncs it automatically (webhook or scheduled poll)
3. The backend ingests the activity, runs it through the RPG engine
4. XP is awarded, stats increase, loot may drop
5. User opens the app to see their character's progress
6. User visits the Quest Board and either accepts an AI-generated training plan
   or views progress on an active one
7. Completing quest milestones (e.g. "run 3 times this week") awards bonus XP and loot

---

## What makes this different from existing apps

- Strava already gamifies fitness, but shallowly (segments, trophies)
- This goes deeper: persistent character progression, gear with stats,
  class archetypes based on training style, guild co-op with friends
- The quest system is genuinely useful — it's a real training planner, not just
  a badge system

---

## Non-goals (things we are explicitly not building)

- A native mobile app (web-first; mobile browser is fine for now)
- Custom GPS tracking (we rely entirely on Strava/Coros for activity data)
- A social network (guilds are small friend groups, not a public feed)
- Real money / premium features
- Anything requiring HIPAA compliance (no medical data)

---

## Developer constraints and preferences

- **Learning TypeScript:** this project is a vehicle for learning. Code should be
  understandable, not just correct. Comments matter.
- **Avoid over-engineering:** no microservices, no message queues, no Kubernetes.
  A monorepo with a simple Express API and a React frontend is the right level.
- **Understand the majority of the code:** if a pattern is introduced that the
  developer hasn't seen before, explain it. Don't introduce advanced patterns
  (decorators, metaprogramming, complex generics) without a good reason.
- **Git is a strength:** use feature branches, clear commit messages. The developer
  knows Git well so lean on it — each phase can be its own branch.

---

## Success criteria for Phase 1

- [ ] User can sign up and log in via Supabase Auth
- [ ] User can connect their Strava account via OAuth
- [ ] Activities sync automatically (webhook preferred, polling fallback)
- [ ] Each activity awards XP based on duration and intensity
- [ ] User has a basic character page showing level, XP bar, and recent activities
- [ ] Data is correctly isolated per user (no user can see another's data)
