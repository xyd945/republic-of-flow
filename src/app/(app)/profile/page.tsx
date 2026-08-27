'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { CATEGORIES, t } from '@/lib/i18n/translations';
import { useI18n } from '@/lib/i18n/context';
import { useSignOut } from '@/lib/supabase/hooks';
import { useViewerProfile } from '@/lib/data/views';
import { useSaveProfile } from '@/lib/data/mutations';
import { CLASSES, DEFAULT_CLASS } from '@/lib/classes';
import { LoadError } from '@/components/ui';
import { Page } from '@/components/pixel/shell';
import {
  Avatar, Bi, Button, Divider, ErrorNote, Field, Panel, PixelSpinner, SectionHeader, Sprite, StatusChip,
} from '@/components/pixel';
import type { Language, CategoryId, Translatable } from '@/types';

/**
 * Editing counterpart to i18n `t()`, and deliberately stricter: it must NOT
 * fall through to another language. An empty field means "no translation yet
 * in this language" — borrowing the English text here would save it straight
 * back into the Chinese field, because the form has no way to tell a real
 * translation apart from a fallback it displayed a moment ago.
 *
 * That is exactly what used to happen: this returned `obj[lang] ?? obj.en`,
 * so any save made while the UI was in Chinese stamped the English text into
 * the `zh` key of every field the member had not touched.
 */
function tVal(obj: Translatable | string | null | undefined, lang: Language): string {
  if (!obj) return '';
  if (typeof obj === 'string') return obj;
  return obj[lang] ?? '';
}

/**
 * What the field says in the OTHER language, shown as placeholder text.
 * Since tVal no longer falls through, a Chinese-mode field holding only
 * English renders empty — without this hint that reads as a lost profile
 * rather than as an untranslated field.
 */
function otherLang(obj: Translatable | string | null | undefined, lang: Language): string {
  if (!obj || typeof obj === 'string') return '';
  return obj[lang === 'en' ? 'zh' : 'en'] ?? '';
}

/**
 * Write `value` into `lang`, leaving every other language untouched. An
 * emptied field drops just that language's key rather than storing '', so
 * clearing the Chinese headline leaves the English one intact.
 */
function mergeLang(existing: Translatable | null | undefined, lang: Language, value: string): Translatable {
  const next: Translatable = existing && typeof existing === 'object' ? { ...existing } : {};
  const trimmed = value.trim();
  if (trimmed) next[lang] = trimmed;
  else delete next[lang];
  return next;
}

/**
 * Topics and hidden worlds are displayed read-only — a chip with a remove
 * button, never an editable field — so they carry their original Translatable
 * and hand it back on save byte-for-byte. Only something the member actually
 * typed gets a language stamped on it. This is what stops a save in one
 * language from deleting the other, which the old
 * `topics.map(t => mergeLang(null, lang, t))` did on every single save.
 */
type Draft = { original: Translatable | null; text: string; lang?: Language };

/**
 * `lang` is the language the member was in when they TYPED this, captured at
 * creation. Reading the active language at save time instead would file
 * "Woodworking" under `zh` just because they switched tabs before saving.
 */
function draftValue({ original, text, lang }: Draft, fallback: Language): Translatable {
  return original ?? mergeLang(null, lang ?? fallback, text);
}

/** The four free-text fields that carry a translation. */
type TransFields = { headline: string; role: string; intro: string; professional: string };

const EMPTY_FIELDS: TransFields = { headline: '', role: '', intro: '', professional: '' };

function fieldsFor(profile: { headline: unknown; role: unknown; intro: unknown; professional: unknown }, lang: Language): TransFields {
  return {
    headline: tVal(profile.headline as Translatable, lang),
    role: tVal(profile.role as Translatable, lang),
    intro: tVal(profile.intro as Translatable, lang),
    professional: tVal(profile.professional as Translatable, lang),
  };
}

/**
 * Fold every language the member has drafted into the stored value, so one
 * save writes both translations. A language never opened has no draft and is
 * therefore left exactly as it was.
 */
function mergeDrafts(
  stored: Translatable | null | undefined,
  drafts: Record<string, TransFields>,
  seeds: Record<string, TransFields>,
  key: keyof TransFields,
): Translatable {
  let out: Translatable = stored && typeof stored === 'object' ? { ...stored } : {};
  for (const [lang, fields] of Object.entries(drafts)) {
    // Untouched since it was seeded, so leave the stored value exactly as it
    // is. Merging it back would rewrite the row for no reason — and since
    // mergeLang trims, simply LOOKING at a language would quietly reformat it.
    if (seeds[lang]?.[key] === fields[key]) continue;
    out = mergeLang(out, lang as Language, fields[key]);
  }
  return out;
}

// Guard against extra/trailing spaces producing "undefined" initials.
// A single-word name uses its first two letters rather than one lonely letter.
/**
 * Two characters, whatever the name.
 *
 * Uppercase FIRST, then take two — the other order lets a ligature expand
 * after the slice: "ﬃ" sliced to two characters and then uppercased is "FFI",
 * three glyphs, which overflows the avatar it is drawn in. Sliced by code
 * point rather than by UTF-16 unit so a surrogate pair (an emoji, or a rarer
 * CJK glyph) is never cut in half.
 */
function initialsOf(fullName: string): string {
  const words = fullName.split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  const raw = words.length === 1 ? words[0] : words[0][0] + words[1][0];
  return [...raw.toUpperCase()].slice(0, 2).join('');
}

export default function ProfilePage() {
  const router = useRouter();
  const { lang, setLang, ui } = useI18n();
  const { profile, loading, error: loadError, refreshing } = useViewerProfile();
  const signOut = useSignOut();
  const save = useSaveProfile();

  const [name, setName] = useState('');
  const [nativeName, setNativeName] = useState('');
  const [className, setClassName] = useState<string>(DEFAULT_CLASS);
  /**
   * One draft per language, not one set of fields for whichever language is
   * showing. The form used to re-read every field from the profile whenever
   * `lang` changed, so switching to Chinese to add a translation threw away
   * the English edit you had just made — the exact workflow this change is
   * meant to enable. Drafts persist across switches and all of them are
   * written by a single save.
   */
  const [drafts, setDrafts] = useState<Record<string, TransFields>>({});
  // What each language looked like when its draft was seeded, so we can tell
  // an edit apart from a language the member merely opened and read.
  const [seeds, setSeeds] = useState<Record<string, TransFields>>({});
  const [contactKind, setContactKind] = useState<'whatsapp' | 'wechat' | 'email' | 'class'>('class');
  const [contactValue, setContactValue] = useState('');
  const [worlds, setWorlds] = useState<{ id: string; original: Translatable | null; name: string; lang?: Language; category: CategoryId; visible: boolean }[]>([]);
  const [askTopics, setAskTopics] = useState<Draft[]>([]);
  const [wantTopics, setWantTopics] = useState<Draft[]>([]);
  const [newAsk, setNewAsk] = useState('');
  const [newWant, setNewWant] = useState('');
  const [showAddWorld, setShowAddWorld] = useState(false);
  const [newWorldName, setNewWorldName] = useState('');
  const [newWorldCat, setNewWorldCat] = useState<CategoryId>('craft');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  // Which server revision the form was last filled from. Comparing against
  // profile.updated_at tells a genuine reload apart from a language switch.
  const [hydratedAt, setHydratedAt] = useState<string | null>(null);
  const [pendingSave, setPendingSave] = useState(false);

  useEffect(() => {
    if (!saved) return;
    const id = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(id);
  }, [saved]);

  // The directory swallows query errors, so a failed reload would otherwise
  // leave the button saying "Saving..." for good. Release it either way — and
  // say something, rather than just going quiet. Silently returning to "Save
  // changes" with neither "Saved!" nor an error leaves the member with no idea
  // whether their edit reached the Republic. The write itself succeeded; it is
  // the reload afterwards that did not, so the wording says exactly that.
  useEffect(() => {
    if (!pendingSave) return;
    const id = setTimeout(() => {
      setPendingSave(false);
      setSaving(false);
      setError(ui('profile.saved_not_reloaded'));
    }, 8000);
    return () => clearTimeout(id);
  }, [pendingSave, ui]);

  const fields = drafts[lang] ?? EMPTY_FIELDS;
  const setField = (key: keyof TransFields, value: string) =>
    setDrafts((d) => ({ ...d, [lang]: { ...(d[lang] ?? EMPTY_FIELDS), [key]: value } }));

  useEffect(() => {
    if (!profile) return;
    const relabel = (d: Draft) => (d.original ? { ...d, text: t(d.original, lang) } : d);

    /**
     * Take the server's copy wholesale ONLY when the form has nothing of the
     * member's in it — the very first load, or the moment their own save
     * lands. Both were previously conflated with "updated_at changed", which
     * was wrong twice over:
     *
     *  - profiles and hidden_worlds are separate queries, invalidated
     *    separately. If profiles came back first, this concluded the save was
     *    finished and rebuilt the form against the OLD worlds — resurrecting a
     *    Hidden World the member had just deleted, and saying "Saved!". So a
     *    completing save now waits for every table to settle.
     *
     *  - updated_at also changes for reasons that are not the member's save.
     *    A curator toggling is_featured fires the same trigger. With
     *    refetchOnWindowFocus on, coming back to the tab would then wipe an
     *    unsaved draft with no warning.
     */
    const firstLoad = hydratedAt === null;
    const ourSaveLanded = pendingSave && !refreshing;

    if (profile.updated_at !== hydratedAt && (firstLoad || ourSaveLanded)) {
      setHydratedAt(profile.updated_at);
      setName(profile.full_name);
      setNativeName(profile.native_name ?? '');
      setClassName(profile.class_name || DEFAULT_CLASS);
      setContactKind(profile.contact_kind);
      setContactValue(profile.contact_value);
      const seeded = fieldsFor(profile, lang);
      setDrafts({ [lang]: seeded });
      setSeeds({ [lang]: seeded });
      // Read-only rows: they display with the usual cross-language fallback
      // and keep `original` to hand straight back on save.
      setWorlds(profile.hidden_worlds.map((hw) => ({
        id: hw.id,
        original: hw.name as Translatable,
        name: t(hw.name, lang),
        category: hw.category as CategoryId,
        visible: hw.visibility === 'members',
      })));
      setAskTopics((profile.ask_topics ?? []).map((a) => ({ original: a as Translatable, text: t(a, lang) })));
      setWantTopics((profile.want_topics ?? []).map((w) => ({ original: w as Translatable, text: t(w, lang) })));
      setError('');
      if (pendingSave) {
        setPendingSave(false);
        setSaving(false);
        setSaved(true);
      }
      return;
    }

    // Otherwise the member is mid-edit, or only the language changed. Seed a
    // draft for a language visited for the first time, relabel the read-only
    // rows, and leave every pending edit — in this language and the other —
    // exactly where it is.
    if (!drafts[lang]) {
      const seeded = fieldsFor(profile, lang);
      setDrafts((d) => ({ ...d, [lang]: seeded }));
      setSeeds((sd) => ({ ...sd, [lang]: seeded }));
    }
    setWorlds((prev) => prev.map((w) => (w.original ? { ...w, name: t(w.original, lang) } : w)));
    setAskTopics((prev) => prev.map(relabel));
    setWantTopics((prev) => prev.map(relabel));
  }, [profile, lang, hydratedAt, pendingSave, refreshing, drafts]);

  const addWorld = () => {
    if (!newWorldName.trim()) return;
    // `original: null` marks it as new — save_profile inserts the rows that
    // arrive without an id and keeps the rest.
    setWorlds([...worlds, { id: `new-${Date.now()}`, original: null, name: newWorldName.trim(), lang, category: newWorldCat, visible: true }]);
    setNewWorldName('');
    setShowAddWorld(false);
  };

  // No delete list to track any more: the array we send IS the desired set,
  // so anything removed here is simply absent when we save.
  const removeWorld = (id: string) => setWorlds(worlds.filter(x => x.id !== id));

  /**
   * One call, one transaction. This used to be three sequential writes with
   * the errors of the last two discarded, so a half-finished save still
   * reported "Saved!" — see 00007 for the full account.
   */
  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    setError('');

    const payload = {
      p_full_name: name,
      p_native_name: nativeName || null,
      p_class_name: className,
      p_initials: initialsOf(name),
      p_headline: mergeDrafts(profile.headline as Translatable, drafts, seeds, 'headline'),
      p_role: mergeDrafts(profile.role as Translatable, drafts, seeds, 'role'),
      p_intro: mergeDrafts(profile.intro as Translatable, drafts, seeds, 'intro'),
      p_professional: mergeDrafts(profile.professional as Translatable, drafts, seeds, 'professional'),
      p_contact_kind: contactKind,
      /* "Find me in class" means there is no handle to hand out, so the stored
         one is cleared rather than merely hidden. The form stops showing the
         field for this kind, and the dossier prints contact_value whenever it
         is non-empty regardless of kind — so leaving the old value behind
         would keep publishing an address the member believes they withdrew,
         with no field left anywhere to clear it. Switching to "find me in
         class" and saving is now the way to take an address down. */
      p_contact_value: contactKind === 'class' ? '' : contactValue,
      p_ask_topics: askTopics.map((d) => draftValue(d, lang)),
      p_want_topics: wantTopics.map((d) => draftValue(d, lang)),
      p_hidden_worlds: worlds.map((w, i) => ({
        // A new world has no row yet, so it goes without an id and is inserted.
        id: w.original ? w.id : null,
        name: w.original ?? mergeLang(null, w.lang ?? lang, w.name),
        category: w.category,
        visibility: w.visible ? 'members' : 'private',
        sort_order: i,
      })),
      // The ids we loaded. save_profile deletes only rows in this set that are
      // absent from the one above, so a world added in another tab since we
      // read is left alone rather than destroyed by our stale list.
      p_known_world_ids: profile.hidden_worlds.map((h) => h.id),
      // Refuse the save outright if the profile moved under us — better a
      // clear message than one language quietly overwriting the other.
      p_expected_updated_at: profile.updated_at,
    };

    try {
      await save.mutateAsync(payload);
    } catch (e) {
      setSaving(false);
      setError(e instanceof Error ? e.message : String(e));
      return;
    }

    // Reload so newly inserted worlds pick up their real ids — otherwise a
    // second Save would send them as new again.
    //
    // Deliberately stay in the saving state until that reload lands. Clearing
    // it here would leave the form looking ready while a rehydration is still
    // in flight, and anything typed in that window would be overwritten by it.
    // "Saved!" now means the server has it AND we have read it back.
    // The mutation has already invalidated profiles and hidden worlds, so the
    // reload is in flight. Staying in the saving state until it lands is what
    // makes "Saved!" mean the server has it AND we have read it back.
    setPendingSave(true);
  };

  if (loadError) return <LoadError message={loadError} onRetry={() => window.location.reload()} />;

  if (loading) {
    return (
      <div className="grid place-items-center" style={{ minHeight: '50vh' }}>
        <div className="text-center">
          <PixelSpinner size={20} color="var(--color-gold)" />
          <div style={{ marginTop: 12 }}><Bi en={ui('profile.loading')} color="var(--color-muted)" /></div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <Page>
        <Panel pad={16} corners>
          <div className="text-center">
            <Bi en={ui('profile.not_found')} zh="找不到档案" color="var(--color-red)" />
            <p style={{ margin: '10px 0 14px', fontSize: 'var(--text-body)', color: 'var(--color-muted)', lineHeight: 1.6 }}>
              {ui('profile.not_created')}
            </p>
            <Button tone="dark" onClick={signOut}>{ui('auth.sign_out')}</Button>
          </div>
        </Panel>
      </Page>
    );
  }

  const addTopic = (
    list: Draft[], set: (d: Draft[]) => void, value: string, clear: () => void,
  ) => {
    if (!value.trim()) return;
    set([...list, { original: null, text: value.trim(), lang }]);
    clear();
  };

  /** Removable topic tag. Gold for "ask me", sage for "I want". */
  const Tag = ({ text, tone, onRemove }: { text: string; tone: 'gold' | 'sage'; onRemove: () => void }) => (
    <span className="rof-label inline-flex items-center" style={{
      gap: 6, padding: '4px 4px 4px 8px', textTransform: 'none', letterSpacing: 0,
      background: tone === 'gold' ? 'var(--color-gold-tint)' : 'var(--color-sage-tint)',
      border: `2px solid ${tone === 'gold' ? 'var(--color-gold)' : 'var(--color-sage)'}`,
      color: tone === 'gold' ? '#6B5223' : '#3F5742',
    }}>
      {text}
      <button type="button" onClick={onRemove} aria-label={`Remove ${text}`}
        style={{
          width: 16, height: 16, flex: 'none', display: 'grid', placeItems: 'center', cursor: 'pointer',
          background: 'transparent', border: 'none', borderRadius: 0, padding: 0,
          color: 'inherit', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-small)', lineHeight: 1,
        }}>X</button>
    </span>
  );

  return (
    <Page>
      {/* the head — eyebrow, a headline that asks something, then who you are */}
      <Panel pad={14} corners>
        <Bi en="Your Dossier" zh="你的档案" color="var(--color-gold)" />
        <div style={{
          fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-h2)',
          letterSpacing: 'var(--tracking-display)', textTransform: 'uppercase',
          color: 'var(--color-ink)', lineHeight: 1.4, marginTop: 9,
        }}>{lang === 'zh' ? '你想让同学发现你的什么？' : 'What Should the Class Discover?'}</div>
        <Divider className="my-3" />
        <div className="flex items-center" style={{ gap: 13 }}>
          <Avatar initials={profile.initials || initialsOf(name)} id={profile.id} size={60} featured={profile.is_featured} />
          <div style={{ minWidth: 0 }}>
            {/* Blank only in the moment between signing in and the claim
                landing; the app shell is already retrying it. */}
            {profile.founder_no !== null ? (
              <Bi en={`Founder No. ${String(profile.founder_no).padStart(2, '0')}`}
                zh={profile.is_curator ? '策展人' : undefined} color="var(--color-gold)" />
            ) : null}
            <div style={{
              fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-h3)',
              letterSpacing: 'var(--tracking-display)', textTransform: 'uppercase',
              color: 'var(--color-ink)', marginTop: 5, lineHeight: 1.25,
            }}>{name || 'Your name'}</div>
            <div style={{ fontSize: 'var(--text-small)', color: 'var(--color-muted)', marginTop: 3 }}>
              {lang === 'zh' ? '暂用姓名首字母作头像。' : 'Initials stand in for a portrait.'}
            </div>
          </div>
        </div>
      </Panel>

      {/* The single most confusing thing about this screen, said out loud. The
          language toggle in the bar decides which translation the text fields
          write to — not merely which language the labels are in. */}
      <Panel pad={11} tone="gold" innerRule={false}>
        <Bi en={`Editing in ${lang === 'zh' ? '中文' : 'English'}`} zh={lang === 'zh' ? '编辑中文版' : '编辑英文版'} color="var(--color-navy-900)" />
        <p style={{ margin: '6px 0 0', fontSize: 'var(--text-small)', color: 'var(--color-ink-2)', lineHeight: 1.55 }}>
          {lang === 'zh'
            ? '切换顶部的 EN / 中 可以编辑另一种语言的版本。两种语言会一起保存。'
            : 'Switch EN / 中 in the bar above to write the other language. Both are saved together.'}
        </p>
      </Panel>

      {/* identity */}
      <section>
        <SectionHeader icon="nav-journal" cn="身份" className="mb-3">{ui('profile.identity')}</SectionHeader>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 12 }}>
          <Field label={ui('profile.full_name')} cn="姓名">
            <input className="rof-input" type="text" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label={ui('profile.native_name')} cn="本名">
            <input className="rof-input" type="text" value={nativeName} onChange={(e) => setNativeName(e.target.value)} placeholder={ui('profile.optional')} />
          </Field>
          <Field label={ui('profile.class')} cn="班级">
            <select className="rof-input" value={className} onChange={(e) => setClassName(e.target.value)}>
              {CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label={ui('profile.headline')} cn="一句话">
            <input className="rof-input" type="text" value={fields.headline} onChange={(e) => setField('headline', e.target.value)} placeholder={otherLang(profile.headline, lang)} />
          </Field>
          <Field label={ui('profile.role')} cn="角色">
            <input className="rof-input" type="text" value={fields.role} onChange={(e) => setField('role', e.target.value)} placeholder={otherLang(profile.role, lang)} />
          </Field>
        </div>
      </section>

      {/* introduction */}
      <section>
        <SectionHeader icon="idea" cn="介绍" className="mb-3">{ui('profile.introduction')}</SectionHeader>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 12 }}>
          <Field label={ui('profile.personal_intro')} cn="个人介绍">
            <textarea className="rof-input" rows={3} value={fields.intro} onChange={(e) => setField('intro', e.target.value)} placeholder={otherLang(profile.intro, lang)} />
          </Field>
          <Field label={ui('profile.professional')} cn="职业背景">
            <textarea className="rof-input" rows={2} value={fields.professional} onChange={(e) => setField('professional', e.target.value)} placeholder={otherLang(profile.professional, lang)} />
          </Field>
        </div>
      </section>

      {/* hidden worlds */}
      <section>
        <SectionHeader icon="star" cn="隐藏世界" className="mb-3" trailing={
          <Button tone="gold" size="sm" onClick={() => setShowAddWorld(true)}>+ {ui('profile.add')}</Button>
        }>{ui('profile.hidden_worlds')}</SectionHeader>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 8 }}>
          {worlds.map((w) => {
            const cat = CATEGORIES.find((c) => c.id === w.category);
            return (
              <div key={w.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: 9,
                border: '2px solid var(--color-line)', background: 'var(--color-white)',
              }}>
                <span aria-hidden style={{
                  width: 24, height: 24, flex: 'none', display: 'block',
                  background: `var(--color-cat-${w.category})`, border: '2px solid var(--color-navy-900)',
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="truncate" style={{ fontSize: 'var(--text-body)', color: 'var(--color-ink)' }}>{w.name}</div>
                  {cat ? <div style={{ marginTop: 2 }}><Bi en={cat.en} zh={cat.zh} color="var(--color-faint)" /></div> : null}
                </div>
                <button type="button" onClick={() => removeWorld(w.id)} aria-label={`Remove ${w.name}`}
                  style={{
                    width: 24, height: 24, flex: 'none', display: 'grid', placeItems: 'center', cursor: 'pointer',
                    background: 'transparent', border: '2px solid var(--color-line)', borderRadius: 0,
                    color: 'var(--color-faint)', fontFamily: 'var(--font-display)', fontWeight: 700,
                    fontSize: 'var(--text-small)', lineHeight: 1,
                  }}>X</button>
              </div>
            );
          })}
          {worlds.length === 0 && !showAddWorld ? (
            <div style={{ fontSize: 'var(--text-body)', color: 'var(--color-faint)' }}>
              {lang === 'zh' ? '还没有隐藏世界。' : 'No hidden worlds yet.'}
            </div>
          ) : null}
        </div>

        {showAddWorld && (
          <Panel pad={12} className="mt-3" innerRule={false}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 12 }}>
              <Field label={ui('profile.world_name')} cn="名称">
                <input className="rof-input" type="text" value={newWorldName} onChange={(e) => setNewWorldName(e.target.value)} placeholder={ui('profile.world_placeholder')} />
              </Field>
              <Field label={ui('profile.category')} cn="类别">
                <select className="rof-input" value={newWorldCat} onChange={(e) => setNewWorldCat(e.target.value as CategoryId)}>
                  {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{lang === 'zh' ? c.zh : c.en}</option>)}
                </select>
              </Field>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button tone="primary" size="sm" onClick={addWorld}>{ui('profile.add')}</Button>
                <Button tone="secondary" size="sm" onClick={() => setShowAddWorld(false)}>{ui('profile.cancel')}</Button>
              </div>
            </div>
          </Panel>
        )}
      </section>

      {/* ask me about */}
      <section>
        <SectionHeader icon="handshake" cn="可以问我" className="mb-3">{ui('profile.ask_me')}</SectionHeader>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 9 }}>
          {askTopics.map((topic, i) => (
            <Tag key={i} text={topic.text} tone="gold" onRemove={() => setAskTopics(askTopics.filter((_, j) => j !== i))} />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="rof-input" style={{ flex: 1 }} type="text" value={newAsk}
            onChange={(e) => setNewAsk(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTopic(askTopics, setAskTopics, newAsk, () => setNewAsk('')); } }}
            placeholder={ui('profile.add_topic')} />
          <Button tone="secondary" onClick={() => addTopic(askTopics, setAskTopics, newAsk, () => setNewAsk(''))}>+</Button>
        </div>
      </section>

      {/* i want to */}
      <section>
        <SectionHeader icon="nav-discover" cn="我想要" className="mb-3">{ui('profile.i_want')}</SectionHeader>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 9 }}>
          {wantTopics.map((topic, i) => (
            <Tag key={i} text={topic.text} tone="sage" onRemove={() => setWantTopics(wantTopics.filter((_, j) => j !== i))} />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="rof-input" style={{ flex: 1 }} type="text" value={newWant}
            onChange={(e) => setNewWant(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTopic(wantTopics, setWantTopics, newWant, () => setNewWant('')); } }}
            placeholder={ui('profile.add_topic')} />
          <Button tone="secondary" onClick={() => addTopic(wantTopics, setWantTopics, newWant, () => setNewWant(''))}>+</Button>
        </div>
      </section>

      {/* contact */}
      <section>
        <SectionHeader icon="globe" cn="联系方式" className="mb-3">{ui('profile.contact_pref')}</SectionHeader>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 12 }}>
          <Field label={ui('profile.method')} cn="方式">
            <select className="rof-input" value={contactKind} onChange={(e) => setContactKind(e.target.value as typeof contactKind)}>
              <option value="whatsapp">WhatsApp</option>
              <option value="wechat">WeChat</option>
              <option value="email">Email</option>
              <option value="class">{ui('profile.contact_class')}</option>
            </select>
          </Field>
          {/* "Find me in class" needs no handle, so the field would only invite
              a value that is never read. */}
          {contactKind === 'class' ? (
            <p style={{ margin: 0, fontSize: 'var(--text-small)', color: 'var(--color-muted)', lineHeight: 1.55 }}>
              {lang === 'zh'
                ? '保存后将清除已保存的联系方式，你的档案上不会再显示任何账号。'
                : 'Saving clears any stored handle — your dossier will show no address.'}
            </p>
          ) : (
            <Field label={ui('profile.contact_value')} cn="账号">
              <input className="rof-input" type="text" value={contactValue} onChange={(e) => setContactValue(e.target.value)} />
            </Field>
          )}
        </div>
      </section>

      <Divider />

      {profile.is_curator && (
        <Panel pad={13} tone="navy" innerRule={false}>
          <div className="flex items-center" style={{ gap: 11 }}>
            <Sprite name="nav-constitution" size={24} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <Bi en={ui('profile.curator_desk')} zh="策展人事务台" color="var(--color-gold)" />
              <div style={{ fontSize: 'var(--text-small)', color: 'var(--color-parchment)', marginTop: 4 }}>
                {lang === 'zh' ? '邀请、审核、推荐匹配' : 'Invites, moderation, suggested matches'}
              </div>
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <Button tone="gold" size="lg" block cn="打开事务台" onClick={() => router.push('/admin')}>
              Open the Desk
            </Button>
          </div>
        </Panel>
      )}

      <Button tone="tertiary" size="lg" block cn="退出登录" onClick={signOut}>{ui('auth.sign_out')}</Button>

      {/* The save bar sticks to the bottom of the scrolling <main>, not the
          viewport: the tab bar is a flex sibling of that region, so a fixed
          bar would sit on top of it — and inside the desktop phone frame it
          would escape the frame entirely. */}
      <div style={{
        position: 'sticky', bottom: 0, zIndex: 40, marginTop: 4,
        padding: '10px 0 0', background: 'var(--color-cream)',
        borderTop: '3px solid var(--color-line)',
      }}>
        {error ? <div style={{ marginBottom: 9 }}><ErrorNote>{error}</ErrorNote></div> : null}
        <Button tone="dark" size="lg" block onClick={handleSave} loading={saving} disabled={saving}>
          {saving ? ui('profile.saving') : saved ? ui('profile.saved') : ui('profile.save')}
        </Button>
      </div>
    </Page>
  );
}
