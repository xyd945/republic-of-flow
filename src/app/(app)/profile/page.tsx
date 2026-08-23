'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Avatar, Icon, Chip, Button, Badge } from '@/components/ui';
import { CATEGORY_COLORS } from '@/lib/seed';
import { CATEGORIES, LANGUAGES } from '@/lib/i18n/translations';
import { LanguageSwitcher } from '@/components/ui/language-switcher';
import { useI18n } from '@/lib/i18n/context';
import { useProfile, useSignOut } from '@/lib/supabase/hooks';
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
 * in this language" — borrowing the Chinese text here would save it straight
 * into the English field on the next save.
 */
function tVal(obj: Translatable | string | null | undefined, lang: Language): string {
  if (!obj) return '';
  if (typeof obj === 'string') return obj;
  return obj[lang] ?? obj.en ?? '';
}

function mergeLang(existing: Translatable | null | undefined, lang: Language, value: string): Translatable {
  return { ...(existing && typeof existing === 'object' ? existing : {}), [lang]: value };
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
  const { profile, loading, refetch } = useProfile();
  const signOut = useSignOut();

  const [name, setName] = useState('');
  const [nativeName, setNativeName] = useState('');
  const [className, setClassName] = useState<string>(DEFAULT_CLASS);
  const [headline, setHeadline] = useState('');
  const [role, setRole] = useState('');
  const [intro, setIntro] = useState('');
  const [professional, setProfessional] = useState('');
  const [contactKind, setContactKind] = useState<'whatsapp' | 'wechat' | 'email' | 'class'>('class');
  const [contactValue, setContactValue] = useState('');
  const [worlds, setWorlds] = useState<{ id: string; name: string; category: CategoryId; visible: boolean; isNew?: boolean }[]>([]);
  const [askTopics, setAskTopics] = useState<string[]>([]);
  const [wantTopics, setWantTopics] = useState<string[]>([]);
  const [newAsk, setNewAsk] = useState('');
  const [newWant, setNewWant] = useState('');
  const [showAddWorld, setShowAddWorld] = useState(false);
  const [newWorldName, setNewWorldName] = useState('');
  const [newWorldCat, setNewWorldCat] = useState<CategoryId>('craft');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deletedWorldIds, setDeletedWorldIds] = useState<string[]>([]);

  useEffect(() => {
    if (!profile) return;
    setName(profile.full_name);
    setNativeName(profile.native_name ?? '');
    setClassName(profile.class_name || DEFAULT_CLASS);
    setHeadline(tVal(profile.headline, lang));
    setRole(tVal(profile.role, lang));
    setIntro(tVal(profile.intro, lang));
    setProfessional(tVal(profile.professional, lang));
    setContactKind(profile.contact_kind);
    setContactValue(profile.contact_value);
    setWorlds(profile.hidden_worlds.map((hw) => ({
      id: hw.id,
      name: tVal(hw.name, lang),
      category: hw.category as CategoryId,
      visible: hw.visibility === 'members',
    })));
    setAskTopics((profile.ask_topics ?? []).map((a) => tVal(a, lang)));
    setWantTopics((profile.want_topics ?? []).map((w) => tVal(w, lang)));
    setDeletedWorldIds([]);
  }, [profile, lang]);

  const addWorld = () => {
    if (!newWorldName.trim()) return;
    setWorlds([...worlds, { id: `new-${Date.now()}`, name: newWorldName.trim(), category: newWorldCat, visible: true, isNew: true }]);
    setNewWorldName('');
    setShowAddWorld(false);
  };

  const removeWorld = (id: string) => {
    const w = worlds.find(x => x.id === id);
    if (w && !w.isNew) {
      setDeletedWorldIds(prev => [...prev, id]);
    }
    setWorlds(worlds.filter(x => x.id !== id));
  };

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    const supabase = createClient();

    const { error: profileErr } = await supabase
      .from('profiles')
      .update({
        full_name: name,
        native_name: nativeName || null,
        class_name: className,
        initials: initialsOf(name),
        headline: mergeLang(profile.headline as Translatable, lang, headline),
        role: mergeLang(profile.role as Translatable, lang, role),
        intro: mergeLang(profile.intro as Translatable, lang, intro),
        professional: mergeLang(profile.professional as Translatable, lang, professional),
        contact_kind: contactKind,
        contact_value: contactValue,
        ask_topics: askTopics.map((t) => mergeLang(null, lang, t)),
        want_topics: wantTopics.map((t) => mergeLang(null, lang, t)),
      })
      .eq('id', profile.id);

    if (profileErr) {
      console.error('Save profile error:', profileErr);
      setSaving(false);
      return;
    }

    if (deletedWorldIds.length > 0) {
      await supabase
        .from('profile_hidden_worlds')
        .delete()
        .in('id', deletedWorldIds);
    }

    const newWorlds = worlds.filter(w => w.isNew);
    if (newWorlds.length > 0) {
      await supabase
        .from('profile_hidden_worlds')
        .insert(newWorlds.map((w, i) => ({
          profile_id: profile.id,
          name: { [lang]: w.name },
          category: w.category,
          visibility: w.visible ? 'members' : 'private',
          sort_order: (profile.hidden_worlds.length ?? 0) + i,
        })));
    }

    // Reload so newly inserted worlds get their real ids — otherwise a second
    // Save would re-insert them as duplicates.
    refetch();

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

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
        <input type="text" value={headline} onChange={(e) => setHeadline(e.target.value)} className="parch-input" />
      </Field>
      <Field label={ui('profile.role')}>
        <input type="text" value={role} onChange={(e) => setRole(e.target.value)} className="parch-input" />
      </Field>

      {/* Introduction */}
      <SectionLabel>{ui('profile.introduction')}</SectionLabel>
      <Field label={ui('profile.personal_intro')}>
        <textarea value={intro} onChange={(e) => setIntro(e.target.value)} rows={3} className="parch-input" />
      </Field>
      <Field label={ui('profile.professional')}>
        <textarea value={professional} onChange={(e) => setProfessional(e.target.value)} rows={2} className="parch-input" />
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
              <Chip variant="wash" tone="neutral">{topic}</Chip>
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
            onKeyDown={(e) => { if (e.key === 'Enter' && newAsk.trim()) { setAskTopics([...askTopics, newAsk.trim()]); setNewAsk(''); } }}
            placeholder={ui('profile.add_topic')}
            className="parch-input flex-1"
          />
          <button
            type="button"
            onClick={() => { if (newAsk.trim()) { setAskTopics([...askTopics, newAsk.trim()]); setNewAsk(''); } }}
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
              <Chip variant="wash" tone="green">{topic}</Chip>
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
            onKeyDown={(e) => { if (e.key === 'Enter' && newWant.trim()) { setWantTopics([...wantTopics, newWant.trim()]); setNewWant(''); } }}
            placeholder={ui('profile.add_topic')}
            className="parch-input flex-1"
          />
          <button
            type="button"
            onClick={() => { if (newWant.trim()) { setWantTopics([...wantTopics, newWant.trim()]); setNewWant(''); } }}
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
        <Button tone="ink" onClick={handleSave} disabled={saving} icon={<Icon name="check" size={15} color="#fff" />}>
          {saving ? ui('profile.saving') : saved ? ui('profile.saved') : ui('profile.save')}
        </Button>
      </div>
    </div>
  );
}
