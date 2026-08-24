-- Republic of FLOW — close privilege escalation and anonymous reads
--
-- TWO CONFIRMED HOLES, both verified against the live database.
--
-- 1. PRIVILEGE ESCALATION. profiles_update_own restricts which ROW a member may
--    update but never which COLUMNS, and profiles kept broad table grants. A
--    plain member could promote themselves:
--
--        PATCH /rest/v1/profiles?id=eq.<own row>  { "is_curator": true }  -> 200
--
--    Curator confers the Curator Desk, deactivating and dis-matching anyone,
--    sending invitations, and — through is_curator() inside the RLS policies —
--    read access to every profile, interest and match in the cohort.
--
-- 2. ANONYMOUS READS. The select policies never required authentication, and
--    the publishable key ships inside the JS bundle. With no login at all:
--    26 profiles, 35 hidden worlds, 14 listings. Invitation-only signup does
--    not help — that path never creates an account.
--
-- Same lesson as 00002: a policy decides WHICH ROW, column grants decide WHICH
-- COLUMN, and a WITH CHECK decides what the row may become. All three are
-- needed.

-- ============================================
-- 1. No anonymous access to member data
-- ============================================
revoke all on profiles              from anon;
revoke all on profile_hidden_worlds from anon;
revoke all on market_listings       from anon;
revoke all on market_interests      from anon;
revoke all on matches               from anon;

-- Belt and braces: even if a grant is restored by accident, the policies
-- themselves now demand a signed-in caller.
drop policy if exists "profiles_select" on profiles;
create policy "profiles_select" on profiles
  for select using (
    auth.uid() is not null
    and (is_active = true or user_id = auth.uid() or is_curator())
  );

drop policy if exists "hw_select" on profile_hidden_worlds;
create policy "hw_select" on profile_hidden_worlds
  for select using (
    auth.uid() is not null
    and (visibility = 'members' or profile_id = auth_profile_id() or is_curator())
  );

drop policy if exists "listings_select" on market_listings;
create policy "listings_select" on market_listings
  for select using (
    auth.uid() is not null
    and (status in ('open','matched') or creator_profile_id = auth_profile_id() or is_curator())
  );

-- ============================================
-- 2. Members may edit their own profile, not their standing
--
-- Column grants are role-wide, so this list is what ANY member may write on a
-- row a policy lets them touch. is_curator, is_active, is_featured, user_id and
-- founder_no are deliberately absent: they describe standing in the Republic,
-- not self-description, and are set by a curator or by an administrator in SQL.
-- ============================================
revoke update on profiles from authenticated;

grant update (
  full_name, native_name, initials, class_name,
  headline, role, intro, professional, bio, avatar_url,
  preferred_language, contact_kind, contact_value,
  ask_topics, want_topics, languages
) on profiles to authenticated;

-- A member may only ever write their OWN row, and it must still be theirs
-- afterwards. Previously there was no WITH CHECK at all.
drop policy if exists "profiles_update_own" on profiles;
create policy "profiles_update_own" on profiles
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- The curator policy stays for the RPC below, which runs as its definer.
-- Direct writes to the protected columns are now impossible for everyone,
-- because no role holds the grant.

-- ============================================
-- 3. Curator actions move behind a function
--
-- The desk needs to set is_featured, is_active and class_name on other people.
-- Those columns are no longer directly writable, so the capability becomes an
-- explicit, checked function instead of an ambient table permission.
--
-- Note what is absent: there is no way to grant is_curator through the API at
-- all. Promoting a curator is a deliberate act performed in SQL by someone with
-- database access, which is how it should have been from the start.
-- ============================================
create or replace function curator_update_member(
  p_profile_id  uuid,
  p_is_featured boolean default null,
  p_is_active   boolean default null,
  p_class_name  text    default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_curator() then
    raise exception 'only a curator can change a member''s standing' using errcode = '42501';
  end if;

  if p_class_name is not null and p_class_name not in ('Class 26', 'Class 27') then
    raise exception 'unknown class' using errcode = 'P0001';
  end if;

  update profiles
     set is_featured = coalesce(p_is_featured, is_featured),
         is_active   = coalesce(p_is_active,   is_active),
         class_name  = coalesce(p_class_name,  class_name)
   where id = p_profile_id;

  if not found then
    raise exception 'no such member' using errcode = 'P0002';
  end if;
end;
$$;

revoke all    on function curator_update_member(uuid, boolean, boolean, text) from public, anon;
grant execute on function curator_update_member(uuid, boolean, boolean, text) to authenticated;
