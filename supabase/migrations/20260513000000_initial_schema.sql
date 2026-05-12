-- =============================================================================
-- Initial schema for Levvl fitness RPG
-- All tables use UUIDs as primary keys. Timestamps are timestamptz (UTC).
-- RLS is enabled on every table. The backend uses the service role key which
-- bypasses RLS — frontend reads are controlled by the policies below.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- profiles
-- One row per user, created automatically by the handle_new_user trigger.
-- We extend auth.users here rather than creating a separate users table.
-- ---------------------------------------------------------------------------
create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text unique not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table profiles enable row level security;
-- Anyone can read a profile (needed for guild member display)
create policy "profiles_read_all"  on profiles for select using (true);
-- Users can only modify their own profile
create policy "profiles_write_own" on profiles for all using (auth.uid() = id);


-- ---------------------------------------------------------------------------
-- characters
-- One row per user. Tracks all RPG progression state.
-- ---------------------------------------------------------------------------
create table characters (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null unique references auth.users(id) on delete cascade,
  level            integer not null default 1,
  xp_total         integer not null default 0,        -- all-time XP, never decreases
  xp_current       integer not null default 0,        -- XP towards next level
  character_class  text not null default 'Wanderer',  -- re-derived monthly from activity mix
  streak_days      integer not null default 0,
  last_activity_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table characters enable row level security;
create policy "characters_read_all"  on characters for select using (true);
create policy "characters_write_own" on characters for all using (
  auth.uid() = user_id
);


-- ---------------------------------------------------------------------------
-- character_stats
-- Six RPG stats per character, stored as a single row.
-- Values are decimals so small increments from activities don't get lost.
-- ---------------------------------------------------------------------------
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
-- Subquery resolves character_id → user_id so we can compare against auth.uid()
create policy "stats_write_own" on character_stats for all using (
  auth.uid() = (select user_id from characters where id = character_id)
);


-- ---------------------------------------------------------------------------
-- tracker_connections
-- Stores OAuth tokens for Strava and Coros. Never exposed to the frontend.
-- No RLS select policy = frontend (even authed users) cannot read this table.
-- The backend service role key bypasses RLS entirely.
-- ---------------------------------------------------------------------------
create table tracker_connections (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  tracker          text not null check (tracker in ('strava', 'coros')),
  tracker_user_id  text not null,         -- e.g. Strava athlete ID
  access_token     text not null,
  refresh_token    text not null,
  expires_at       timestamptz not null,
  last_synced_at   timestamptz,
  created_at       timestamptz not null default now(),
  unique (user_id, tracker)              -- one connection per tracker per user
);

alter table tracker_connections enable row level security;
-- Intentionally no policies — service role only


-- ---------------------------------------------------------------------------
-- activities
-- One row per synced workout. This is the core data table.
-- tracker_source + tracker_id uniquely identifies an activity to prevent
-- duplicate imports if the same workout arrives more than once.
-- ---------------------------------------------------------------------------
create table activities (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  tracker_source        text not null check (tracker_source in ('strava', 'coros', 'manual')),
  tracker_id            text not null,         -- the tracker's own numeric/string ID
  activity_type         text not null,         -- maps to our ActivityType enum
  name                  text,                  -- activity name from the tracker
  started_at            timestamptz not null,
  duration_seconds      integer not null,
  distance_meters       numeric(10,2),
  elevation_gain_meters numeric(8,2),
  avg_heart_rate        integer,
  max_heart_rate        integer,
  avg_power_watts       integer,
  suffer_score          integer,               -- Strava-specific intensity metric, 0-100
  raw_data              jsonb,                 -- full original API payload for debugging
  created_at            timestamptz not null default now(),
  unique (user_id, tracker_source, tracker_id) -- prevents duplicate imports
);

alter table activities enable row level security;
-- Users can read their own activities
create policy "activities_read_own" on activities for select using (auth.uid() = user_id);
-- No frontend write policy — all writes go through the backend service role
create policy "activities_write_backend" on activities for all using (false);


-- ---------------------------------------------------------------------------
-- inventory_items
-- All gear a user has ever obtained. is_equipped tracks what's currently worn.
-- Defined before activity_rpg_results because that table references it.
-- ---------------------------------------------------------------------------
create table inventory_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  item_key    text not null,        -- e.g. "boots_of_endurance_uncommon"
  name        text not null,        -- display name shown in UI
  description text,
  slot        text not null check (slot in ('head','chest','legs','feet','weapon','accessory')),
  rarity      text not null check (rarity in ('common','uncommon','rare','epic','legendary')),
  stat_affix  text,                 -- which stat this item boosts, e.g. "endurance"
  stat_bonus  integer default 0,
  is_equipped boolean not null default false,
  obtained_at timestamptz not null default now()
);

alter table inventory_items enable row level security;
create policy "inventory_read_own" on inventory_items for select using (auth.uid() = user_id);


-- ---------------------------------------------------------------------------
-- activity_rpg_results
-- Stores the RPG outcome of each activity for auditability and re-processing.
-- One-to-one with activities (unique constraint on activity_id).
-- ---------------------------------------------------------------------------
create table activity_rpg_results (
  id           uuid primary key default gen_random_uuid(),
  activity_id  uuid not null unique references activities(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  xp_awarded   integer not null,
  -- JSON breakdown: { base, intensityMultiplier, streakMultiplier, activityTypeBonus }
  xp_breakdown jsonb not null,
  -- JSON stat changes: { endurance: 0.12, agility: 0.04, ... }
  stat_deltas  jsonb not null,
  loot_dropped boolean not null default false,
  loot_item_id uuid references inventory_items(id),
  level_up     boolean not null default false,
  level_after  integer not null,
  created_at   timestamptz not null default now()
);

alter table activity_rpg_results enable row level security;
create policy "rpg_results_read_own" on activity_rpg_results for select
  using (auth.uid() = user_id);


-- ---------------------------------------------------------------------------
-- quests
-- AI-generated training plans. weeks_data stores the full plan structure as
-- JSON so we don't need to normalise week/day rows until we need to query them.
-- ---------------------------------------------------------------------------
create table quests (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  title          text not null,
  description    text not null,
  goal_summary   text not null,
  duration_weeks integer not null,
  status         text not null default 'active'
                 check (status in ('active','completed','abandoned','expired')),
  weeks_data     jsonb not null,   -- full QuestWeek[] array
  rewards        jsonb not null,   -- { xpOnCompletion, xpPerWeek, guaranteedLootRarity }
  started_at     timestamptz not null default now(),
  expires_at     timestamptz not null,
  completed_at   timestamptz,
  created_by     text not null default 'ai' check (created_by in ('ai','manual')),
  created_at     timestamptz not null default now()
);

alter table quests enable row level security;
create policy "quests_read_own" on quests for select using (auth.uid() = user_id);


-- ---------------------------------------------------------------------------
-- guilds + guild_members
-- Small friend groups (not a public social network).
-- ---------------------------------------------------------------------------
create table guilds (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  description text,
  created_by  uuid not null references auth.users(id),
  created_at  timestamptz not null default now()
);

create table guild_members (
  guild_id  uuid not null references guilds(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  role      text not null default 'member' check (role in ('owner','member')),
  joined_at timestamptz not null default now(),
  primary key (guild_id, user_id)
);

alter table guilds enable row level security;
alter table guild_members enable row level security;

-- Anyone can see guild names/descriptions (needed for invite flows)
create policy "guilds_read_all" on guilds for select using (true);
-- Only members of a guild can see that guild's member list
create policy "guild_members_read_own_guild" on guild_members for select using (
  guild_id in (select guild_id from guild_members where user_id = auth.uid())
);


-- =============================================================================
-- Indexes
-- =============================================================================

-- Activities: most queries filter by user_id and order by date
create index idx_activities_user_date on activities (user_id, started_at desc);

-- RPG results: frequently joined to activities
create index idx_rpg_results_user on activity_rpg_results (user_id);

-- Quests: filtered by user and active/completed status
create index idx_quests_user_status on quests (user_id, status);


-- =============================================================================
-- Trigger: auto-create profile + character when a new user signs up
-- This fires on every INSERT into auth.users (i.e. on sign-up).
-- security definer means it runs with the privileges of the function owner
-- (postgres), not the calling user — required to write to auth-adjacent tables.
-- =============================================================================
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  -- Use the part of the email before @ as the default username
  insert into profiles (id, username)
  values (new.id, split_part(new.email, '@', 1));

  insert into characters (user_id)
  values (new.id);

  -- character_stats needs the character's UUID, so we look it up immediately
  insert into character_stats (character_id)
  select id from characters where user_id = new.id;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();
