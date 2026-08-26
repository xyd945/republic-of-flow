-- Republic of FLOW — tell the person the curator suggested
--
-- curator_suggest wrote the suggestion onto the listing and notified the
-- listing OWNER. The one party who learned nothing was the member being
-- suggested — so a curator could recommend someone and that someone never
-- found out, while the rest of the cohort could read it off the listing.
--
-- This adds a second notification, to the suggested member. There is still no
-- "accept" anywhere: the point is to put the listing in front of them so they
-- can read it and raise their hand themselves, through the same
-- raise_interest() every other member uses. Nothing here creates a match.
--
-- ============================================================
-- RUN THIS ONLY AFTER THE CLIENT THAT KNOWS 'suggested_to_you' IS DEPLOYED.
-- ============================================================
-- Being additive is NOT sufficient here, and my first draft of this file said
-- it was. This migration makes the database produce a notification KIND the
-- deployed client has never heard of, and that client does not ignore it: it
-- fetches every notification regardless of kind, finds no translation, and
-- ui() returns the key itself — so the panel renders the literal text
-- "notif.suggested_to_you" to a member. Nothing crashes; it just looks broken.
--
-- The rule the earlier migrations taught is about capability. The rule this one
-- teaches is about DATA: never let the database emit a shape the running client
-- cannot render. Order is: deploy the client, then run this.

begin;

-- Fail fast rather than queue behind a long transaction holding the table.
set local lock_timeout = '5s';

-- ============================================================
-- 1. The new kind
-- ============================================================
-- `kind` is constrained to a fixed allowlist, so the list has to grow before
-- anything can write the new value.
--
-- The constraint was created inline in 00008, so its name was generated rather
-- than chosen. Postgres names it notifications_kind_check by the usual
-- <table>_<column>_check rule — but a migration that ASSUMES that name and
-- writes `drop constraint if exists` fails OPEN: on any drift the drop quietly
-- does nothing, the new constraint is added alongside the old one, and the old
-- one goes on rejecting 'suggested_to_you'. The migration would report success
-- and curator_suggest would fail at runtime for every curator.
--
-- So the real name is read from the catalogue, and anything unexpected aborts.
do $$
declare
  v_name  text;
  v_count int;
begin
  select count(*), min(c.conname)
    into v_count, v_name
    from pg_constraint c
    join pg_attribute a
      on a.attrelid = c.conrelid
     and a.attnum   = any (c.conkey)
   where c.conrelid = 'public.notifications'::regclass
     and c.contype  = 'c'
     and a.attname  = 'kind';

  if v_count <> 1 then
    raise exception
      'expected exactly one check constraint on notifications.kind, found % — '
      'resolve by hand rather than guessing', v_count;
  end if;

  execute format('alter table notifications drop constraint %I', v_name);
end $$;

alter table notifications add constraint notifications_kind_check check (kind in (
  'interest_raised',
  'interest_accepted',
  'interest_declined',
  'suggestion_made',      -- to the listing owner: someone was suggested for it
  'suggested_to_you',     -- to the member: a curator put you forward
  'match_undone',
  'match_met'
));

-- ============================================================
-- 2. Notify both parties
-- ============================================================
-- Restated in full rather than patched, so this file is the whole truth about
-- what the function does.
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
  v_owner  uuid;
  v_status text;
begin
  if not is_curator() then
    raise exception 'only a curator can suggest a classmate' using errcode = '42501';
  end if;

  select creator_profile_id, status into v_owner, v_status
    from market_listings where id = p_listing_id;
  if not found then
    raise exception 'no such listing' using errcode = 'P0001';
  end if;

  -- Everything below only applies to MAKING a suggestion. Clearing one
  -- (p_profile_id null) stays possible whatever state the listing is in —
  -- a curator must always be able to withdraw a recommendation.
  if p_profile_id is not null then
    if not exists (select 1 from profiles where id = p_profile_id) then
      raise exception 'no such member' using errcode = 'P0001';
    end if;

    -- Suggesting the owner to themselves produces two notifications that
    -- contradict each other: "someone was suggested for your listing" and
    -- "you were put forward for your own listing". The admin form offers every
    -- member, so the invariant belongs here rather than in the dropdown.
    if p_profile_id = v_owner then
      raise exception 'that member already owns this listing' using errcode = 'P0001';
    end if;

    -- The whole point of the notification is "go and raise your hand", and
    -- raise_interest() refuses anything that is not open. Suggesting on a
    -- matched listing would send someone to a dead end.
    if v_status <> 'open' then
      raise exception 'that listing is no longer open' using errcode = 'P0001';
    end if;
  end if;

  update market_listings
     set suggested_profile_id = p_profile_id,
         suggested_reason     = p_reason
   where id = p_listing_id;

  -- Clearing a suggestion is not news.
  if p_profile_id is not null then
    -- The owner hears WHO was suggested, so the actor is the suggested member.
    perform add_notification(v_owner, 'suggestion_made',
      notification_payload(p_profile_id, p_listing_id));

    -- The suggested member hears WHOSE listing it is, so the actor is the
    -- owner. Both carry the listing id, which is what lets the app take
    -- either of them straight to it.
    --
    -- add_notification() declines to tell anyone about their own action, so a
    -- curator suggesting for their own listing hears nothing, and a curator
    -- who suggests themselves is not told what they just did.
    perform add_notification(p_profile_id, 'suggested_to_you',
      notification_payload(v_owner, p_listing_id));
  end if;
end;
$$;

-- Restated for the record, not because they were lost: CREATE OR REPLACE
-- FUNCTION keeps the existing owner and ACL, so these are the same privileges
-- 00006 and 00008 already granted. Repeating them makes this file readable on
-- its own, and costs nothing.
revoke all    on function curator_suggest(uuid, uuid, jsonb) from public, anon;
grant execute on function curator_suggest(uuid, uuid, jsonb) to authenticated;

commit;
