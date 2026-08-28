-- Republic of FLOW — the Republic admits more than two cohorts
--
-- Members are arriving from classes before 26, so the roll widens to 20..27.
--
-- The list of valid classes was written out twice, inside save_profile() and
-- inside curator_update_member(), which is exactly the shape that drifts: add
-- a class to one and a member can set it on themselves but a curator cannot
-- move anyone into it. Both now ask one function instead, so the next cohort
-- is a one-line change in one place.
--
-- Both functions are restated below rather than patched, because Postgres has
-- no way to edit a function body in place. They are copied verbatim from
-- 00007 and 00011 with the single guard line swapped — nothing else in either
-- body is touched.
--
-- Deploy the client that offers the new classes at the same time or after
-- this: the database accepting a class the dropdown does not list is harmless,
-- the reverse is a member picking a class and being refused.

begin;

set local lock_timeout = '5s';

-- ============================================
-- Refuse to run against a shape we do not recognise
-- ============================================
do $$
begin
  -- curator_update_member() below is 00011's copy, guard and all. Running
  -- this first would silently roll that back to 00005's.
  if not exists (
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'claim_membership'
  ) then
    raise exception 'Apply 00011 first: this migration restates the function it rewrote.';
  end if;
end $$;

-- ============================================
-- One list, asked twice
-- ============================================
create or replace function is_known_class(p_class_name text)
returns boolean
language sql
immutable
as $$
  select p_class_name in (
    'Class 20', 'Class 21', 'Class 22', 'Class 23',
    'Class 24', 'Class 25', 'Class 26', 'Class 27'
  );
$$;

-- Callable by both SECURITY DEFINER functions, and harmless to anyone else:
-- it reads nothing and decides nothing but the shape of a string.
grant execute on function is_known_class(text) to authenticated;

-- ============================================
-- save_profile() — verbatim from 00007, guard line swapped
-- ============================================
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

  if p_class_name is not null and not public.is_known_class(p_class_name) then
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
-- curator_update_member() — verbatim from 00011, guard line swapped
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
declare
  v_founder_no integer;
begin
  if not is_curator() then
    raise exception 'only a curator can change a member''s standing' using errcode = '42501';
  end if;

  if p_class_name is not null and not public.is_known_class(p_class_name) then
    raise exception 'unknown class' using errcode = 'P0001';
  end if;

  -- FOR UPDATE, because this now reads a column and then writes based on it.
  -- Unlocked, the row could be deleted or claimed in between, and the UPDATE
  -- would quietly match nothing where 00005 raised.
  select founder_no into v_founder_no
    from profiles
   where id = p_profile_id
     for update;

  if not found then
    raise exception 'no such member' using errcode = 'P0001';
  end if;

  if coalesce(p_is_active, false) and v_founder_no is null then
    raise exception 'this invitation has not been accepted yet' using errcode = 'P0001';
  end if;

  update profiles
     set is_featured = coalesce(p_is_featured, is_featured),
         is_active   = coalesce(p_is_active,   is_active),
         class_name  = coalesce(p_class_name,  class_name)
   where id = p_profile_id;

  -- The lock above should make this unreachable. Kept because 00005 promised
  -- it, and a promise about a member vanishing is a cheap one to keep.
  if not found then
    raise exception 'no such member' using errcode = 'P0001';
  end if;
end;
$$;

revoke all    on function curator_update_member(uuid, boolean, boolean, text) from public, anon;
grant execute on function curator_update_member(uuid, boolean, boolean, text) to authenticated;

-- ============================================
-- Postconditions
-- ============================================
do $$
begin
  if not (public.is_known_class('Class 20') and public.is_known_class('Class 27')) then
    raise exception 'is_known_class() does not recognise the new cohorts.';
  end if;
  if public.is_known_class('Class 28') or public.is_known_class('') then
    raise exception 'is_known_class() is accepting classes that do not exist.';
  end if;
end $$;

commit;
