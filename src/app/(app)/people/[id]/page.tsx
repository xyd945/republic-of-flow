'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Avatar, Polaroid, Icon, Chip, WaxSeal, Badge, Button, LoadError } from '@/components/ui';
import { CATEGORY_COLORS } from '@/lib/seed';
import { CATEGORIES } from '@/lib/i18n/translations';
import { useI18n } from '@/lib/i18n/context';
import { usePeople } from '@/lib/data/views';

/**
 * Copy that also works on iOS.
 *
 * navigator.clipboard is exposed only in secure contexts, so it is missing on
 * an iPhone pointed at a plain-http LAN dev server — and Safari can reject it
 * even over https if the write drifts out of the user gesture. The deprecated
 * selection trick still works in both cases, so it backs the modern API up.
 */
async function copyText(text: string): Promise<boolean> {
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to the legacy path
    }
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    // readonly keeps the iOS keyboard from flashing up; contentEditable is what
    // actually lets Safari select the contents. Both are needed there.
    ta.setAttribute('readonly', '');
    ta.contentEditable = 'true';
    // Off-screen but not display:none — iOS won't select an unrendered node.
    ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;';
    document.body.appendChild(ta);

    const range = document.createRange();
    range.selectNodeContents(ta);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    ta.setSelectionRange(0, text.length);

    const ok = document.execCommand('copy');
    sel?.removeAllRanges();
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

const CONTACT_META: Record<string, { icon: string; label: string }> = {
  whatsapp: { icon: 'link', label: 'WhatsApp' },
  wechat: { icon: 'link', label: 'WeChat' },
  email: { icon: 'link', label: 'Email' },
  class: { icon: 'users', label: 'In-class' },
};

export default function DossierPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { t, ui, lang } = useI18n();

  const { people: profiles, loading, error } = usePeople();
  // Declared before the early returns below — hooks can't live after a branch.
  const [notice, setNotice] = useState('');

  // Must come before the not-found branch, or the dossier flashes
  // "Profile not found" on every load.
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-bronze border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) return <LoadError message={error} onRetry={() => window.location.reload()} />;

  const profile = profiles.find((p) => p.id === id);
  if (!profile) {
    return (
      <div className="p-[18px] text-center pt-20">
        <div className="font-serif text-base text-muted">{ui('dossier.not_found')}</div>
        <button
          type="button"
          onClick={() => router.back()}
          className="mt-4 font-serif text-xs text-bronze underline cursor-pointer bg-transparent border-none"
        >
          {ui('dossier.go_back')}
        </button>
      </div>
    );
  }

  const contact = CONTACT_META[profile.contact_kind] ?? { icon: 'link', label: profile.contact_kind };

  /* "Match, then disappear" — hand off to the channel they actually use rather
     than building yet another inbox. */
  const connect = async () => {
    const value = profile.contact_value?.trim();
    if (profile.contact_kind !== 'class' && !value) {
      setNotice(ui('dossier.no_contact'));
      return;
    }
    switch (profile.contact_kind) {
      case 'email':
        window.location.href = `mailto:${value}`;
        break;
      case 'whatsapp':
        window.open(`https://wa.me/${value.replace(/[^\d]/g, '')}`, '_blank', 'noopener');
        break;
      case 'wechat':
        /* Tencent discontinued weixin://dl/chat?username= and publishes no
           scheme for "open chat with X" or "add friend X" — only Mini Program
           tickets. Best available: put the id on the clipboard, then launch
           WeChat so they can paste it straight into search. Copy first, so a
           blocked or unhandled scheme still leaves them something usable. */
        setNotice(
          (await copyText(value))
            ? ui('dossier.copied')
            : `${ui('dossier.copy_failed')} ${value}`,
        );
        window.location.href = 'weixin://';
        break;
      default:
        setNotice(ui('dossier.class_only'));
    }
  };

  return (
    <div className="pb-[90px]">
      {/* Back header */}
      <div className="flex items-center gap-3 px-[18px] pt-[16px] pb-[10px]">
        <button type="button" onClick={() => router.back()} className="w-8 h-8 grid place-items-center rounded-full bg-transparent border border-line cursor-pointer">
          <Icon name="chevron-right" size={16} color="var(--color-ink)" style={{ transform: 'rotate(180deg)' }} />
        </button>
        <span className="font-display font-bold text-eyebrow tracking-[0.14em] uppercase text-bronze">{ui('dossier.title')}</span>
      </div>

      {/* Hero card */}
      <div className="px-[18px]">
        <div className="sheet stack p-0 overflow-hidden">
          <div className="relative px-[22px] pt-[28px] pb-[18px] flex flex-col items-center text-center">
            {/* Tape decorations */}
            <div className="tape" style={{ top: -4, right: 20, transform: 'rotate(6deg)' }} />
            <div className="tape" style={{ top: 12, left: -10, transform: 'rotate(-14deg)', width: 56, height: 22 }} />

            <Polaroid initials={profile.initials} id={profile.id} size={88} rotate={-2.5} clip className="mb-4" />

            <WaxSeal size={32} label={profile.initials[0] ?? profile.full_name[0] ?? '?'} className="absolute top-[18px] right-[22px]" />

            <h1 className="font-serif font-semibold text-xl text-ink leading-[1.25]">{profile.full_name}</h1>
            {profile.native_name && (
              <div className="font-cjk text-sm text-muted mt-[2px]">{profile.native_name}</div>
            )}
            <div className="font-serif text-sm text-muted mt-1">{t(profile.headline)}</div>
            <div className="flex items-center gap-2 mt-[6px]">
              <Badge>{profile.class_name}</Badge>
              {profile.is_featured && <Badge tone="green">{ui('dossier.featured')}</Badge>}
            </div>
          </div>
        </div>
      </div>

      {/* Professional context */}
      <div className="px-[18px] mt-5">
        <SectionLabel>{ui('dossier.about')}</SectionLabel>
        <div className="font-serif text-sm text-ink-2 leading-[1.65] mb-2">{t(profile.role)}</div>
        <div className="font-serif text-sm text-muted leading-[1.65]">{t(profile.intro)}</div>
        {t(profile.professional) && (
          <div className="font-serif text-xs text-faint leading-[1.55] mt-2 italic">{t(profile.professional)}</div>
        )}
      </div>

      {/* Hidden Worlds */}
      {profile.hidden_worlds.length > 0 && (
        <div className="px-[18px] mt-5">
          <SectionLabel>{ui('dossier.hidden_worlds')}</SectionLabel>
          <div className="flex flex-col gap-[8px]">
            {profile.hidden_worlds.map((hw) => {
              const cat = CATEGORIES.find((c) => c.id === hw.category);
              const color = CATEGORY_COLORS[hw.category] ?? '#8f7044';
              return (
                <div key={hw.id} className="flex items-center gap-3 p-[10px] rounded-xs" style={{ background: 'rgba(239,228,209,0.5)' }}>
                  <div className="w-8 h-8 rounded-full grid place-items-center shrink-0" style={{ background: color, opacity: 0.85 }}>
                    <Icon name="star" size={14} color="#fdf0e6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-serif font-semibold text-sm text-ink">{t(hw.name)}</div>
                    <div className="font-serif text-eyebrow text-faint">{(lang === 'zh' ? cat?.zh : cat?.en) ?? hw.category}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Ask & Want */}
      {(profile.ask_topics.length > 0 || profile.want_topics.length > 0) && (
        <div className="px-[18px] mt-5">
          {profile.ask_topics.length > 0 && (
            <>
              <SectionLabel>{ui('dossier.ask_me')}</SectionLabel>
              <div className="flex flex-wrap gap-[6px] mb-3">
                {profile.ask_topics.map((topic, i) => (
                  <Chip key={i} variant="wash" tone="neutral">{t(topic)}</Chip>
                ))}
              </div>
            </>
          )}
          {profile.want_topics.length > 0 && (
            <>
              <SectionLabel>{ui('dossier.i_want')}</SectionLabel>
              <div className="flex flex-wrap gap-[6px]">
                {profile.want_topics.map((topic, i) => (
                  <Chip key={i} variant="wash" tone="green">{t(topic)}</Chip>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Languages */}
      {profile.languages.length > 0 && (
        <div className="px-[18px] mt-5">
          <SectionLabel>{ui('dossier.languages')}</SectionLabel>
          <div className="flex flex-wrap gap-[6px]">
            {profile.languages.map((lang) => (
              <Chip key={lang}>{lang}</Chip>
            ))}
          </div>
        </div>
      )}

      {/* Contact */}
      <div className="px-[18px] mt-5">
        <SectionLabel>{ui('dossier.preferred_contact')}</SectionLabel>
        <div className="flex items-center gap-3 p-[10px] rounded-xs border border-line">
          <Icon name={contact.icon} size={16} color="var(--color-bronze)" />
          <div>
            <div className="font-serif font-semibold text-xs text-ink">{contact.label}</div>
            <div className="font-serif text-xs text-muted">{profile.contact_value}</div>
          </div>
        </div>
      </div>

      {/* Sticky action bar */}
      <div className="fixed bottom-[72px] left-1/2 -translate-x-1/2 w-full max-w-[430px] px-[18px] pb-3 pt-2 bg-white/90 backdrop-blur-md border-t border-line z-40">
        {notice && (
          <div className="mb-2 text-center font-serif text-xs text-muted">{notice}</div>
        )}
        <Button tone="bronze" onClick={connect} icon={<Icon name="link" size={15} color="var(--color-dark)" />}>
          {ui('dossier.connect_with')} {profile.full_name.split(' ')[0]}
        </Button>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-display font-bold text-eyebrow tracking-[0.13em] uppercase text-bronze mb-[8px]">
      {children}
    </div>
  );
}
