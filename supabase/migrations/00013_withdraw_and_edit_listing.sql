-- Republic of FLOW — a member can withdraw or correct their own listing
--
-- Issue #46: someone posted a Wanted with a mistake in it and had no way to
-- take it back. 00006 revoked UPDATE on market_listings from members and said
-- so plainly: "When that feature arrives it should be an RPC that names the
-- columns it touches, not a restored blanket grant." This is that RPC — two of
-- them, each touching exactly what it names.
--
-- WITHDRAW IS A STATUS, NOT A DELETE
--
-- 'cancelled' has been in the status check since 00001, waiting for this. A
-- delete would not even work: matches.listing_id has no cascade. And the
-- status is enough on its own, because every function that acts on a listing
-- already refuses anything that is not 'open' — raise_interest,
-- accept_interest, curator_suggest. Nobody can raise a hand on a withdrawn
-- listing, the owner cannot accept one, a curator cannot suggest anyone for
-- it, and listings_select stops showing it to anyone but its owner and the
-- curators.
--
-- BOTH ONLY WHILE OPEN
--
-- A matched listing has a counterpart who agreed to it. Rewriting it under
-- them, or withdrawing it out from under the match, is not a correction — and
-- undoing a match is already the curator's dismatch().
--
-- Safe to run before the client that uses these is deployed: they are new
-- functions and change the shape of nothing that exists.

begin;

set local lock_timeout = '5s';

-- ============================================
-- Withdraw
-- ============================================
create or replace function withdraw_listing(p_listing_id uuid)
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

  -- Locked, so a request being accepted at the same moment cannot land on a
  -- listing that is simultaneously being withdrawn: one waits for the other,
  -- then sees the status the first one left.
  select * into v_listing from market_listings where id = p_listing_id for update;
  if not found then
    raise exception 'that listing no longer exists' using errcode = 'P0001';
  end if;
  if v_listing.creator_profile_id <> v_me then
    raise exception 'only the owner can withdraw a listing' using errcode = '42501';
  end if;
  if v_listing.status <> 'open' then
    raise exception 'only an open listing can be withdrawn' using errcode = 'P0001';
  end if;

  update market_listings set status = 'cancelled' where id = p_listing_id;
end;
$$;

revoke all    on function withdraw_listing(uuid) from public, anon;
grant execute on function withdraw_listing(uuid) to authenticated;

-- ============================================
-- Edit
--
-- Title and description only: the two things the publish form lets a member
-- write. Type stays as it was — a Wanted that should have been an Offer is a
-- different listing, and people may already have raised a hand on this one.
-- ============================================
create or replace function edit_listing(
  p_listing_id  uuid,
  p_title       jsonb,
  p_description jsonb
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

  -- Same shape rules as raise_interest's message: an object of language to
  -- text, and nothing else.
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

  -- Replaced whole, not merged: the member typed one text, so the listing
  -- holds one. Merging an edit made in Chinese mode into an English original
  -- would leave two versions that disagree — the exact defect the profile
  -- editor had until 0c0c08c.
  update market_listings
     set title       = p_title,
         description = coalesce(p_description, '{}'::jsonb)
   where id = p_listing_id;
end;
$$;

revoke all    on function edit_listing(uuid, jsonb, jsonb) from public, anon;
grant execute on function edit_listing(uuid, jsonb, jsonb) to authenticated;

commit;
