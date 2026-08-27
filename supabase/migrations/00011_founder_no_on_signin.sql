-- Republic of FLOW — a founder number is earned by signing in, not by being invited.
--
-- handle_new_user() fires AFTER INSERT ON auth.users. That happens the moment a
-- curator sends an invitation — and also the moment anyone merely REQUESTS an
-- OTP code and never types it. Both took a number off the sequence and put a
-- placeholder in the directory, named after the part of the email before the @.
-- Invite thirty people, have twelve accept, and the roster reads 1..30 with
-- eighteen ghosts in it.
--
-- The profile row still appears at invite time — a curator wants to see who has
-- been asked — but it now arrives numberless and inactive. The number is handed
-- out by claim_membership(), which a member can only ever call for themselves.
-- Being authenticated is itself the proof that they signed in, so there is no
-- need to read anything out of the auth schema to know it happened.
--
-- RUN THIS ONLY AFTER THE CLIENT THAT TOLERATES A NULL founder_no IS DEPLOYED.
-- The old client renders String(null).padStart(2,'0') as the literal text
-- "Founder No. null". Same rule as 00010: never let the database emit a shape
-- the running client cannot render.

begin;

set local lock_timeout = '5s';

-- ============================================
-- Refuse to run against a shape we do not recognise
-- ============================================
do $$
declare
  v_default text;
  v_nulls   integer;
  v_seq     text;
begin
  select column_default into v_default
    from information_schema.columns
   where table_schema = 'public'
     and table_name   = 'profiles'
     and column_name  = 'founder_no';

  if v_default is null or v_default not like 'nextval(%' then
    raise exception
      'profiles.founder_no has default %, not nextval(...). Already migrated?',
      coalesce(v_default, '<none>');
  end if;

  -- claim_membership() allocates through this sequence, so it has to resolve.
  -- Dropping the column default below does not break the ownership link that
  -- pg_get_serial_sequence follows, but assert it rather than assume it.
  v_seq := pg_get_serial_sequence('public.profiles', 'founder_no');
  if v_seq is null then
    raise exception 'No sequence is owned by profiles.founder_no.';
  end if;

  -- Every existing member keeps the number they already have. If any row is
  -- already numberless the database is in a state this migration did not
  -- create, and guessing who counts as joined is not our call to make.
  select count(*) into v_nulls from public.profiles where founder_no is null;
  if v_nulls > 0 then
    raise exception '% profile(s) already have no founder number.', v_nulls;
  end if;
end $$;

-- ============================================
-- The column stops filling itself in
-- ============================================
alter table profiles
  alter column founder_no drop default,
  alter column founder_no drop not null;

-- Allocation used to be the sequence's job and could not collide. Now that it
-- is written by hand, say out loud that two members may never share a number.
-- Postgres lets any number of rows sit at null under a unique constraint, which
-- is exactly what the not-yet-joined need.
alter table profiles
  add constraint profiles_founder_no_key unique (founder_no);

-- An invited row must not be visible in the directory before its owner shows
-- up. profiles_select already hides is_active = false from everyone but the
-- member themselves and the curators, so the default is the whole fix.
alter table profiles
  alter column is_active set default false;

-- ============================================
-- Claiming a place
-- ============================================
create or replace function claim_membership()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_no integer;
begin
  if auth.uid() is null then
    raise exception 'Not signed in.' using errcode = '42501';
  end if;

  -- Lock before looking. Two tabs finishing the same login at once must not
  -- both read null and both walk away with a number.
  select founder_no into v_no
    from profiles
   where user_id = auth.uid()
     for update;

  if not found then
    -- handle_new_user() creates the row when the auth user appears, so this
    -- means someone deleted the profile and left the account behind.
    raise exception 'No profile for this account.' using errcode = 'P0001';
  end if;

  -- Already a member. Return the number and touch nothing else: is_active is
  -- how a curator removes someone, and signing in must not undo that.
  if v_no is not null then
    return v_no;
  end if;

  v_no := nextval(pg_get_serial_sequence('public.profiles', 'founder_no'));

  update profiles
     set founder_no = v_no,
         is_active  = true
   where user_id = auth.uid();

  return v_no;
end;
$$;

revoke all on function claim_membership() from public;
revoke all on function claim_membership() from anon;
grant execute on function claim_membership() to authenticated;

-- ============================================
-- Postconditions
-- ============================================
do $$
declare
  v_lost integer;
begin
  select count(*) into v_lost from public.profiles where founder_no is null;
  if v_lost > 0 then
    raise exception 'Migration dropped % existing founder number(s).', v_lost;
  end if;

  if not exists (
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'claim_membership'
  ) then
    raise exception 'claim_membership() was not created.';
  end if;
end $$;

commit;
