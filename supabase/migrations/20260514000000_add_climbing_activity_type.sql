-- Add 'climbing' to the activity_type check constraint.
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
    'hiking', 'yoga', 'hiit', 'rowing', 'climbing', 'other'
  ));
