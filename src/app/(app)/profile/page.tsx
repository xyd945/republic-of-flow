'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Avatar, Icon, Chip, Button, Badge, LoadError } from '@/components/ui';
import { CATEGORY_COLORS } from '@/lib/seed';
import { CATEGORIES, LANGUAGES, t } from '@/lib/i18n/translations';
import { LanguageSwitcher } from '@/components/ui/language-switcher';
import { useI18n } from '@/lib/i18n/context';
import { useSignOut } from '@/lib/supabase/hooks';
import { useViewerProfile } from '@/lib/data/views';
import { useSaveProfile } from '@/lib/data/mutations';
import { createClient } from '@/lib/supabase/client';
import { CLASSES, DEFAULT_CLASS } from '@/lib/classes';
import type { Language, CategoryId, Translatable } from '@/types';

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-display font-bold text-eyebrow tracking-[0.13em] uppercase text-bronze mb-[8px]">
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block mb-3">
      <span className="font-display font-bold text-eyebrow tracking-[0.13em] uppercase text-bronze mb-[7px] block">{label}</span>
      {children}
    </label>
  );
}

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
function initialsOf(fullName: string): string {
  const words = fullName.split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
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
      p_contact_value: contactValue,
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
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-8 h-8 mx-auto mb-3 border-2 border-bronze border-t-transparent rounded-full animate-spin" />
          <p className="font-serif text-sm text-muted">{ui('profile.loading')}</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] px-6">
        <div className="text-center">
          <p className="font-serif text-base text-ink mb-2">{ui('profile.not_found')}</p>
          <p className="font-serif text-sm text-muted mb-4">{ui('profile.not_created')}</p>
          <Button tone="ink" onClick={signOut}>{ui('auth.sign_out')}</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-[18px] pt-[22px] pb-[100px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="font-display font-bold text-eyebrow tracking-[0.14em] uppercase text-bronze">{ui('profile.title')}</h1>
        <LanguageSwitcher languages={LANGUAGES} value={lang} onChange={setLang} />
      </div>

      {/* Identity block */}
      <div className="flex items-center gap-4 mb-5">
        <Avatar initials={profile.initials || initialsOf(name)} id={profile.id} size={56} />
        <div>
          <div className="font-serif font-semibold text-lg text-ink">{name}</div>
          <Badge>{className}</Badge>
        </div>
      </div>

      {/* Basic info */}
      <SectionLabel>{ui('profile.identity')}</SectionLabel>
      <Field label={ui('profile.full_name')}>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="parch-input" />
      </Field>
      <Field label={ui('profile.native_name')}>
        <input type="text" value={nativeName} onChange={(e) => setNativeName(e.target.value)} placeholder={ui('profile.optional')} className="parch-input" />
      </Field>
      <Field label={ui('profile.class')}>
        <select value={className} onChange={(e) => setClassName(e.target.value)} className="parch-input">
          {CLASSES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </Field>
      <Field label={ui('profile.headline')}>
        <input type="text" value={fields.headline} onChange={(e) => setField('headline', e.target.value)} placeholder={otherLang(profile.headline, lang)} className="parch-input" />
      </Field>
      <Field label={ui('profile.role')}>
        <input type="text" value={fields.role} onChange={(e) => setField('role', e.target.value)} placeholder={otherLang(profile.role, lang)} className="parch-input" />
      </Field>

      {/* Introduction */}
      <SectionLabel>{ui('profile.introduction')}</SectionLabel>
      <Field label={ui('profile.personal_intro')}>
        <textarea value={fields.intro} onChange={(e) => setField('intro', e.target.value)} rows={3} placeholder={otherLang(profile.intro, lang)} className="parch-input" />
      </Field>
      <Field label={ui('profile.professional')}>
        <textarea value={fields.professional} onChange={(e) => setField('professional', e.target.value)} rows={2} placeholder={otherLang(profile.professional, lang)} className="parch-input" />
      </Field>

      {/* Hidden Worlds */}
      <div className="mt-2">
        <div className="flex items-center justify-between mb-[8px]">
          <SectionLabel>{ui('profile.hidden_worlds')}</SectionLabel>
          <button
            type="button"
            onClick={() => setShowAddWorld(true)}
            className="flex items-center gap-[4px] border-none bg-transparent cursor-pointer font-serif text-xs text-bronze"
          >
            <Icon name="plus" size={13} color="var(--color-bronze)" /> {ui('profile.add')}
          </button>
        </div>
        <div className="flex flex-col gap-[8px]">
          {worlds.map((w) => {
            const color = CATEGORY_COLORS[w.category] ?? '#8f7044';
            const cat = CATEGORIES.find((c) => c.id === w.category);
            return (
              <div key={w.id} className="flex items-center gap-3 p-[10px] rounded-xs border border-line">
                <div className="w-7 h-7 rounded-full grid place-items-center shrink-0" style={{ background: color, opacity: 0.85 }}>
                  <Icon name="star" size={12} color="#fdf0e6" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-serif text-sm text-ink truncate">{w.name}</div>
                  <div className="font-serif text-eyebrow text-faint">{cat?.en ?? w.category}</div>
                </div>
                <button
                  type="button"
                  onClick={() => removeWorld(w.id)}
                  className="w-6 h-6 grid place-items-center rounded-full bg-transparent border border-line cursor-pointer shrink-0"
                >
                  <Icon name="x" size={12} color="var(--color-faint)" />
                </button>
              </div>
            );
          })}
        </div>
        {showAddWorld && (
          <div className="mt-3 p-3 rounded-xs border border-line">
            <Field label={ui('profile.world_name')}>
              <input type="text" value={newWorldName} onChange={(e) => setNewWorldName(e.target.value)} placeholder={ui('profile.world_placeholder')} className="parch-input" />
            </Field>
            <Field label={ui('profile.category')}>
              <select value={newWorldCat} onChange={(e) => setNewWorldCat(e.target.value as CategoryId)} className="parch-input">
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>{lang === 'zh' ? c.zh : c.en}</option>
                ))}
              </select>
            </Field>
            <div className="flex gap-2">
              <Button tone="bronze" size="sm" onClick={addWorld}>{ui('profile.add')}</Button>
              <Button tone="ink" variant="outline" size="sm" onClick={() => setShowAddWorld(false)}>{ui('profile.cancel')}</Button>
            </div>
          </div>
        )}
      </div>

      {/* Ask topics */}
      <div className="mt-5">
        <SectionLabel>{ui('profile.ask_me')}</SectionLabel>
        <div className="flex flex-wrap gap-[6px] mb-2">
          {askTopics.map((topic, i) => (
            <span key={i} className="inline-flex items-center gap-1">
              <Chip variant="wash" tone="neutral">{topic.text}</Chip>
              <button
                type="button"
                onClick={() => setAskTopics(askTopics.filter((_, j) => j !== i))}
                className="border-none bg-transparent cursor-pointer p-0"
              >
                <Icon name="x" size={10} color="var(--color-faint)" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={newAsk}
            onChange={(e) => setNewAsk(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && newAsk.trim()) { setAskTopics([...askTopics, { original: null, text: newAsk.trim(), lang }]); setNewAsk(''); } }}
            placeholder={ui('profile.add_topic')}
            className="parch-input flex-1"
          />
          <button
            type="button"
            onClick={() => { if (newAsk.trim()) { setAskTopics([...askTopics, { original: null, text: newAsk.trim(), lang }]); setNewAsk(''); } }}
            className="w-9 h-9 grid place-items-center rounded-xs bg-transparent border border-line cursor-pointer shrink-0"
          >
            <Icon name="plus" size={14} color="var(--color-bronze)" />
          </button>
        </div>
      </div>

      {/* Want topics */}
      <div className="mt-5">
        <SectionLabel>{ui('profile.i_want')}</SectionLabel>
        <div className="flex flex-wrap gap-[6px] mb-2">
          {wantTopics.map((topic, i) => (
            <span key={i} className="inline-flex items-center gap-1">
              <Chip variant="wash" tone="green">{topic.text}</Chip>
              <button
                type="button"
                onClick={() => setWantTopics(wantTopics.filter((_, j) => j !== i))}
                className="border-none bg-transparent cursor-pointer p-0"
              >
                <Icon name="x" size={10} color="var(--color-faint)" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={newWant}
            onChange={(e) => setNewWant(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && newWant.trim()) { setWantTopics([...wantTopics, { original: null, text: newWant.trim(), lang }]); setNewWant(''); } }}
            placeholder={ui('profile.add_topic')}
            className="parch-input flex-1"
          />
          <button
            type="button"
            onClick={() => { if (newWant.trim()) { setWantTopics([...wantTopics, { original: null, text: newWant.trim(), lang }]); setNewWant(''); } }}
            className="w-9 h-9 grid place-items-center rounded-xs bg-transparent border border-line cursor-pointer shrink-0"
          >
            <Icon name="plus" size={14} color="var(--color-bronze)" />
          </button>
        </div>
      </div>

      {/* Contact */}
      <div className="mt-5">
        <SectionLabel>{ui('profile.contact_pref')}</SectionLabel>
        <Field label={ui('profile.method')}>
          <select value={contactKind} onChange={(e) => setContactKind(e.target.value as typeof contactKind)} className="parch-input">
            <option value="whatsapp">WhatsApp</option>
            <option value="wechat">WeChat</option>
            <option value="email">Email</option>
            <option value="class">{ui('profile.contact_class')}</option>
          </select>
        </Field>
        <Field label={ui('profile.contact_value')}>
          <input type="text" value={contactValue} onChange={(e) => setContactValue(e.target.value)} className="parch-input" />
        </Field>
      </div>

      {/* Admin link */}
      {profile.is_curator && (
        <div className="mt-5 border-t border-line pt-4">
          <button
            type="button"
            onClick={() => router.push('/admin')}
            className="flex items-center gap-2 w-full bg-transparent border border-line rounded-xs p-3 cursor-pointer text-left"
          >
            <Icon name="shield" size={16} color="var(--color-bronze)" />
            <span className="font-display font-bold text-eyebrow tracking-[0.12em] uppercase text-bronze">{ui('profile.curator_desk')}</span>
            <Icon name="chevron-right" size={14} color="var(--color-faint)" className="ml-auto" />
          </button>
        </div>
      )}

      {/* Sign out */}
      <div className="mt-5 border-t border-line pt-4">
        <button
          type="button"
          onClick={signOut}
          className="font-serif text-xs text-red underline cursor-pointer bg-transparent border-none"
        >
          {ui('auth.sign_out')}
        </button>
      </div>

      {/* Sticky save */}
      <div className="fixed bottom-[72px] left-1/2 -translate-x-1/2 w-full max-w-[430px] px-[18px] pb-3 pt-2 bg-white/90 backdrop-blur-md border-t border-line z-40">
        {error && (
          <div className="mb-2 flex items-center gap-[7px] font-serif text-xs text-red">
            <Icon name="x" size={14} color="var(--color-red)" />{error}
          </div>
        )}
        <Button tone="ink" onClick={handleSave} loading={saving} icon={<Icon name="check" size={15} color="#fff" />}>
          {saving ? ui('profile.saving') : saved ? ui('profile.saved') : ui('profile.save')}
        </Button>
      </div>
    </div>
  );
}
