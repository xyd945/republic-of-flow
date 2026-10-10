-- Republic of FLOW — the Archive (issue #4)
--
-- A page that tells the Republic's history, newest first. Almost all of it
-- writes itself from what already happened; curators add the stories behind
-- it as notes.
--
-- WHAT THE ARCHIVE SAYS, AND WHERE IT COMES FROM
--
--   founders arriving   profiles.joined_at (new, below). Names and founder
--                       numbers are already public in People.
--   meetings            matches marked met. NO NAMES: a match is private to
--                       the two people and the curators, so the Archive is
--                       told only that one happened, when, and over which
--                       listing — its type and title, never its photos,
--                       whose paths begin with the owner's user id.
--                       archive_events() below is the only way in.
--   the Market opening  the first listing's title and type, nothing more.
--   milestones          counted in the app from the above.
--   curator notes       archive_notes (new, below).
--
-- Individual listings are deliberately NOT recorded: the Market already
-- shows them, and a history of every post would be a second feed.
--
-- DEPLOY: run this first, then merge. Nothing the running client calls
-- changes; it simply does not read the new column, table or functions yet.

begin;

set local lock_timeout = '5s';

-- ============================================
-- Refuse to run against a shape we do not recognise
-- ============================================
do $$
begin
  if to_regprocedure('public.edit_listing(uuid, jsonb, jsonb, text[])') is null then
    raise exception 'Apply 00014 first: edit_listing(uuid, jsonb, jsonb, text[]) is not here.';
  end if;
  if to_regclass('public.archive_notes') is not null then
    raise exception 'archive_notes already exists. Already migrated?';
  end if;
end $$;

-- ============================================
-- 1. When each founder arrived
--
-- created_at is when the INVITATION went out (handle_new_user makes the row
-- then). Arriving is taking a founder number, so the moment is stamped
-- whenever a number is first set — by claim_membership(), by hand in SQL, or
-- by the demo seeder — without touching any of them.
--
-- Members cannot write it: column grants on profiles (00005) name the
-- self-description columns only, and this is not one.
-- ============================================
alter table profiles add column joined_at timestamptz;

-- Everyone already numbered arrived at their first sign-in, which is when
-- their email was confirmed. Rows with no auth user fall back to created_at.
update profiles p
   set joined_at = coalesce(u.email_confirmed_at, u.last_sign_in_at, p.created_at)
  from auth.users u
 where u.id = p.user_id
   and p.founder_no is not null;

update profiles
   set joined_at = created_at
 where founder_no is not null
   and joined_at is null;

create or replace function stamp_joined_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.founder_no is not null and new.joined_at is null then
    new.joined_at := now();
  end if;
  return new;
end;
$$;

create trigger profiles_joined_at
  before insert or update of founder_no on profiles
  for each row execute function stamp_joined_at();

-- ============================================
-- 2. Curator notes
--
-- Plain text, one language, as typed — the same rule as listings since 00013.
-- Photos use the listing-images bucket and its rules from 00014 unchanged: a
-- curator uploads into their own folder, and the note keeps the paths.
-- ============================================
create table archive_notes (
  id                uuid primary key default gen_random_uuid(),
  -- Kept if the author later leaves; the note is the Republic's, not theirs.
  author_profile_id uuid references profiles(id) on delete set null,
  happened_on       date not null,
  title             text not null check (char_length(btrim(title)) between 1 and 120),
  body              text not null default '' check (char_length(body) <= 4000),
  images            text[] not null default '{}'
                    check (cardinality(images) <= 3 and coalesce(array_ndims(images), 1) = 1),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index archive_notes_happened_on on archive_notes (happened_on desc);

alter table archive_notes enable row level security;

-- Every signed-in member reads. Nobody writes directly: the two functions
-- below are the only way, so the curator check and the photo rules cannot be
-- stepped around with a plain INSERT.
revoke all on archive_notes from anon, authenticated;
grant select on archive_notes to authenticated;

create policy "archive_notes_select" on archive_notes
  for select using (auth.uid() is not null);

-- ============================================
-- 3. Writing, correcting and removing a note: curators only
--
-- Any curator may edit or remove any note. That is why the photo rule below
-- is not 00014's listing_images_ok(): a curator correcting a colleague's note
-- must be able to keep the colleague's photos on it. So a photo is accepted
-- if it is ALREADY on this note, or if it is a fresh upload in the caller's
-- own folder. Nothing else — not another member's photo, not a thumbnail.
-- ============================================
create or replace function save_archive_note(
  p_id          uuid,
  p_happened_on date,
  p_title       text,
  p_body        text,
  p_images      text[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me    uuid := auth_profile_id();
  v_keep  text[] := '{}';
  v_shape text;
  v_id    uuid;
begin
  if v_me is null or not is_curator() then
    raise exception 'only a curator can write in the Archive' using errcode = '42501';
  end if;

  if p_title is null or btrim(p_title) = '' then
    raise exception 'a note needs a title' using errcode = 'P0001';
  end if;
  -- A day of slack: "today" in the curator's timezone can be tomorrow in UTC.
  if p_happened_on is null or p_happened_on > current_date + 1 then
    raise exception 'a note cannot be dated in the future' using errcode = 'P0001';
  end if;

  p_images := coalesce(p_images, '{}');

  if p_id is not null then
    select images into v_keep from archive_notes where id = p_id for update;
    if not found then
      raise exception 'that note no longer exists' using errcode = 'P0001';
    end if;
  end if;

  -- One flat list, at most three, no repeats. count(distinct) skips nulls,
  -- so a null element fails the comparison too.
  if cardinality(p_images) > 0 and (
       array_ndims(p_images) <> 1
       or cardinality(p_images) > 3
       or cardinality(p_images) <> (select count(distinct x) from unnest(p_images) x)
     ) then
    raise exception 'a note can have at most three photos' using errcode = 'P0001';
  end if;

  v_shape := '^' || auth.uid()::text
          || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$';
  if exists (
    select 1 from unnest(p_images) x
     where not (x = any (v_keep))
       and x !~ v_shape
  ) then
    raise exception 'photos must be your own uploads' using errcode = 'P0001';
  end if;

  if p_id is null then
    insert into archive_notes (author_profile_id, happened_on, title, body, images)
    values (v_me, p_happened_on, btrim(p_title), btrim(coalesce(p_body, '')), p_images)
    returning id into v_id;
  else
    update archive_notes
       set happened_on = p_happened_on,
           title       = btrim(p_title),
           body        = btrim(coalesce(p_body, '')),
           images      = p_images,
           updated_at  = now()
     where id = p_id
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

revoke all    on function save_archive_note(uuid, date, text, text, text[]) from public, anon;
grant execute on function save_archive_note(uuid, date, text, text, text[]) to authenticated;

-- Returns the note's photos so the app can delete the files it is allowed to
-- (its own folder; a colleague's stay behind, which is harmless).
create or replace function delete_archive_note(p_id uuid)
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_images text[];
begin
  if auth_profile_id() is null or not is_curator() then
    raise exception 'only a curator can remove a note' using errcode = '42501';
  end if;

  delete from archive_notes where id = p_id returning images into v_images;
  if not found then
    raise exception 'that note no longer exists' using errcode = 'P0001';
  end if;

  return v_images;
end;
$$;

revoke all    on function delete_archive_note(uuid) from public, anon;
grant execute on function delete_archive_note(uuid) to authenticated;

-- ============================================
-- 4. What the Archive may know about meetings and the Market
--
-- Matches are visible only to the two people and the curators, and a closed
-- listing only to its owner. This function reads past both, so it returns
-- exactly what the Archive prints and nothing that identifies a person: no
-- profile ids, no match ids, no listing ids — and no photo, because a storage
-- path is <owner's user id>/<photo>.jpg and would name one of the two.
-- ============================================
create or replace function archive_events()
returns table (
  kind          text,
  happened_at   timestamptz,
  listing_type  text,
  listing_title jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select 'meeting', m.completed_at, l.type, l.title
    from public.matches m
    join public.market_listings l on l.id = m.listing_id
   where auth.uid() is not null
     and m.status = 'completed'
     and m.completed_at is not null
  union all
  (select 'first_listing', l.created_at, l.type, l.title
     from public.market_listings l
    where auth.uid() is not null
      and l.status not in ('draft', 'cancelled')
    order by l.created_at
    limit 1)
$$;

revoke all    on function archive_events() from public, anon;
grant execute on function archive_events() to authenticated;

-- ============================================
-- Postconditions
-- ============================================
do $$
begin
  if exists (select 1 from profiles where founder_no is not null and joined_at is null) then
    raise exception 'a numbered founder has no joined_at.';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'profiles_joined_at' and not tgisinternal) then
    raise exception 'the joined_at trigger was not created.';
  end if;
  if has_table_privilege('authenticated', 'public.archive_notes', 'INSERT')
     or has_table_privilege('authenticated', 'public.archive_notes', 'UPDATE')
     or has_table_privilege('authenticated', 'public.archive_notes', 'DELETE')
     or has_table_privilege('anon', 'public.archive_notes', 'SELECT') then
    raise exception 'archive_notes is writable by members or readable anonymously.';
  end if;
  if has_function_privilege('anon', 'public.archive_events()', 'EXECUTE') then
    raise exception 'archive_events() is callable anonymously.';
  end if;
end $$;

commit;
