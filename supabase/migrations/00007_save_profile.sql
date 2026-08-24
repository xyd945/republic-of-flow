-- Republic of FLOW — profile save becomes one transaction
--
-- handleSave was three sequential round trips, and only the first had its
-- error checked:
--
--   1. update profiles                     -- checked
--   2. delete profile_hidden_worlds        -- error discarded
--   3. insert profile_hidden_worlds        -- error discarded
--   setSaved(true)                         -- "Saved!" regardless
--
-- So a member could be told the save succeeded while the database held only
-- part of it, and a failure midway could not roll back because there was no
-- transaction to roll back to. Same defect, and the same fix, as
-- accept_interest() and dismatch() in 00003: one function, one transaction,
-- one error.
--
-- A NOTE ON SECURITY DEFINER AND COLUMN GRANTS
--
-- 00005 deliberately narrowed the UPDATE grant on profiles to the sixteen
-- self-description columns, so that a member could not write is_curator,
-- is_active, is_featured, user_id or founder_no on their own row. This
-- function is SECURITY DEFINER, which means it runs as the owner and those
-- grants no longer apply to it. The column list below IS the enforcement --
-- adding a column here genuinely grants it to every member, so treat that
-- UPDATE statement as the security boundary it is.
--
-- Likewise the row: v_me comes from auth_profile_id(), never from an argument,
-- so a member can only ever write their own profile. There is deliberately no
-- p_profile_id parameter to get wrong.
--
-- WHY THE CALLER SENDS BOTH THE DESIRED SET AND THE SET IT KNEW ABOUT
--
-- Hidden worlds are saved by replacing the set, which is idempotent in a way
-- the old delete-then-insert was not. Done naively that introduces a worse
-- bug than it fixes: a second tab holding a stale list would delete a world
-- the first tab had just added, simply because its payload did not mention
-- it. So the caller also sends the ids it had loaded, and this function only
-- ever deletes rows that were in that set and are not in the new one. A row
-- created since the caller last read is untouched rather than destroyed.

create or replace function save_profile(
  p_full_name           text,
  p_native_name         text,
  p_class_name          text,
  p_initials            text,
  p_headline            jsonb,
  p_role                jsonb,
  p_intro               jsonb,
  p_professional        jsonb,
  p_contact_kind        text,
  p_contact_value       text,
  p_ask_topics          jsonb,
  p_want_topics         jsonb,
  p_hidden_worlds       jsonb,
  p_known_world_ids     uuid[],
  p_expected_updated_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me      uuid := auth_profile_id();
  v_known   uuid[] := coalesce(p_known_world_ids, '{}'::uuid[]);
  v_worlds  jsonb  := coalesce(p_hidden_worlds, '[]'::jsonb);
  v_asks    jsonb  := coalesce(p_ask_topics,    '[]'::jsonb);
  v_wants   jsonb  := coalesce(p_want_topics,   '[]'::jsonb);
  v_keep    uuid[];
  v_current timestamptz;
begin
  if v_me is null then
    raise exception 'you must be signed in to save a profile' using errcode = '42501';
  end if;

  -- ------------------------------------------------------------------
  -- Validate everything before writing anything
  -- ------------------------------------------------------------------
  if coalesce(btrim(p_full_name), '') = '' then
    raise exception 'your name cannot be empty' using errcode = 'P0001';
  end if;

  if p_class_name is not null and p_class_name not in ('Class 26', 'Class 27') then
    raise exception 'unknown class' using errcode = 'P0001';
  end if;

  if p_contact_kind is not null
     and p_contact_kind not in ('whatsapp', 'wechat', 'email', 'class') then
    raise exception 'unknown contact method' using errcode = 'P0001';
  end if;

  if jsonb_typeof(v_asks) <> 'array'
     or jsonb_typeof(v_wants) <> 'array'
     or jsonb_typeof(v_worlds) <> 'array' then
    raise exception 'topics and hidden worlds must each be a list' using errcode = 'P0001';
  end if;

  -- Every translatable value must be a JSON object of language -> text, or the
  -- reader would render "[object Object]" or crash on an array.
  if jsonb_typeof(coalesce(p_headline,     '{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_role,         '{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_intro,        '{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_professional, '{}'::jsonb)) <> 'object' then
    raise exception 'a translated field must be an object of language to text'
      using errcode = 'P0001';
  end if;

  -- Checking the container is not enough: {"en": {}} is an object, survives a
  -- shape test, and then renders as [object Object] on every screen that shows
  -- the profile. Every leaf has to be text.
  if exists (
    select 1
      from jsonb_array_elements(
             jsonb_build_array(coalesce(p_headline, '{}'::jsonb), coalesce(p_role, '{}'::jsonb),
                               coalesce(p_intro, '{}'::jsonb), coalesce(p_professional, '{}'::jsonb))
             || v_asks || v_wants
           ) obj,
           lateral jsonb_each(obj) kv
     where jsonb_typeof(kv.value) <> 'string'
  ) then
    raise exception 'a translated value must be text' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from jsonb_array_elements(v_asks || v_wants) el
     where jsonb_typeof(el) <> 'object'
  ) then
    raise exception 'each topic must be an object of language to text' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from jsonb_array_elements(v_worlds) el
     where jsonb_typeof(el) <> 'object'
        or jsonb_typeof(coalesce(el -> 'name', 'null'::jsonb)) <> 'object'
        or not exists (
             select 1 from jsonb_each(el -> 'name') kv where jsonb_typeof(kv.value) = 'string'
           )
        or exists (
             select 1 from jsonb_each(el -> 'name') kv where jsonb_typeof(kv.value) <> 'string'
           )
        or coalesce(el ->> 'visibility', 'members') not in ('members', 'private')
  ) then
    raise exception 'each hidden world needs a name, and may only be shared with members or kept private'
      using errcode = 'P0001';
  end if;

  -- ------------------------------------------------------------------
  -- Concurrency fence
  --
  -- Every translatable column is written as a whole JSON object built by the
  -- caller from the copy it last read. Without this check, two tabs editing
  -- different languages would silently overwrite each other: the second save
  -- would carry the first's language back to its old value. Better to refuse
  -- and say so than to lose a translation quietly.
  --
  -- The caller passes back the exact timestamp string it read, so this is an
  -- equality test on the stored value and cannot drift on rounding. A caller
  -- that sends null opts out.
  -- ------------------------------------------------------------------
  select updated_at into v_current from profiles where id = v_me for update;

  if not found then
    raise exception 'your profile no longer exists' using errcode = 'P0001';
  end if;

  if p_expected_updated_at is not null and v_current is distinct from p_expected_updated_at then
    raise exception 'your profile changed somewhere else — reload before saving'
      using errcode = 'P0001';
  end if;

  -- ------------------------------------------------------------------
  -- Hidden worlds: check ownership before the destructive step
  --
  -- An id that is not one of mine is refused outright. Ignoring it silently
  -- would report a successful save for an entry that was never written.
  -- ------------------------------------------------------------------
  v_keep := array(
    select (el ->> 'id')::uuid
      from jsonb_array_elements(v_worlds) el
     where el ->> 'id' is not null
  );

  if array_length(v_keep, 1) is distinct from array_length(array(select distinct unnest(v_keep)), 1) then
    raise exception 'the same hidden world was sent twice' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from unnest(v_keep) as k(id)
     where not exists (
       select 1 from profile_hidden_worlds w
        where w.id = k.id and w.profile_id = v_me
     )
  ) then
    raise exception 'that hidden world is not yours to edit' using errcode = '42501';
  end if;

  -- ------------------------------------------------------------------
  -- The profile row
  --
  -- Every column written here is one of 00005's self-description columns.
  -- Nothing describing standing in the Republic is touched.
  -- ------------------------------------------------------------------
  update profiles
     set full_name     = btrim(p_full_name),
         native_name   = nullif(btrim(coalesce(p_native_name, '')), ''),
         class_name    = coalesce(p_class_name, class_name),
         initials      = coalesce(p_initials, initials),
         headline      = coalesce(p_headline,     '{}'::jsonb),
         role          = coalesce(p_role,         '{}'::jsonb),
         intro         = coalesce(p_intro,        '{}'::jsonb),
         professional  = coalesce(p_professional, '{}'::jsonb),
         contact_kind  = coalesce(p_contact_kind, contact_kind),
         contact_value = coalesce(p_contact_value, ''),
         ask_topics    = v_asks,
         want_topics   = v_wants
   where id = v_me;

  -- ------------------------------------------------------------------
  -- Hidden worlds: delete only what the caller saw and dropped
  -- ------------------------------------------------------------------
  delete from profile_hidden_worlds
   where profile_id = v_me
     and id = any (v_known)
     and not (id = any (v_keep));

  update profile_hidden_worlds w
     set name       = coalesce(e.name, w.name),
         category   = coalesce(e.category, w.category),
         visibility = coalesce(e.visibility, w.visibility),
         sort_order = coalesce(e.sort_order, w.sort_order)
    from (
      select (el ->> 'id')::uuid        as id,
             el -> 'name'               as name,
             el ->> 'category'          as category,
             el ->> 'visibility'        as visibility,
             (el ->> 'sort_order')::int as sort_order
        from jsonb_array_elements(v_worlds) el
       where el ->> 'id' is not null
    ) e
   -- profile_id in the predicate as well as the id: belt and braces alongside
   -- the ownership check above.
   where w.id = e.id and w.profile_id = v_me;

  insert into profile_hidden_worlds (profile_id, name, category, visibility, sort_order)
  select v_me,
         coalesce(el -> 'name', '{}'::jsonb),
         coalesce(el ->> 'category', 'craft'),
         coalesce(el ->> 'visibility', 'members'),
         coalesce((el ->> 'sort_order')::int, 0)
    from jsonb_array_elements(v_worlds) el
   where el ->> 'id' is null;
end;
$$;

revoke all    on function save_profile(text, text, text, text, jsonb, jsonb, jsonb, jsonb, text, text, jsonb, jsonb, jsonb, uuid[], timestamptz) from public, anon;
grant execute on function save_profile(text, text, text, text, jsonb, jsonb, jsonb, jsonb, text, text, jsonb, jsonb, jsonb, uuid[], timestamptz) to authenticated;

-- ============================================
-- A NINTH HOLE, found while reviewing this migration
--
-- 00005 left "profiles_update_curator" in place, with a comment claiming the
-- RPC needed it. That comment was wrong: curator_update_member() is SECURITY
-- DEFINER, so it runs as the owner and bypasses RLS entirely. The policy was
-- doing nothing for the RPC and everything for an attacker.
--
--   create policy "profiles_update_curator" on profiles
--     for update using (is_curator());          -- no WITH CHECK at all
--
-- Combined with 00005's column grants, that let a curator rewrite ANY
-- member's self-description directly, bypassing curator_update_member()
-- which was deliberately limited to is_featured, is_active and class_name.
-- Confirmed against the live database: a curator PATCHing another member's
-- headline returned 204 and the row genuinely changed.
--
-- A curator moderates standing; a curator does not get to put words in a
-- classmate's mouth. Nobody edits anyone else's self-description.
-- ============================================
drop policy if exists "profiles_update_curator" on profiles;

-- ============================================
-- Hidden worlds: writes go through save_profile() only
--
-- hw_update and hw_delete carried the same `or is_curator()`, so a curator
-- could rewrite or delete a classmate's hidden worlds too. And now that
-- save_profile() owns the whole set, direct writes serve no purpose while
-- still allowing a stale client to clobber a row behind the concurrency
-- fence. Same principle as 00006: the function is the only writer.
-- ============================================
revoke insert, update, delete on profile_hidden_worlds from anon, authenticated;

drop policy if exists "hw_insert" on profile_hidden_worlds;
drop policy if exists "hw_update" on profile_hidden_worlds;
drop policy if exists "hw_delete" on profile_hidden_worlds;
