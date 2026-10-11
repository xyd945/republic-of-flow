-- Republic of FLOW — the FLOW wallet and its ledger (issue #57, phase 1)
--
-- Every founder has a wallet. The Treasury gives 100 FLOW to each one on
-- arrival. A Wanted or an Offer may carry a price, and FLOW changes hands
-- through the steps a match already takes:
--
--   raise a hand   the price is recorded on the request, as it was then
--   accept         the payer's FLOW goes ON HOLD
--   "We met!"      the payer's confirmation pays it to the other founder
--   undo (curator) it goes back to the payer
--
-- On an Offer the person who takes it pays the poster. On a Wanted the poster
-- pays the person they accept. Only the payer can release a payment; a
-- curator can release one for them, or undo the match to refund it.
--
-- THE LEDGER
--
--   accounts             one per founder, plus the Treasury and On hold
--   ledger_transactions  one per event, with a unique ref (welcome:<founder>,
--                        hold:<match>, pay:<match>, refund:<match>), so an
--                        event can never happen twice
--   ledger_entries       the lines of each transaction; they add to zero
--
-- Rows in the two ledger tables are never updated or deleted — a trigger
-- refuses it, whoever asks. A founder's balance can never go below zero. The
-- Treasury's balance is negative: minus the FLOW it has issued. So all
-- balances together always add to zero, and ledger_audit() checks it.
--
-- Nobody writes any of this directly. Money moves only inside the functions
-- below and the market functions they are called from, in the same database
-- transaction as the step itself, so a match and its money cannot disagree.
--
-- DEPLOY: run this first, then merge. The running client keeps working: no
-- listing has a price until the new client sets one, edit_listing still takes
-- the four arguments it sends, and every founder simply has 100 FLOW waiting.

begin;

set local lock_timeout = '5s';

-- ============================================
-- Refuse to run against a shape we do not recognise
-- ============================================
do $$
begin
  if to_regclass('public.archive_notes') is null then
    raise exception 'Apply 00015 first: archive_notes is not here.';
  end if;
  if to_regclass('public.ledger_entries') is not null then
    raise exception 'ledger_entries already exists. Already migrated?';
  end if;
end $$;

-- ============================================
-- 1. Prices
--
-- Whole FLOW, 1 to 1,000; null is free. A request keeps the price the
-- listing had when the hand went up, so a later change cannot reach it.
-- Members cannot write requests at all (00009), and update listings only
-- through edit_listing (00006), so neither price can be edited around.
-- ============================================
alter table market_listings  add column price integer check (price between 1 and 1000);
alter table market_interests add column price integer check (price between 1 and 1000);

-- ============================================
-- 2. Accounts and the ledger
-- ============================================
create table accounts (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('member', 'treasury', 'escrow')),
  -- Set null if the profile is ever deleted: its history stays in the ledger.
  profile_id uuid unique references profiles(id) on delete set null,
  balance    bigint not null default 0,
  created_at timestamptz not null default now(),
  check (kind = 'member' or profile_id is null),
  -- The Treasury alone goes below zero: that figure is the FLOW in existence.
  check (kind = 'treasury' or balance >= 0)
);

create unique index accounts_one_of_each_system on accounts (kind) where kind <> 'member';

insert into accounts (kind) values ('treasury'), ('escrow');

create table ledger_transactions (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('welcome', 'hold', 'pay', 'refund')),
  ref        text not null unique,
  -- Not a foreign key: the history outlives the match row.
  match_id   uuid,
  -- The listing's title as typed, for reading the ledger later.
  memo       text not null default '',
  created_by uuid,
  created_at timestamptz not null default now()
);

create table ledger_entries (
  id             bigint generated always as identity primary key,
  transaction_id uuid not null references ledger_transactions(id),
  account_id     uuid not null references accounts(id),
  amount         bigint not null check (amount <> 0),
  created_at     timestamptz not null default now()
);

create index ledger_entries_account on ledger_entries (account_id, id desc);
create index ledger_entries_transaction on ledger_entries (transaction_id);

create or replace function ledger_is_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'the ledger only grows: % on % is refused', tg_op, tg_table_name using errcode = '42501';
end;
$$;

create trigger ledger_entries_append_only
  before update or delete on ledger_entries
  for each row execute function ledger_is_append_only();
create trigger ledger_entries_no_truncate
  before truncate on ledger_entries
  for each statement execute function ledger_is_append_only();
create trigger ledger_transactions_append_only
  before update or delete on ledger_transactions
  for each row execute function ledger_is_append_only();
create trigger ledger_transactions_no_truncate
  before truncate on ledger_transactions
  for each statement execute function ledger_is_append_only();

-- What a paid match owes, and where that stands. The Matches tab reads this.
create table match_payments (
  match_id         uuid primary key references matches(id) on delete cascade,
  payer_profile_id uuid not null references profiles(id) on delete cascade,
  payee_profile_id uuid not null references profiles(id) on delete cascade,
  amount           integer not null check (amount between 1 and 1000),
  status           text not null check (status in ('held', 'paid', 'refunded')),
  held_at          timestamptz not null default now(),
  settled_at       timestamptz,
  settled_by       text check (settled_by in ('payer', 'curator'))
);

-- ============================================
-- 3. Who may read what. Nobody writes.
--
-- Your own wallet and its lines; your own paid matches. Curators read all
-- of it, to settle disputes. The Treasury and On hold accounts are the
-- curators' only.
-- ============================================
alter table accounts            enable row level security;
alter table ledger_transactions enable row level security;
alter table ledger_entries      enable row level security;
alter table match_payments      enable row level security;

revoke all on accounts, ledger_transactions, ledger_entries, match_payments from anon, authenticated;
grant select on accounts, ledger_transactions, ledger_entries, match_payments to authenticated;

create policy "accounts_select" on accounts
  for select using (auth.uid() is not null and (profile_id = auth_profile_id() or is_curator()));

create policy "ledger_entries_select" on ledger_entries
  for select using (
    auth.uid() is not null
    and (is_curator() or account_id in (select id from accounts where profile_id = auth_profile_id()))
  );

create policy "ledger_transactions_select" on ledger_transactions
  for select using (
    auth.uid() is not null
    and (
      is_curator()
      or exists (
        select 1 from ledger_entries e join accounts a on a.id = e.account_id
         where e.transaction_id = ledger_transactions.id and a.profile_id = auth_profile_id()
      )
    )
  );

create policy "match_payments_select" on match_payments
  for select using (
    auth.uid() is not null
    and (payer_profile_id = auth_profile_id() or payee_profile_id = auth_profile_id() or is_curator())
  );

-- ============================================
-- 4. Moving FLOW — internal, called only from the functions below
-- ============================================
create or replace function member_account(p_profile uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.accounts where profile_id = p_profile;
  if v_id is null then
    insert into public.accounts (kind, profile_id) values ('member', p_profile)
    on conflict (profile_id) do nothing
    returning id into v_id;
    if v_id is null then
      select id into v_id from public.accounts where profile_id = p_profile;
    end if;
  end if;
  return v_id;
end;
$$;

create or replace function system_account(p_kind text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.accounts where kind = p_kind;
$$;

-- One transaction of two lines: p_amount out of one account, into another.
-- Returns null, and moves nothing, if a transaction with this ref already
-- exists — a repeat of the same event is a no-op, not a second payment.
create or replace function ledger_post(
  p_kind   text,
  p_ref    text,
  p_match  uuid,
  p_memo   text,
  p_from   uuid,
  p_to     uuid,
  p_amount bigint
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx uuid;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'an amount must be positive' using errcode = 'P0001';
  end if;
  if p_from is null or p_to is null or p_from = p_to then
    raise exception 'a transfer needs two different accounts' using errcode = 'P0001';
  end if;

  insert into public.ledger_transactions (kind, ref, match_id, memo, created_by)
  values (p_kind, p_ref, p_match, coalesce(p_memo, ''), auth_profile_id())
  on conflict (ref) do nothing
  returning id into v_tx;
  if v_tx is null then
    return null;
  end if;

  -- Both accounts locked in one fixed order, so two transfers between the
  -- same pair can never deadlock. A founder going below zero fails the
  -- balance check here; callers check first, so a member sees a sentence.
  perform 1 from public.accounts where id in (p_from, p_to) order by id for update;
  update public.accounts set balance = balance - p_amount where id = p_from;
  update public.accounts set balance = balance + p_amount where id = p_to;

  insert into public.ledger_entries (transaction_id, account_id, amount)
  values (v_tx, p_from, -p_amount), (v_tx, p_to, p_amount);

  return v_tx;
end;
$$;

-- A listing's title as one line of text, for the ledger's memo.
create or replace function listing_memo(p_listing_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    nullif(btrim(l.title ->> 'en'), ''),
    (select btrim(kv.value) from jsonb_each_text(l.title) kv where btrim(kv.value) <> '' limit 1),
    ''
  )
  from public.market_listings l where l.id = p_listing_id;
$$;

revoke all on function member_account(uuid)                                    from public, anon, authenticated;
revoke all on function system_account(text)                                    from public, anon, authenticated;
revoke all on function ledger_post(text, text, uuid, text, uuid, uuid, bigint) from public, anon, authenticated;
revoke all on function listing_memo(uuid)                                      from public, anon, authenticated;

-- ============================================
-- 5. 100 FLOW on arrival
--
-- Arriving is taking a founder number (00011, 00015), so the grant fires when
-- one is first set — by claim_membership(), by hand, or by the demo seeder.
-- The ref makes it once per founder, ever.
-- ============================================
create or replace function grant_welcome(p_profile uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform ledger_post('welcome', 'welcome:' || p_profile, null, '',
                      system_account('treasury'), member_account(p_profile), 100);
end;
$$;

revoke all on function grant_welcome(uuid) from public, anon, authenticated;

create or replace function welcome_new_founder()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.founder_no is not null and (tg_op = 'INSERT' or old.founder_no is null) then
    perform grant_welcome(new.id);
  end if;
  return null;
end;
$$;

create trigger profiles_welcome
  after insert or update of founder_no on profiles
  for each row execute function welcome_new_founder();

-- Everyone already here.
select grant_welcome(id) from profiles where founder_no is not null;

-- ============================================
-- 6. Notifications: being paid
-- ============================================
alter table notifications drop constraint notifications_kind_check;
alter table notifications add constraint notifications_kind_check check (kind in (
  'interest_raised',
  'interest_accepted',
  'interest_declined',
  'suggestion_made',
  'suggested_to_you',
  'match_undone',
  'match_met',
  'payment_received'      -- to the payee: payload carries amount, and by_curator
));

-- ============================================
-- 7. The market steps, now carrying money
--
-- Each is restated in full from 00008, so this file is the whole truth about
-- what it does. Only the marked parts are new.
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
  v_balance bigint;
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
  if exists (
    select 1 from market_interests
     where listing_id = p_listing_id and profile_id = v_me
  ) then
    raise exception 'you have already raised your hand here' using errcode = '23505';
  end if;

  -- NEW: on a priced Offer you are the one who pays, so you must have it.
  -- The real check is at accept, when the FLOW goes on hold; this one only
  -- stops a request that could never be paid.
  if v_listing.type = 'offer' and v_listing.price is not null then
    select balance into v_balance from accounts where profile_id = v_me;
    if coalesce(v_balance, 0) < v_listing.price then
      raise exception 'this costs % FLOW and you have %', v_listing.price, coalesce(v_balance, 0)
        using errcode = 'P0001';
    end if;
  end if;

  -- NEW: the price as it is now travels with the request.
  insert into market_interests (listing_id, profile_id, message, status, price)
  values (p_listing_id, v_me, p_message, 'pending', v_listing.price)
  returning id into v_id;

  perform add_notification(
    v_listing.creator_profile_id,
    'interest_raised',
    notification_payload(v_me, p_listing_id)
  );

  return v_id;
end;
$$;

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
  v_payer    uuid;
  v_payee    uuid;
  v_account  uuid;
  v_balance  bigint;
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

  -- NEW: a priced request puts the payer's FLOW on hold, or nothing happens
  -- at all — the raise below undoes the accept with it.
  if v_interest.price is not null then
    if v_listing.type = 'offer' then
      v_payer := v_interest.profile_id;
      v_payee := v_me;
    else
      v_payer := v_me;
      v_payee := v_interest.profile_id;
    end if;

    v_account := member_account(v_payer);
    select balance into v_balance from accounts where id = v_account for update;
    if v_balance < v_interest.price then
      if v_payer = v_me then
        raise exception 'you need % FLOW to accept this and you have %', v_interest.price, v_balance
          using errcode = 'P0001';
      else
        raise exception '% does not have enough FLOW for this right now',
          (select full_name from profiles where id = v_payer)
          using errcode = 'P0001';
      end if;
    end if;

    perform ledger_post('hold', 'hold:' || v_match_id, v_match_id, listing_memo(v_listing.id),
                        v_account, system_account('escrow'), v_interest.price);

    insert into match_payments (match_id, payer_profile_id, payee_profile_id, amount, status)
    values (v_match_id, v_payer, v_payee, v_interest.price, 'held');
  end if;

  perform add_notification(
    v_interest.profile_id,
    'interest_accepted',
    notification_payload(v_me, v_listing.id, v_match_id)
  );

  return v_match_id;
end;
$$;

create or replace function mark_match_met(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me      uuid := auth_profile_id();
  v_match   matches%rowtype;
  v_payment match_payments%rowtype;
  v_other   uuid;
begin
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

  if v_match.status = 'completed' then
    return;
  end if;

  v_other := case when v_match.initiator_profile_id = v_me
                  then v_match.matched_profile_id
                  else v_match.initiator_profile_id end;

  -- NEW: on a paid match, "We met!" is the payment, so only the payer says it.
  select * into v_payment from match_payments where match_id = p_match_id for update;
  if found and v_payment.status = 'held' then
    if v_payment.payer_profile_id <> v_me then
      raise exception 'the person paying confirms this one' using errcode = 'P0001';
    end if;

    perform ledger_post('pay', 'pay:' || p_match_id, p_match_id, listing_memo(v_match.listing_id),
                        system_account('escrow'), member_account(v_payment.payee_profile_id), v_payment.amount);
    update match_payments set status = 'paid', settled_at = now(), settled_by = 'payer'
     where match_id = p_match_id;

    update matches
       set status = 'completed',
           completed_at = coalesce(completed_at, now())
     where id = p_match_id;

    perform add_notification(v_payment.payee_profile_id, 'payment_received',
      notification_payload(v_me, v_match.listing_id, p_match_id)
        || jsonb_build_object('amount', v_payment.amount, 'by_curator', false));
    return;
  end if;

  update matches
     set status = 'completed',
         completed_at = coalesce(completed_at, now())
   where id = p_match_id;

  perform add_notification(v_other, 'match_met',
    notification_payload(v_me, v_match.listing_id, p_match_id));
end;
$$;

create or replace function dismatch(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match   matches%rowtype;
  v_payment match_payments%rowtype;
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

  -- NEW: anything still on hold goes back to the payer. A payment already
  -- made is not taken back by undoing the match.
  select * into v_payment from match_payments where match_id = p_match_id for update;
  if found and v_payment.status = 'held' then
    perform ledger_post('refund', 'refund:' || p_match_id, p_match_id, listing_memo(v_match.listing_id),
                        system_account('escrow'), member_account(v_payment.payer_profile_id), v_payment.amount);
    update match_payments set status = 'refunded', settled_at = now(), settled_by = 'curator'
     where match_id = p_match_id;
  end if;

  if v_match.listing_id is not null then
    update market_listings set status = 'open' where id = v_match.listing_id;

    update market_interests
       set status = 'pending'
     where listing_id = v_match.listing_id
       and profile_id = v_match.matched_profile_id
       and status = 'accepted';
  end if;

  perform add_notification(v_match.initiator_profile_id, 'match_undone',
    notification_payload(auth_profile_id(), v_match.listing_id, p_match_id));
  perform add_notification(v_match.matched_profile_id, 'match_undone',
    notification_payload(auth_profile_id(), v_match.listing_id, p_match_id));
end;
$$;

-- ============================================
-- 8. The Curator Desk: release a payment the payer never confirmed
-- (refunding is undoing the match: dismatch above)
-- ============================================
create or replace function curator_release_payment(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match   matches%rowtype;
  v_payment match_payments%rowtype;
begin
  if not is_curator() then
    raise exception 'only a curator can release a payment' using errcode = '42501';
  end if;

  select * into v_match from matches where id = p_match_id for update;
  if not found then
    raise exception 'that match no longer exists' using errcode = 'P0001';
  end if;
  if v_match.status = 'closed' then
    raise exception 'that match has been undone' using errcode = 'P0001';
  end if;

  select * into v_payment from match_payments where match_id = p_match_id for update;
  if not found or v_payment.status <> 'held' then
    raise exception 'nothing is on hold for this match' using errcode = 'P0001';
  end if;

  perform ledger_post('pay', 'pay:' || p_match_id, p_match_id, listing_memo(v_match.listing_id),
                      system_account('escrow'), member_account(v_payment.payee_profile_id), v_payment.amount);
  update match_payments set status = 'paid', settled_at = now(), settled_by = 'curator'
   where match_id = p_match_id;

  -- Releasing says they met; the match records it, as the payer's own tap would.
  update matches
     set status = 'completed',
         completed_at = coalesce(completed_at, now())
   where id = p_match_id;

  perform add_notification(v_payment.payee_profile_id, 'payment_received',
    notification_payload(v_payment.payer_profile_id, v_match.listing_id, p_match_id)
      || jsonb_build_object('amount', v_payment.amount, 'by_curator', true));
end;
$$;

-- The Treasury, and whether the books balance. Curators only.
create or replace function ledger_audit()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_curator() then
    raise exception 'only a curator can audit the ledger' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'issued',     -(select balance from accounts where kind = 'treasury'),
    'in_wallets', (select coalesce(sum(balance), 0) from accounts where kind = 'member'),
    'on_hold',    (select balance from accounts where kind = 'escrow'),
    'balanced',
      (select coalesce(sum(balance), 0) = 0 from accounts)
      and not exists (
        select 1 from accounts a
         where a.balance <> coalesce((select sum(e.amount) from ledger_entries e where e.account_id = a.id), 0)
      )
      and not exists (
        select 1 from ledger_entries group by transaction_id having sum(amount) <> 0
      )
  );
end;
$$;

revoke all    on function curator_release_payment(uuid) from public, anon;
grant execute on function curator_release_payment(uuid) to authenticated;
revoke all    on function ledger_audit() from public, anon;
grant execute on function ledger_audit() to authenticated;

-- ============================================
-- 9. edit_listing gains a price
--
-- p_price: null leaves it, 0 makes the listing free, 1 to 1,000 sets it.
-- Requests already raised keep the price they were raised at.
-- ============================================
drop function edit_listing(uuid, jsonb, jsonb, text[]);

create function edit_listing(
  p_listing_id  uuid,
  p_title       jsonb,
  p_description jsonb,
  p_images      text[] default null,
  p_price       integer default null
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

  if p_price is not null and p_price <> 0 and p_price not between 1 and 1000 then
    raise exception 'a price is whole FLOW from 1 to 1,000' using errcode = 'P0001';
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
         images      = coalesce(p_images, images),
         price       = case when p_price is null then price
                            when p_price = 0     then null
                            else p_price end
   where id = p_listing_id;
end;
$$;

revoke all    on function edit_listing(uuid, jsonb, jsonb, text[], integer) from public, anon;
grant execute on function edit_listing(uuid, jsonb, jsonb, text[], integer) to authenticated;

-- ============================================
-- Postconditions
-- ============================================
do $$
begin
  if (select count(*) from accounts where kind <> 'member') <> 2 then
    raise exception 'expected exactly one Treasury and one On hold account.';
  end if;
  if exists (select 1 from profiles p where p.founder_no is not null
              and not exists (select 1 from ledger_transactions t where t.ref = 'welcome:' || p.id)) then
    raise exception 'a numbered founder has no welcome grant.';
  end if;
  if (select coalesce(sum(balance), 0) from accounts) <> 0 then
    raise exception 'the accounts do not add up to zero.';
  end if;
  if has_table_privilege('authenticated', 'public.ledger_entries', 'INSERT')
     or has_table_privilege('authenticated', 'public.accounts', 'UPDATE')
     or has_table_privilege('authenticated', 'public.match_payments', 'INSERT')
     or has_table_privilege('anon', 'public.accounts', 'SELECT') then
    raise exception 'the ledger is writable by members or readable anonymously.';
  end if;
  if has_function_privilege('authenticated', 'public.ledger_post(text, text, uuid, text, uuid, uuid, bigint)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.grant_welcome(uuid)', 'EXECUTE') then
    raise exception 'a member can move FLOW directly.';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'edit_listing' and p.pronargs = 4) then
    raise exception 'the four-argument edit_listing is still here.';
  end if;
end $$;

commit;
