-- Fix two issues in character_stats introduced in the initial schema:
--
-- 1. Stat defaults were 10 — RPG design requires stats to start at 1.
--    The starting character is meant to feel genuinely weak.
--
-- 2. Stat precision was numeric(6,2) — gains are fractional (e.g. 0.1243).
--    Two decimal places would silently round away small early gains.
--    numeric(8,4) gives four decimal places, which is enough precision
--    without being wasteful.

alter table character_stats
  alter column endurance  set default 1,
  alter column strength   set default 1,
  alter column agility    set default 1,
  alter column vitality   set default 1,
  alter column focus      set default 1,
  alter column resilience set default 1;

alter table character_stats
  alter column endurance  type numeric(8,4),
  alter column strength   type numeric(8,4),
  alter column agility    type numeric(8,4),
  alter column vitality   type numeric(8,4),
  alter column focus      type numeric(8,4),
  alter column resilience type numeric(8,4);

-- Reset any existing rows to 1 — the test user's stats were initialised with
-- the wrong default of 10 and should start from scratch.
update character_stats set
  endurance  = 1,
  strength   = 1,
  agility    = 1,
  vitality   = 1,
  focus      = 1,
  resilience = 1;
