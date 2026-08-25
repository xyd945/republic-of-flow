-- Republic of FLOW — in-app notification centre
--
-- Deliberately not Web Push. That would need a service worker, VAPID keys,
-- per-browser permission prompts, and on iOS an installed PWA — for a hundred
-- classmates who open the app on purpose. An in-app centre delivers the same
-- value with none of it. Revisit only if people ask to be interrupted while
-- the app is closed.
--
-- Every notifiable event already happens inside a SECURITY DEFINER function,
-- so there is exactly one place to write each one. The single exception was
-- raising a hand on a listing, which was a plain client insert; it becomes
-- raise_interest() below, which also lets the last member-facing direct write
-- on market_interests be revoked.
--
-- AUTHORIZATION — the same shape as 00006 and 00007
--
-- A notification is personal correspondence, so it is stricter than anything
-- else in this schema:
--
--   * Nobody writes one directly. No role holds insert, update or delete, and
--     there are no policies for those actions. Rows appear only through
--     add_notification(), called by the functions below.
--   * The recipient is the ONLY reader. Every other select policy here has an
--     `or is_curator()` escape hatch. This one deliberately does not — a
--     curator moderates the Republic, they do not read its post.
--   * Marking read is a function, not a column grant. `grant update (read_at)`
--     would be role-wide, letting any member mark anyone else's mail read.

-- ============================================
-- The table
-- ============================================
create table if not exists notifications (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  kind       text not null check (kind in (
               'interest_raised',
               'interest_accepted',
               'interest_declined',
               'suggestion_made',
               'match_undone',
               'match_met'
             )),
  -- A snapshot, not a set of joins. The listing this refers to may be edited
  -- or deleted later; the notification should still read correctly. Names are
  -- plain text, titles keep their full {en, zh} object because the reader's
  -- language is not known at write time.
  payload    jsonb not null default '{}',
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_inbox
  on notifications (profile_id, created_at desc);
create index if not exists notifications_unread
  on notifications (profile_id) where read_at is null;

alter table notifications enable row level security;

revoke all    on notifications from anon, authenticated;
grant  select on notifications to authenticated;

drop policy if exists "notifications_select" on notifications;
create policy "notifications_select" on notifications
  for select using (auth.uid() is not null and profile_id = auth_profile_id());

-- ============================================
-- The only writer
--
-- Not called `notify` — that is a Postgres command, and shadowing it invites
-- confusion in any later trigger work.
-- ============================================
create or replace function add_notification(
  p_profile_id uuid,
  p_kind       text,
  p_payload    jsonb default '{}'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_profile_id is null then
    return;
  end if;

  -- Never tell someone about their own action. A curator undoing a match they
  -- are themselves part of should hear about it once, as a participant, not
  -- twice.
  if p_profile_id = auth_profile_id() then
    return;
  end if;

  insert into notifications (profile_id, kind, payload)
  values (p_profile_id, p_kind, coalesce(p_payload, '{}'::jsonb));
end;
$$;

-- Internal. The functions below reach it as the owner; no client ever should.
revoke all on function add_notification(uuid, text, jsonb) from public, anon, authenticated;

-- Small helper so every payload carries the same shape.
create or replace function notification_payload(
  p_actor_id   uuid,
  p_listing_id uuid default null,
  p_match_id   uuid default null
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'actor_id',      p_actor_id,
    'actor_name',    (select full_name from profiles where id = p_actor_id),
    'listing_id',    p_listing_id,
    'listing_title', (select title from market_listings where id = p_listing_id),
    'match_id',      p_match_id
  ));
$$;

revoke all on function notification_payload(uuid, uuid, uuid) from public, anon, authenticated;

-- ============================================
-- Marking read
--
-- Null means "everything of mine". The profile_id predicate is what keeps a
-- member from marking someone else's mail read by passing their ids.
-- ============================================
create or replace function mark_notifications_read(p_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me    uuid := auth_profile_id();
  v_count integer;
begin
  if v_me is null then
    raise exception 'you must be signed in' using errcode = '42501';
  end if;

  update notifications
     set read_at = now()
   where profile_id = v_me
     and read_at is null
     and (p_ids is null or id = any (p_ids));

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all    on function mark_notifications_read(uuid[]) from public, anon;
grant execute on function mark_notifications_read(uuid[]) to authenticated;

-- ============================================
-- Raising a hand becomes an RPC
--
-- Previously a direct insert. Moving it here gives one place to raise the
-- notification, adds the two checks the client only ever enforced visually,
-- and lets the last member-facing direct write on market_interests go.
-- ============================================
create or replace function raise_interest(
  p_listing_id uuid,
  p_message    jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me      uuid := auth_profile_id();
  v_listing market_listings%rowtype;
  v_id      uuid;
begin
  if v_me is null then
    raise exception 'you must be signed in' using errcode = '42501';
  end if;

  if p_message is not null and jsonb_typeof(p_message) <> 'object' then
    raise exception 'a message must be an object of language to text' using errcode = 'P0001';
  end if;
  if exists (select 1 from jsonb_each(coalesce(p_message, '{}'::jsonb)) kv
              where jsonb_typeof(kv.value) <> 'string') then
    raise exception 'a message must be text' using errcode = 'P0001';
  end if;

  select * into v_listing from market_listings where id = p_listing_id;
  if not found then
    raise exception 'that listing no longer exists' using errcode = 'P0001';
  end if;
  if v_listing.creator_profile_id = v_me then
    raise exception 'this is your own listing' using errcode = 'P0001';
  end if;
  if v_listing.status <> 'open' then
    raise exception 'this listing is no longer open' using errcode = 'P0001';
  end if;
  -- 00001 declares unique(listing_id, profile_id) on the table itself, with no
  -- status predicate: one request per member per listing, for good. So this
  -- check does not filter by status -- a declined or withdrawn request still
  -- occupies the slot, and the insert below would fail on the constraint
  -- anyway. Raising it here just produces a sentence instead of a raw
  -- constraint violation.
  --
  -- 23505 (unique_violation) deliberately, because that is genuinely what this
  -- is, and because the client already maps that code to a bilingual string.
  -- Every raise-exception message in this schema is English-only, so reusing
  -- the code is what gets a Chinese-reading member a Chinese message.
  if exists (
    select 1 from market_interests
     where listing_id = p_listing_id and profile_id = v_me
  ) then
    raise exception 'you have already raised your hand here' using errcode = '23505';
  end if;

  insert into market_interests (listing_id, profile_id, message, status)
  values (p_listing_id, v_me, p_message, 'pending')
  returning id into v_id;

  perform add_notification(
    v_listing.creator_profile_id,
    'interest_raised',
    notification_payload(v_me, p_listing_id)
  );

  return v_id;
end;
$$;

revoke all    on function raise_interest(uuid, jsonb) from public, anon;
grant execute on function raise_interest(uuid, jsonb) to authenticated;

-- The matching revoke on market_interests is deliberately NOT here. It lives
-- in 00009, to be run only AFTER this client is deployed.
--
-- Twice now a migration has been applied before the code that matches it, and
-- twice production broke: 00006 revoked the writes behind the We-met button,
-- and 00007 revoked the writes behind adding a Hidden World. Both reported
-- success to the member while doing nothing. Adding a capability is safe to
-- run early; taking one away is not. So this migration is purely additive and
-- can be applied at any time.

-- ============================================
-- The existing functions, restated so they raise notifications
--
-- Bodies are unchanged apart from the notification and one correction: they
-- used P0002 for "no longer exists", and PostgREST maps P0002 to HTTP 500
-- rather than 404 — verified by probing the live database. A member seeing a
-- stale row deserves a 400 and a sentence, not a server error.
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
    raise exception 'that request no longer exists' using errcode = 'P0001';
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

  -- Re-read under the lock. The status was read before we queued for it, so a
  -- decline that won the lock first may have moved it since; trusting the
  -- stale copy would accept an already-declined request and send the member
  -- both notifications.
  select * into v_interest from market_interests where id = p_interest_id;
  if v_interest.status <> 'pending' then
    raise exception 'that request is no longer pending' using errcode = 'P0001';
  end if;

  update market_interests set status = 'accepted'
   where id = p_interest_id and status = 'pending';
  update market_listings  set status = 'matched'  where id = v_listing.id;

  insert into matches (listing_id, initiator_profile_id, matched_profile_id, status, source)
  values (v_listing.id, v_me, v_interest.profile_id, 'connected', 'self')
  returning id into v_match_id;

  perform add_notification(
    v_interest.profile_id,
    'interest_accepted',
    notification_payload(v_me, v_listing.id, v_match_id)
  );

  return v_match_id;
end;
$$;

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
    raise exception 'that request no longer exists' using errcode = 'P0001';
  end if;

  -- Lock the listing first, exactly as accept_interest does. Without it, an
  -- accept and a decline of the same request can interleave and leave the
  -- interest 'declined' while the listing sits 'matched' with a live match --
  -- and send the member both notifications.
  select * into v_listing from market_listings
    where id = v_interest.listing_id
    for update;

  if v_listing.creator_profile_id <> v_me then
    raise exception 'only the listing owner can decline a request' using errcode = '42501';
  end if;

  -- Re-read under the lock: the status may have moved while we waited.
  select * into v_interest from market_interests where id = p_interest_id;
  if v_interest.status <> 'pending' then
    raise exception 'that request is no longer pending' using errcode = 'P0001';
  end if;

  update market_interests set status = 'declined'
   where id = p_interest_id and status = 'pending';

  perform add_notification(
    v_interest.profile_id,
    'interest_declined',
    notification_payload(v_me, v_listing.id)
  );
end;
$$;

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
    raise exception 'that match no longer exists' using errcode = 'P0001';
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

  -- Both sides hear about it. add_notification drops the one addressed to the
  -- curator if they happen to be a participant.
  perform add_notification(v_match.initiator_profile_id, 'match_undone',
    notification_payload(auth_profile_id(), v_match.listing_id, p_match_id));
  perform add_notification(v_match.matched_profile_id, 'match_undone',
    notification_payload(auth_profile_id(), v_match.listing_id, p_match_id));
end;
$$;

create or replace function mark_match_met(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me    uuid := auth_profile_id();
  v_match matches%rowtype;
  v_other uuid;
begin
  -- FOR UPDATE, so a concurrent dismatch() cannot commit 'closed' between this
  -- read and the write below and be silently undone back to 'completed'.
  select * into v_match from matches where id = p_match_id for update;
  if not found then
    raise exception 'that match no longer exists' using errcode = 'P0001';
  end if;

  if v_me is null
     or (v_match.initiator_profile_id <> v_me and v_match.matched_profile_id <> v_me) then
    raise exception 'only the two people matched can mark this met' using errcode = '42501';
  end if;

  if v_match.status = 'closed' then
    raise exception 'that match has been undone' using errcode = 'P0001';
  end if;

  -- Already met. Return quietly rather than raising: the button is idempotent
  -- from the member's point of view, and the caller has nothing to fix. What
  -- matters is not falling through to the notification, which would let either
  -- participant spam the other by pressing it repeatedly.
  if v_match.status = 'completed' then
    return;
  end if;

  update matches
     set status = 'completed',
         completed_at = coalesce(completed_at, now())
   where id = p_match_id;

  v_other := case when v_match.initiator_profile_id = v_me
                  then v_match.matched_profile_id
                  else v_match.initiator_profile_id end;

  perform add_notification(v_other, 'match_met',
    notification_payload(v_me, v_match.listing_id, p_match_id));
end;
$$;

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
declare
  v_owner uuid;
begin
  if not is_curator() then
    raise exception 'only a curator can suggest a classmate' using errcode = '42501';
  end if;

  select creator_profile_id into v_owner from market_listings where id = p_listing_id;
  if not found then
    raise exception 'no such listing' using errcode = 'P0001';
  end if;
  if p_profile_id is not null
     and not exists (select 1 from profiles where id = p_profile_id) then
    raise exception 'no such member' using errcode = 'P0001';
  end if;

  update market_listings
     set suggested_profile_id = p_profile_id,
         suggested_reason     = p_reason
   where id = p_listing_id;

  -- Clearing a suggestion is not news.
  if p_profile_id is not null then
    perform add_notification(v_owner, 'suggestion_made',
      notification_payload(p_profile_id, p_listing_id));
  end if;
end;
$$;

-- ============================================
-- Backfill nothing on purpose
--
-- Notifications describe events. Inventing them for history that happened
-- before this table existed would put unread mail in every inbox for things
-- people already dealt with weeks ago.
-- ============================================

-- ============================================
-- Re-state the grants
--
-- CREATE OR REPLACE FUNCTION preserves ownership and privileges, so the grants
-- from 00003 and 00006 survive the replacements above. Repeating them makes
-- that a guarantee of this file rather than a fact you have to remember.
-- ============================================
revoke all    on function accept_interest(uuid)               from public, anon;
revoke all    on function decline_interest(uuid)              from public, anon;
revoke all    on function dismatch(uuid)                      from public, anon;
revoke all    on function mark_match_met(uuid)                from public, anon;
revoke all    on function curator_suggest(uuid, uuid, jsonb)  from public, anon;

grant execute on function accept_interest(uuid)               to authenticated;
grant execute on function decline_interest(uuid)              to authenticated;
grant execute on function dismatch(uuid)                      to authenticated;
grant execute on function mark_match_met(uuid)                to authenticated;
grant execute on function curator_suggest(uuid, uuid, jsonb)  to authenticated;
