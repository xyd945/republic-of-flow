-- Republic of FLOW — Foundation migration (Stages 0–2)

-- ============================================
-- STAGE 0: Core user record
-- ============================================

create table profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique not null references auth.users(id) on delete cascade,
  full_name text not null,
  native_name text,
  initials text not null default '',
  class_name text not null default 'Class 26',
  headline jsonb not null default '{"en":""}',
  role jsonb not null default '{"en":""}',
  intro jsonb not null default '{"en":""}',
  professional jsonb not null default '{"en":""}',
  bio text,
  avatar_url text,
  preferred_language text not null default 'en',
  contact_kind text not null default 'class' check (contact_kind in ('whatsapp','wechat','email','class')),
  contact_value text not null default '',
  ask_topics jsonb not null default '[]',
  want_topics jsonb not null default '[]',
  languages text[] not null default '{}',
  is_active boolean not null default true,
  is_featured boolean not null default false,
  is_curator boolean not null default false,
  founder_no serial,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auto-update updated_at
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_updated_at
  before update on profiles
  for each row execute function update_updated_at();

-- Auto-create profile when a new user signs up.
-- search_path must be pinned: the auth service inserts as supabase_auth_admin,
-- whose search_path does not include public, and SECURITY DEFINER inherits it.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, full_name, initials)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    upper(left(split_part(new.email, '@', 1), 2))
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================
-- STAGE 1: Hidden Worlds
-- ============================================

create table profile_hidden_worlds (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  name jsonb not null default '{"en":""}',
  category text default 'craft',
  visibility text not null default 'members' check (visibility in ('members','private')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index idx_hidden_worlds_profile on profile_hidden_worlds(profile_id);

-- ============================================
-- STAGE 2: Market (Wanted / Offer)
-- ============================================

create table market_listings (
  id uuid primary key default gen_random_uuid(),
  creator_profile_id uuid not null references profiles(id) on delete cascade,
  type text not null check (type in ('wanted','offer')),
  title jsonb not null default '{"en":""}',
  description jsonb not null default '{"en":""}',
  tags text[] not null default '{}',
  chips jsonb not null default '[]',
  capacity integer,
  status text not null default 'open' check (status in ('draft','open','matched','closed','cancelled')),
  suggested_profile_id uuid references profiles(id),
  suggested_reason jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger market_listings_updated_at
  before update on market_listings
  for each row execute function update_updated_at();

create index idx_listings_creator on market_listings(creator_profile_id);
create index idx_listings_status on market_listings(status);

create table market_interests (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references market_listings(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  message jsonb,
  status text not null default 'pending' check (status in ('pending','accepted','declined','withdrawn')),
  created_at timestamptz not null default now(),
  unique(listing_id, profile_id)
);

create index idx_interests_listing on market_interests(listing_id);

create table matches (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references market_listings(id),
  initiator_profile_id uuid not null references profiles(id),
  matched_profile_id uuid not null references profiles(id),
  status text not null default 'proposed' check (status in ('proposed','accepted','connected','completed','closed')),
  source text not null default 'self' check (source in ('self','curator','system')),
  next_step jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index idx_matches_initiator on matches(initiator_profile_id);
create index idx_matches_matched on matches(matched_profile_id);

-- ============================================
-- RLS Policies
-- ============================================

alter table profiles enable row level security;
alter table profile_hidden_worlds enable row level security;
alter table market_listings enable row level security;
alter table market_interests enable row level security;
alter table matches enable row level security;

-- Helper: get current user's profile id
create or replace function auth_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.profiles where user_id = auth.uid()
$$;

-- Helper: check if current user is curator
create or replace function is_curator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_curator from public.profiles where user_id = auth.uid()),
    false
  )
$$;

-- Profiles: members can read active profiles, update own; curators can update all
create policy "profiles_select" on profiles
  for select using (is_active = true or user_id = auth.uid() or is_curator());

create policy "profiles_update_own" on profiles
  for update using (user_id = auth.uid());

create policy "profiles_update_curator" on profiles
  for update using (is_curator());

create policy "profiles_insert" on profiles
  for insert with check (user_id = auth.uid());

-- Hidden Worlds: own CRUD, read visible from active members
create policy "hw_select" on profile_hidden_worlds
  for select using (
    visibility = 'members'
    or profile_id = auth_profile_id()
    or is_curator()
  );

create policy "hw_insert" on profile_hidden_worlds
  for insert with check (profile_id = auth_profile_id());

create policy "hw_update" on profile_hidden_worlds
  for update using (profile_id = auth_profile_id() or is_curator());

create policy "hw_delete" on profile_hidden_worlds
  for delete using (profile_id = auth_profile_id() or is_curator());

-- Market Listings: anyone can read open; own CRUD; curator can moderate
create policy "listings_select" on market_listings
  for select using (
    status in ('open','matched')
    or creator_profile_id = auth_profile_id()
    or is_curator()
  );

create policy "listings_insert" on market_listings
  for insert with check (creator_profile_id = auth_profile_id());

create policy "listings_update_own" on market_listings
  for update using (creator_profile_id = auth_profile_id());

create policy "listings_update_curator" on market_listings
  for update using (is_curator());

-- Market Interests: participants and listing owners can read; own insert
create policy "interests_select" on market_interests
  for select using (
    profile_id = auth_profile_id()
    or listing_id in (select id from market_listings where creator_profile_id = auth_profile_id())
    or is_curator()
  );

create policy "interests_insert" on market_interests
  for insert with check (profile_id = auth_profile_id());

create policy "interests_update" on market_interests
  for update using (
    profile_id = auth_profile_id()
    or listing_id in (select id from market_listings where creator_profile_id = auth_profile_id())
    or is_curator()
  );

-- Matches: participants can read; curator can read all
create policy "matches_select" on matches
  for select using (
    initiator_profile_id = auth_profile_id()
    or matched_profile_id = auth_profile_id()
    or is_curator()
  );

create policy "matches_insert" on matches
  for insert with check (
    initiator_profile_id = auth_profile_id()
    or is_curator()
  );

create policy "matches_update" on matches
  for update using (
    initiator_profile_id = auth_profile_id()
    or matched_profile_id = auth_profile_id()
    or is_curator()
  );

-- ============================================
-- Grants (PostgREST roles; RLS still applies)
-- ============================================

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema public
  to authenticated, service_role;
grant select on all tables in schema public to anon;

grant usage, select on all sequences in schema public
  to anon, authenticated, service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated, service_role;
alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated, service_role;
