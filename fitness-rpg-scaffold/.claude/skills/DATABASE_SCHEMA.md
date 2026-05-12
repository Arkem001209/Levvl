# DATABASE_SCHEMA.md

## Overview

PostgreSQL via Supabase. All tables use UUIDs as primary keys (Supabase default).
Row Level Security (RLS) is enabled on all tables — users can only read/write
their own data unless explicitly granted (e.g. guild members can see each other's
public character data).

All timestamps are stored as `timestamptz` (timestamp with timezone) in UTC.

---

## Tables

### users
Managed by Supabase Auth. We extend it with a `profiles` table.
Do not create a custom `users` table — use `auth.users` from Supabase.

### profiles
One row per user. Created automatically when a user signs up (via Supabase trigger).

```sql
create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text unique not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- RLS: users can read any profile (for guild display), write only their own
alter table profiles enable row level security;
create policy "profiles_read_all"  on profiles for select using (true);
create policy "profiles_write_own" on profiles for all using (auth.uid() = id);
```

### characters
One row per user. The RPG character state.

```sql
create table characters (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null unique references auth.users(id) on delete cascade,
  level           integer not null default 1,
  xp_total        integer not null default 0,       -- all-time XP (never decreases)
  xp_current      integer not null default 0,       -- XP towards next level
  character_class text not null default 'Wanderer', -- derived monthly
  streak_days     integer not null default 0,
  last_activity_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table characters enable row level security;
create policy "characters_read_all"  on characters for select using (true);
create policy "characters_write_own" on characters for all using (
  auth.uid() = user_id
);
```

### character_stats
Six stats per character, stored as a single row.

```sql
create table character_stats (
  id           uuid primary key default gen_random_uuid(),
  character_id uuid not null unique references characters(id) on delete cascade,
  endurance    numeric(6,2) not null default 10,
  strength     numeric(6,2) not null default 10,
  agility      numeric(6,2) not null default 10,
  vitality     numeric(6,2) not null default 10,
  focus        numeric(6,2) not null default 10,
  resilience   numeric(6,2) not null default 10,
  updated_at   timestamptz not null default now()
);

alter table character_stats enable row level security;
create policy "stats_read_all"  on character_stats for select using (true);
create policy "stats_write_own" on character_stats for all using (
  auth.uid() = (select user_id from characters where id = character_id)
);
```

### tracker_connections
OAuth tokens for connected fitness trackers. Never exposed to the frontend.

```sql
create table tracker_connections (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  tracker        text not null check (tracker in ('strava', 'coros')),
  tracker_user_id text not null,          -- e.g. Strava athlete ID
  access_token   text not null,
  refresh_token  text not null,
  expires_at     timestamptz not null,
  last_synced_at timestamptz,
  created_at     timestamptz not null default now(),
  unique (user_id, tracker)
);

-- Only backend (service role) can access this table — no RLS policy for anon/authed
alter table tracker_connections enable row level security;
-- No policies = no frontend access, even for the owning user
-- The backend uses the service role key which bypasses RLS
```

### activities
One row per synced workout.

```sql
create table activities (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  tracker_source      text not null check (tracker_source in ('strava', 'coros', 'manual')),
  tracker_id          text not null,            -- the tracker's own ID for this activity
  activity_type       text not null,            -- our internal ActivityType enum
  name                text,                     -- activity name from the tracker
  started_at          timestamptz not null,
  duration_seconds    integer not null,
  distance_meters     numeric(10,2),
  elevation_gain_meters numeric(8,2),
  avg_heart_rate      integer,
  max_heart_rate      integer,
  avg_power_watts     integer,
  suffer_score        integer,                  -- Strava only
  raw_data            jsonb,                    -- full original payload, for debugging
  created_at          timestamptz not null default now(),
  unique (user_id, tracker_source, tracker_id) -- prevent duplicate imports
);

alter table activities enable row level security;
create policy "activities_read_own" on activities for select using (auth.uid() = user_id);
create policy "activities_write_backend" on activities for all using (false);
-- Backend uses service role — writes bypass RLS
```

### activity_rpg_results
Stores the RPG outcome of each activity for auditability and debugging.

```sql
create table activity_rpg_results (
  id              uuid primary key default gen_random_uuid(),
  activity_id     uuid not null unique references activities(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  xp_awarded      integer not null,
  xp_breakdown    jsonb not null,    -- { base, intensityMultiplier, streakMultiplier, etc. }
  stat_deltas     jsonb not null,    -- { endurance: 0.12, agility: 0.04, ... }
  loot_dropped    boolean not null default false,
  loot_item_id    uuid references inventory_items(id),
  level_up        boolean not null default false,
  level_after     integer not null,
  created_at      timestamptz not null default now()
);

alter table activity_rpg_results enable row level security;
create policy "rpg_results_read_own" on activity_rpg_results for select
  using (auth.uid() = user_id);
```

### inventory_items
All gear ever obtained by a user.

```sql
create table inventory_items (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  item_key     text not null,         -- e.g. "boots_of_endurance_uncommon"
  name         text not null,         -- display name
  description  text,
  slot         text not null check (slot in ('head','chest','legs','feet','weapon','accessory')),
  rarity       text not null check (rarity in ('common','uncommon','rare','epic','legendary')),
  stat_affix   text,                  -- e.g. "endurance"
  stat_bonus   integer default 0,
  is_equipped  boolean not null default false,
  obtained_at  timestamptz not null default now()
);

alter table inventory_items enable row level security;
create policy "inventory_read_own" on inventory_items for select using (auth.uid() = user_id);
```

### quests
AI-generated training plans.

```sql
create table quests (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  title          text not null,
  description    text not null,
  goal_summary   text not null,
  duration_weeks integer not null,
  status         text not null default 'active'
                 check (status in ('active','completed','abandoned','expired')),
  weeks_data     jsonb not null,      -- full QuestWeek[] array stored as JSON
  rewards        jsonb not null,      -- { xpOnCompletion, xpPerWeek, guaranteedLootRarity }
  started_at     timestamptz not null default now(),
  expires_at     timestamptz not null,
  completed_at   timestamptz,
  created_by     text not null default 'ai' check (created_by in ('ai','manual')),
  created_at     timestamptz not null default now()
);

alter table quests enable row level security;
create policy "quests_read_own" on quests for select using (auth.uid() = user_id);
```

### guilds

```sql
create table guilds (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  description text,
  created_by  uuid not null references auth.users(id),
  created_at  timestamptz not null default now()
);

create table guild_members (
  guild_id   uuid not null references guilds(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'member' check (role in ('owner','member')),
  joined_at  timestamptz not null default now(),
  primary key (guild_id, user_id)
);

alter table guilds enable row level security;
alter table guild_members enable row level security;

-- Anyone can read guild info; only members can see member list
create policy "guilds_read_all" on guilds for select using (true);
create policy "guild_members_read_own_guild" on guild_members for select using (
  guild_id in (select guild_id from guild_members where user_id = auth.uid())
);
```

---

## Indexes

```sql
-- Activities: most queries filter by user_id + started_at
create index idx_activities_user_date on activities (user_id, started_at desc);

-- RPG results: joined to activities frequently
create index idx_rpg_results_user on activity_rpg_results (user_id);

-- Quests: filter by user + status
create index idx_quests_user_status on quests (user_id, status);
```

---

## Supabase triggers

```sql
-- Auto-create profile + character when a new user signs up
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, username)
  values (new.id, split_part(new.email, '@', 1));

  insert into characters (user_id)
  values (new.id);

  insert into character_stats (character_id)
  select id from characters where user_id = new.id;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();
```

---

## Migrations

Use Supabase's migration system:
```bash
supabase migration new create_initial_schema
# Edit the generated file in supabase/migrations/
supabase db push
```

Never edit the database schema directly in the Supabase dashboard for anything
that needs to be reproducible — always write a migration file.
