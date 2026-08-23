-- Republic of FLOW — transactional market operations
--
-- Accept, decline and dis-match were each several browser writes issued one
-- after another. A dropped connection mid-sequence left half-finished state:
-- an interest marked accepted while the listing stayed open and no match row
-- existed, with nothing to notice or repair it. The browser cannot hold a
-- transaction open across separate HTTP round trips, so the sequence has to
-- move inside the database.
--
-- Every Postgres function body is one transaction, so these are all-or-nothing
-- for free. `for update` on the listing turns concurrent accepts into a queue
-- rather than a race — the unique indexes in 00002 catch that case, these
-- prevent it. Each is also one round trip instead of three.
--
-- Authorization lives here now rather than in table policies: the checks are
-- explicit, in one place, and a client cannot route around them.

-- ============================================
-- accept_interest — pick one person, close the listing, record the pairing
-- ============================================
create or replace function accept_interest(p_interest_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me       uuid := auth_profile_id();
  v_interest market_interests%rowtype;
  v_listing  market_listings%rowtype;
  v_match_id uuid;
begin
  if v_me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  select * into v_interest from market_interests where id = p_interest_id;
  if not found then
    raise exception 'that request no longer exists' using errcode = 'P0002';
  end if;

  -- Serialize on the listing. A second accept blocks here until this commits,
  -- then fails the status check below rather than creating a rival match.
  select * into v_listing from market_listings
    where id = v_interest.listing_id
    for update;

  if v_listing.creator_profile_id <> v_me then
    raise exception 'only the listing owner can accept a request' using errcode = '42501';
  end if;
  if v_listing.status <> 'open' then
    raise exception 'this listing is no longer open' using errcode = 'P0001';
  end if;
  if v_interest.status <> 'pending' then
    raise exception 'that request is no longer pending' using errcode = 'P0001';
  end if;

  update market_interests set status = 'accepted' where id = p_interest_id;
  update market_listings  set status = 'matched'  where id = v_listing.id;

  insert into matches (listing_id, initiator_profile_id, matched_profile_id, status, source)
  values (v_listing.id, v_me, v_interest.profile_id, 'connected', 'self')
  returning id into v_match_id;

  return v_match_id;
end;
$$;

-- ============================================
-- decline_interest — turn one person down, listing stays open
-- ============================================
create or replace function decline_interest(p_interest_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me       uuid := auth_profile_id();
  v_interest market_interests%rowtype;
  v_listing  market_listings%rowtype;
begin
  if v_me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  select * into v_interest from market_interests where id = p_interest_id;
  if not found then
    raise exception 'that request no longer exists' using errcode = 'P0002';
  end if;

  select * into v_listing from market_listings where id = v_interest.listing_id;

  if v_listing.creator_profile_id <> v_me then
    raise exception 'only the listing owner can decline a request' using errcode = '42501';
  end if;
  if v_interest.status <> 'pending' then
    raise exception 'that request is no longer pending' using errcode = 'P0001';
  end if;

  update market_interests set status = 'declined' where id = p_interest_id;
end;
$$;

-- ============================================
-- dismatch — curator undoes a pairing that fell through
--
-- Reopens the listing and returns the accepted request to pending so the owner
-- can choose again. Rejected requests are deliberately left rejected: the
-- owner already made that call.
-- ============================================
create or replace function dismatch(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match matches%rowtype;
begin
  if not is_curator() then
    raise exception 'only a curator can undo a match' using errcode = '42501';
  end if;

  select * into v_match from matches where id = p_match_id for update;
  if not found then
    raise exception 'that match no longer exists' using errcode = 'P0002';
  end if;
  if v_match.status = 'closed' then
    raise exception 'that match is already closed' using errcode = 'P0001';
  end if;

  update matches set status = 'closed' where id = p_match_id;

  if v_match.listing_id is not null then
    update market_listings set status = 'open' where id = v_match.listing_id;

    update market_interests
       set status = 'pending'
     where listing_id = v_match.listing_id
       and profile_id = v_match.matched_profile_id
       and status = 'accepted';
  end if;
end;
$$;

-- ============================================
-- Grants
--
-- Signed-in members may call these. The functions decide for themselves
-- whether the caller is entitled to what they asked for.
-- ============================================
revoke all on function accept_interest(uuid)  from public, anon;
revoke all on function decline_interest(uuid) from public, anon;
revoke all on function dismatch(uuid)         from public, anon;

grant execute on function accept_interest(uuid)  to authenticated;
grant execute on function decline_interest(uuid) to authenticated;
grant execute on function dismatch(uuid)         to authenticated;

-- ============================================
-- Close the direct path
--
-- With every transition behind a function, no client needs to write
-- market_interests.status at all. 00002 narrowed that column to legal values;
-- this removes it. Withdrawing is the one thing a member still does directly,
-- so the column stays writable for that and the policies from 00002 keep
-- accepted/declined out of a requester's reach.
--
-- matches keeps (status, completed_at) because "We met!" is a genuine
-- single-row update by a participant, not a multi-step transition.
-- ============================================
-- (no change needed: 00002 already limits the writable surface, and the
--  policies there remain the backstop if a function is ever bypassed)
