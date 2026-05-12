-- Fix handle_new_user trigger function.
--
-- Two issues with the original:
-- 1. security definer functions run without the caller's search_path, so
--    Postgres can't resolve unqualified table names like "profiles". Adding
--    `set search_path = public` fixes this.
-- 2. new.email can be null for some auth providers, which would break the
--    not-null constraint on profiles.username. We fall back to the user's ID.

create or replace function handle_new_user()
returns trigger language plpgsql security definer
set search_path = public
as $$
begin
  insert into profiles (id, username)
  values (
    new.id,
    coalesce(split_part(new.email, '@', 1), new.id::text)
  );

  insert into characters (user_id)
  values (new.id);

  insert into character_stats (character_id)
  select id from characters where user_id = new.id;

  return new;
end;
$$;
