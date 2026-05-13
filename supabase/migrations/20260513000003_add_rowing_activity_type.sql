-- Add 'rowing' to the activity_type check constraint on the activities table.
-- Postgres does not support adding values to a check constraint in place —
-- the old one must be dropped and a new one added.
--
-- We use a DO block to find and drop the existing constraint by inspecting
-- pg_constraint, rather than hardcoding the name. Postgres auto-generates
-- names for inline check constraints and they can vary.
do $$
declare
  v_conname text;
begin
  select conname into v_conname
  from pg_constraint
  where conrelid = 'activities'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%activity_type%';

  if v_conname is not null then
    execute format('alter table activities drop constraint %I', v_conname);
  end if;
end $$;

alter table activities
  add constraint activities_activity_type_check
  check (activity_type in (
    'running', 'cycling', 'swimming', 'strength',
    'hiking', 'yoga', 'hiit', 'rowing', 'other'
  ));
