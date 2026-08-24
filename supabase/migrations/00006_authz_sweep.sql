-- Republic of FLOW — finish the authorization sweep
--
-- 00002 fixed market_interests. 00005 fixed profiles. The same defect was still
-- present on the last two tables, because a policy decides WHICH ROW and only
-- column grants decide WHICH COLUMN. Four holes, all confirmed against the live
-- database as an ordinary member:
--
--   A. Close your own match directly            -> 200. Skips dismatch(), so the
--      listing stays 'matched' with no live pairing and nobody can apply again.
--   B. Forge a curator suggestion on your own
--      listing                                  -> 200. A fake endorsement,
--      indistinguishable from a real one.
--   C. Set your own listing to 'matched'        -> 200. Closes it to everyone
--      with no pairing behind it.
--   D. Fabricate a match with anyone            -> 201. listing_id is nullable
--      and the partial unique index does not constrain NULLs, so the row lands
--      in the victim's Matches tab.
--
-- Principle applied consistently now: a row that represents a RELATIONSHIP
-- between two members is never writable directly. It is produced and changed
-- only by a function that checks who is asking.

-- ============================================
-- matches — no direct writes at all
--
-- Rows are created by accept_interest(), completed by mark_match_met(), and
-- closed by dismatch(). All three are SECURITY DEFINER, so revoking here does
-- not affect them.
-- ============================================
revoke insert, update, delete on matches from anon, authenticated;

-- A participant may record that the meeting happened. That is the only
-- transition they own — closing a match remains curator-only, because it also
-- has to reopen the listing and restore the request.
create or replace function mark_match_met(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me    uuid := auth_profile_id();
  v_match matches%rowtype;
begin
  select * into v_match from matches where id = p_match_id;
  if not found then
    raise exception 'that match no longer exists' using errcode = 'P0002';
  end if;

  if v_me is null
     or (v_match.initiator_profile_id <> v_me and v_match.matched_profile_id <> v_me) then
    raise exception 'only the two people matched can mark this met' using errcode = '42501';
  end if;

  if v_match.status = 'closed' then
    raise exception 'that match has been undone' using errcode = 'P0001';
  end if;

  update matches
     set status = 'completed',
         completed_at = coalesce(completed_at, now())
   where id = p_match_id;
end;
$$;

revoke all    on function mark_match_met(uuid) from public, anon;
grant execute on function mark_match_met(uuid) to authenticated;

-- ============================================
-- market_listings — no direct updates
--
-- status is moved only by accept_interest() and dismatch(). The curator
-- suggestion is its own function. Creating a listing is still a plain insert,
-- guarded by the existing listings_insert policy.
--
-- Members cannot currently edit or withdraw a listing through the UI, so
-- nothing is lost here. When that feature arrives it should be an RPC that
-- names the columns it touches, not a restored blanket grant.
-- ============================================
revoke update on market_listings from anon, authenticated;

create or replace function curator_suggest(
  p_listing_id uuid,
  p_profile_id uuid,
  p_reason     jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_curator() then
    raise exception 'only a curator can suggest a classmate' using errcode = '42501';
  end if;

  if not exists (select 1 from market_listings where id = p_listing_id) then
    raise exception 'no such listing' using errcode = 'P0002';
  end if;
  if p_profile_id is not null
     and not exists (select 1 from profiles where id = p_profile_id) then
    raise exception 'no such member' using errcode = 'P0002';
  end if;

  update market_listings
     set suggested_profile_id = p_profile_id,
         suggested_reason     = p_reason
   where id = p_listing_id;
end;
$$;

revoke all    on function curator_suggest(uuid, uuid, jsonb) from public, anon;
grant execute on function curator_suggest(uuid, uuid, jsonb) to authenticated;

-- ============================================
-- Backstop for D
--
-- The insert policy is now redundant, since no role holds INSERT on matches,
-- but leaving a permissive rule in place invites a future grant to reopen the
-- hole. A match may only be created by a definer function.
-- ============================================
drop policy if exists "matches_insert" on matches;

-- Same reasoning for update: the remaining policy would apply again the moment
-- anyone restores a grant.
drop policy if exists "matches_update" on matches;
