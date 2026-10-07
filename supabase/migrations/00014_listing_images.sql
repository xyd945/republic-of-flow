-- Republic of FLOW — up to three photos on a Wanted or Offer (issue #14)
--
-- The first photo is the cover, shown on the card; the rest open when the
-- card is tapped. Files live in Supabase Storage rather than on Cloudflare so
-- that who may see and change them is decided by the same database rules as
-- the listing itself, and is exercised by the same authorization suite.
--
-- STORAGE LAYOUT
--
--   listing-images/<user id>/<uuid>.jpg      the photo, ~1600px
--   listing-images/<user id>/<uuid>_t.jpg    its thumbnail, ~720px
--
-- The browser resizes and re-encodes before uploading: phone photos arrive at
-- several megabytes and Supabase only generates thumbnails on paid plans, so
-- the card downloads a ~60 KB image instead of a full photo. Only the main
-- path is stored on the listing; the thumbnail is found by convention.
--
-- WHO MAY DO WHAT
--
--   read     any signed-in member — the same audience as the listing
--   upload   your own folder only
--   delete   your own folder only
--   replace  nobody: files are never overwritten, only added and removed
--
-- The bucket is private. A link to a photo works only for a signed-in member,
-- for an hour, so a forwarded link does not leak the directory.
--
-- WHAT A LISTING MAY POINT AT
--
-- Paths must sit in the poster's own folder and match the shape above. The
-- file's existence is not checked: doing that from inside a SECURITY DEFINER
-- function depends on how the hosted roles treat storage's row security, and
-- the worst a dangling path can do is show a broken image on your own card.
--
-- DEPLOY: run this first, then merge. The running client keeps working —
-- every listing gets an empty `images`, and edit_listing still accepts the
-- three arguments it sends today.

begin;

set local lock_timeout = '5s';

-- ============================================
-- Refuse to run against a shape we do not recognise
-- ============================================
do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'edit_listing' and p.pronargs = 3
  ) then
    raise exception 'Apply 00013 first: edit_listing(uuid, jsonb, jsonb) is not here.';
  end if;
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'market_listings' and column_name = 'images'
  ) then
    raise exception 'market_listings.images already exists. Already migrated?';
  end if;
end $$;

-- ============================================
-- The bucket
--
-- Upserted rather than inserted-if-missing: a bucket that already exists
-- under this name with public = true would otherwise be left public.
-- ============================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('listing-images', 'listing-images', false, 2097152, array['image/jpeg'])
on conflict (id) do update
   set public             = false,
       file_size_limit    = excluded.file_size_limit,
       allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "listing_images_read"   on storage.objects;
drop policy if exists "listing_images_upload" on storage.objects;
drop policy if exists "listing_images_delete" on storage.objects;

create policy "listing_images_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'listing-images');

create policy "listing_images_upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'listing-images'
              and (storage.foldername(name))[1] = auth.uid()::text);

create policy "listing_images_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'listing-images'
         and (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================
-- The column
-- ============================================
alter table market_listings
  add column images text[] not null default '{}';

alter table market_listings
  add constraint market_listings_images_max3 check (cardinality(images) <= 3);

-- ============================================
-- What a listing may point at
--
-- At most three, no repeats, each one a main photo in the CALLER's folder.
-- A thumbnail path is not accepted here; it is derived.
-- ============================================
create or replace function listing_images_ok(p_images text[])
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  v_me    text := auth.uid()::text;
  v_shape text;
begin
  if p_images is null then
    return false;
  end if;
  if cardinality(p_images) = 0 then
    return true;
  end if;
  if v_me is null then
    return false;
  end if;
  -- One flat list. A text[] column will also hold [["a"]], which passes every
  -- check below (cardinality and unnest see through the nesting) and would
  -- hand every reader a list where it expects a path.
  if array_ndims(p_images) <> 1
     or cardinality(p_images) > 3
     or cardinality(p_images) <> (select count(distinct x) from unnest(p_images) x) then
    return false;
  end if;
  v_shape := '^' || v_me || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$';
  return not exists (select 1 from unnest(p_images) x where x !~ v_shape);
end;
$$;

-- Publishing stays a plain insert; the policy now also checks the photos.
drop policy if exists "listings_insert" on market_listings;
create policy "listings_insert" on market_listings
  for insert with check (
    creator_profile_id = auth_profile_id()
    and listing_images_ok(images)
  );

-- ============================================
-- edit_listing gains photos
--
-- Postgres cannot add a parameter to an existing function, and leaving the
-- three-argument version beside a four-argument one would make PostgREST
-- refuse calls that match both. So the old one goes, inside this
-- transaction, and the new one defaults p_images to "leave them as they are"
-- — which is exactly what the client running today means by not sending it.
--
-- Body restated from 00013 with the photo handling added.
-- ============================================
drop function edit_listing(uuid, jsonb, jsonb);

create function edit_listing(
  p_listing_id  uuid,
  p_title       jsonb,
  p_description jsonb,
  p_images      text[] default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me      uuid := auth_profile_id();
  v_listing market_listings%rowtype;
begin
  if v_me is null then
    raise exception 'you must be signed in' using errcode = '42501';
  end if;

  if jsonb_typeof(p_title) is distinct from 'object'
     or jsonb_typeof(coalesce(p_description, '{}'::jsonb)) <> 'object' then
    raise exception 'title and description must be objects of language to text' using errcode = 'P0001';
  end if;
  if exists (select 1 from jsonb_each(p_title) kv where jsonb_typeof(kv.value) <> 'string')
     or exists (select 1 from jsonb_each(coalesce(p_description, '{}'::jsonb)) kv
                 where jsonb_typeof(kv.value) <> 'string') then
    raise exception 'title and description must be text' using errcode = 'P0001';
  end if;
  if not exists (select 1 from jsonb_each_text(p_title) kv where btrim(kv.value) <> '') then
    raise exception 'a listing needs a title' using errcode = 'P0001';
  end if;

  if p_images is not null and not listing_images_ok(p_images) then
    raise exception 'photos must be at most three of your own uploads' using errcode = 'P0001';
  end if;

  select * into v_listing from market_listings where id = p_listing_id for update;
  if not found then
    raise exception 'that listing no longer exists' using errcode = 'P0001';
  end if;
  if v_listing.creator_profile_id <> v_me then
    raise exception 'only the owner can edit a listing' using errcode = '42501';
  end if;
  if v_listing.status <> 'open' then
    raise exception 'only an open listing can be edited' using errcode = 'P0001';
  end if;

  update market_listings
     set title       = p_title,
         description = coalesce(p_description, '{}'::jsonb),
         images      = coalesce(p_images, images)
   where id = p_listing_id;
end;
$$;

revoke all    on function edit_listing(uuid, jsonb, jsonb, text[]) from public, anon;
grant execute on function edit_listing(uuid, jsonb, jsonb, text[]) to authenticated;

-- ============================================
-- Postconditions
-- ============================================
do $$
begin
  if (select public from storage.buckets where id = 'listing-images') is distinct from false then
    raise exception 'listing-images is not a private bucket.';
  end if;
  if (select count(*) from pg_policies
       where schemaname = 'storage' and tablename = 'objects'
         and policyname in ('listing_images_read', 'listing_images_upload', 'listing_images_delete')) <> 3 then
    raise exception 'the three storage policies were not all created.';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'edit_listing' and p.pronargs = 3) then
    raise exception 'the three-argument edit_listing is still here.';
  end if;
end $$;

commit;
