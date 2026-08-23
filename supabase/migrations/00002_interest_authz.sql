-- Republic of FLOW — fix request authorization
--
-- Bug: interests_update said only WHO may edit a request row, never WHAT they
-- may change it to. A requester could set their own row's status to 'accepted'
-- with a single REST call — verified against production as an ordinary member.
-- The listing stayed open and no match was created (those need the owner's
-- permissions), but the owner's list showed a green "Accepted" beside someone
-- they never chose, and several people could do it at once.
--
-- Two layers here: column grants decide which columns the client may touch at
-- all, and policies decide which values are legal. Row policies alone can't do
-- this — a WITH CHECK sees only the new row, never the old one.

-- ============================================
-- market_interests
-- ============================================

-- Only `status` is client-writable. Nothing in the app ever updates message,
-- profile_id or listing_id, so this closes those columns entirely rather than
-- relying on a policy to police them.
revoke update on market_interests from anon, authenticated;
grant update (status) on market_interests to authenticated;

drop policy if exists "interests_update" on market_interests;

-- The requester owns their request, but not the verdict on it. WITH CHECK pins
-- the resulting row: they may leave it pending or withdraw, never accept or
-- decline themselves.
create policy "interests_update_own" on market_interests
  for update
  using (profile_id = auth_profile_id())
  with check (
    profile_id = auth_profile_id()
    and status in ('pending', 'withdrawn')
  );

-- The listing owner is the decision maker, so any status is legal for them.
-- Curators need it too, to hand an accepted request back to pending on
-- dis-match.
create policy "interests_update_owner" on market_interests
  for update
  using (
    listing_id in (select id from market_listings where creator_profile_id = auth_profile_id())
    or is_curator()
  )
  with check (
    listing_id in (select id from market_listings where creator_profile_id = auth_profile_id())
    or is_curator()
  );

-- Raising a hand only makes sense on someone else's still-open listing.
-- Previously you could apply to your own listing, or to one already matched or
-- closed, by knowing its id.
drop policy if exists "interests_insert" on market_interests;

create policy "interests_insert" on market_interests
  for insert
  with check (
    profile_id = auth_profile_id()
    and listing_id in (
      select id from market_listings
      where status = 'open'
        and creator_profile_id <> auth_profile_id()
    )
  );

-- ============================================
-- matches
-- ============================================

-- Participants mark a match met and curators close it; neither should be able
-- to rewrite who the match is between.
revoke update on matches from anon, authenticated;
grant update (status, completed_at) on matches to authenticated;

-- ============================================
-- Structural guards
--
-- Belt and braces for the same bug: even if a policy is loosened again later,
-- the database itself refuses a second accepted request or a second live
-- match. These also close the concurrency case, where two accepts racing each
-- other both pass an application-level check.
-- ============================================

create unique index if not exists one_accepted_interest_per_listing
  on market_interests (listing_id)
  where status = 'accepted';

create unique index if not exists one_live_match_per_listing
  on matches (listing_id)
  where status <> 'closed';

alter table matches
  drop constraint if exists distinct_match_parties;

alter table matches
  add constraint distinct_match_parties
  check (initiator_profile_id <> matched_profile_id);
