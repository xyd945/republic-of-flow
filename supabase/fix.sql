-- Run once in Supabase SQL Editor. Safe to re-run.

-- 1. Grants: PostgREST roles had no table privileges at all.
grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema public
  to authenticated, service_role;
grant select on all tables in schema public to anon;

grant usage, select on all sequences in schema public
  to anon, authenticated, service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated, service_role;
alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated, service_role;

-- 2. Pin search_path on SECURITY DEFINER functions.
--    The auth service inserts as supabase_auth_admin, whose search_path does
--    not include public, and SECURITY DEFINER inherits the caller's path.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, full_name, initials)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    upper(left(split_part(new.email, '@', 1), 2))
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create or replace function auth_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.profiles where user_id = auth.uid()
$$;

create or replace function is_curator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_curator from public.profiles where user_id = auth.uid()),
    false
  )
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
