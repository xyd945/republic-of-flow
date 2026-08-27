'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n/context';
import { CATEGORIES } from '@/lib/i18n/translations';
import { usePeople } from '@/lib/data/views';
import { LoadError } from '@/components/ui';
import { Page } from '@/components/pixel/shell';
import {
  Avatar, Bi, Button, Divider, EmptyState, MetaRow, Panel, PixelSpinner, SectionHeader, StatRow, StatusChip,
} from '@/components/pixel';

const CONTACT_LABELS: Record<string, { en: string; zh: string }> = {
  whatsapp: { en: 'WhatsApp', zh: 'WhatsApp' },
  wechat: { en: 'WeChat', zh: '微信' },
  email: { en: 'Email', zh: '邮箱' },
  class: { en: 'Find me in class', zh: '课上找我' },
};

/** Clipboard needs a secure context; iOS Safari over http has none. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through */ }
  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.contentEditable = 'true';
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    el.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

export default function DossierPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { t, ui, lang } = useI18n();
  const { people: profiles, loading, error } = usePeople();
  const [notice, setNotice] = useState('');

  if (loading) {
    return <div className="grid place-items-center" style={{ minHeight: '50vh' }}><PixelSpinner size={20} color="var(--color-gold)" /></div>;
  }
  if (error) return <LoadError message={error} onRetry={() => window.location.reload()} />;

  const profile = profiles.find((p) => p.id === id);
  if (!profile) {
    return <Page><EmptyState title="No such member" cn="找不到这位成员" /></Page>;
  }

  const contact = CONTACT_LABELS[profile.contact_kind] ?? { en: profile.contact_kind, zh: '' };
  const worlds = profile.hidden_worlds.filter((w) => w.visibility === 'members');

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
        window.open(`https://wa.me/${value!.replace(/[^\d]/g, '')}`, '_blank', 'noopener');
        break;
      case 'wechat':
        /* Tencent discontinued weixin://dl/chat?username= and publishes no
           scheme for "open chat with X" or "add friend X" — only Mini Program
           tickets. Best available: put the id on the clipboard, then launch
           WeChat so they can paste it straight into search. Copy first, so a
           blocked or unhandled scheme still leaves them something usable. */
        setNotice((await copyText(value!)) ? ui('dossier.copied') : `${ui('dossier.copy_failed')} ${value}`);
        window.location.href = 'weixin://';
        break;
      default:
        setNotice(ui('dossier.class_only'));
    }
  };

  const Section = ({ title, cn, icon, children }: { title: string; cn: string; icon?: string; children: React.ReactNode }) => (
    <section>
      <SectionHeader icon={icon} cn={cn} className="mb-3">{title}</SectionHeader>
      {children}
    </section>
  );

  return (
    <Page>
      {/* the record head — the design sets the avatar to the left with the
          name beside it, not centred, and files the role as a gold chip. */}
      <Panel pad={14} corners>
        <div style={{ display: 'flex', gap: 13, alignItems: 'flex-start' }}>
          <Avatar initials={profile.initials} id={profile.id} size={72} featured={profile.is_featured} />
          <div style={{ minWidth: 0, flex: 1 }}>
            {/* Invited but not yet arrived: no number to show. */}
            {profile.founder_no !== null ? (
              <Bi en={`No. ${String(profile.founder_no).padStart(2, '0')}`} color="var(--color-gold)" />
            ) : null}
            <div style={{
              fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-h2)',
              letterSpacing: 'var(--tracking-display)', textTransform: 'uppercase',
              color: 'var(--color-ink)', lineHeight: 1.25, marginTop: 5,
            }}>{profile.full_name}</div>
            {profile.native_name ? (
              <div className="rof-cjk" style={{ fontSize: 'var(--text-h3)', color: 'var(--color-ink-2)', marginTop: 3 }}>
                {profile.native_name}
              </div>
            ) : null}
            {/* A real role can be long ("Partner, Green Horizon Ventures"), and
                Bi is nowrap by default — unwrapped it pushed the chip straight
                through the side of the panel and the frame clipped it. */}
            {t(profile.role) ? (
              <span style={{
                display: 'inline-flex', alignItems: 'center', marginTop: 8, padding: '4px 8px',
                maxWidth: '100%', background: 'var(--color-gold-tint)',
                border: '2px solid var(--color-gold)',
              }}>
                <Bi en={t(profile.role)} color="var(--color-navy-900)" wrap />
              </span>
            ) : null}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 6, marginTop: 12 }}>
          <MetaRow icon="globe">Republic of Flow</MetaRow>
          <MetaRow icon="nav-journal">{profile.class_name}</MetaRow>
        </div>

        {t(profile.intro) ? (
          <div style={{
            marginTop: 12, padding: '10px 12px', background: 'var(--color-white)',
            border: '2px dashed var(--color-line-soft)',
          }}>
            <div style={{ fontSize: 'var(--text-body)', lineHeight: 1.6, color: 'var(--color-ink)' }}>
              {t(profile.intro)}
            </div>
          </div>
        ) : null}
      </Panel>

      <StatRow stats={[
        { icon: 'stat-worlds', value: worlds.length, label: 'Worlds', cn: '隐藏世界' },
        { icon: 'handshake', value: profile.ask_topics.length, label: 'Can Open', cn: '可以打开' },
        { icon: 'globe', value: profile.languages.length, label: 'Languages', cn: '语言' },
      ]} />

      {/* about */}
      {t(profile.professional) ? (
        <Section title="Background" cn="职业背景" icon="chart">
          <Panel pad={13} innerRule={false}>
            <p style={{ margin: 0, fontSize: 'var(--text-body)', color: 'var(--color-muted)', lineHeight: 1.6 }}>
              {t(profile.professional)}
            </p>
          </Panel>
        </Section>
      ) : null}

      {/* hidden worlds — the point of the whole app */}
      <Section title="Hidden Worlds" cn="隐藏世界" icon="star">
        {worlds.length ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 9 }}>
            {worlds.map((w) => {
              const cat = CATEGORIES.find((c) => c.id === w.category);
              return (
                <Panel key={w.id} pad={11} innerRule={false} accent={`var(--color-cat-${w.category})`}>
                  <div className="flex items-center" style={{ gap: 10 }}>
                    <span aria-hidden style={{
                      width: 26, height: 26, flex: 'none', display: 'block',
                      background: `var(--color-cat-${w.category})`, border: '2px solid var(--color-navy-900)',
                    }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 'var(--text-h3)', color: 'var(--color-ink)' }}>{t(w.name)}</div>
                      {cat ? <div style={{ marginTop: 3 }}><Bi en={cat.en} zh={cat.zh} color="var(--color-faint)" /></div> : null}
                    </div>
                  </div>
                </Panel>
              );
            })}
          </div>
        ) : <EmptyState title="Nothing revealed yet" cn="还没有公开的隐藏世界" />}
      </Section>

      {/* topics */}
      {profile.ask_topics.length > 0 && (
        <Section title="I Can Open" cn="我可以打开" icon="handshake">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {profile.ask_topics.map((a, i) => (
              <span key={i} className="rof-label" style={{
                padding: '5px 8px', background: 'var(--color-gold-tint)',
                border: '2px solid var(--color-gold)', color: '#6B5223', textTransform: 'none',
              }}>{t(a)}</span>
            ))}
          </div>
        </Section>
      )}

      {profile.want_topics.length > 0 && (
        <Section title="I Want to Discover" cn="我想探索" icon="nav-discover">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {profile.want_topics.map((w, i) => (
              <span key={i} className="rof-label" style={{
                padding: '5px 8px', background: 'var(--color-sage-tint)',
                border: '2px solid var(--color-sage)', color: '#3F5742', textTransform: 'none',
              }}>{t(w)}</span>
            ))}
          </div>
        </Section>
      )}

      {profile.languages.length > 0 && (
        <Section title="Languages" cn="语言" icon="stat-badges">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {profile.languages.map((l) => <StatusChip key={l} tone="neutral">{l}</StatusChip>)}
          </div>
        </Section>
      )}

      {/* contact — the Republic gets out of the way here */}
      <Section title="Connect" cn="联系方式" icon="handshake">
        <Panel pad={13} tone="gold">
          <Bi en={contact.en} zh={contact.zh} color="var(--color-navy-900)" />
          {profile.contact_value ? (
            <div style={{ fontSize: 'var(--text-h3)', color: 'var(--color-ink)', marginTop: 5, wordBreak: 'break-all' }}>{profile.contact_value}</div>
          ) : null}
          <div style={{ marginTop: 12 }}>
            <Button tone="dark" size="lg" block onClick={connect}>
              {ui('dossier.connect_with')} {profile.full_name.split(' ')[0]}
            </Button>
          </div>
          {notice ? (
            <div style={{ marginTop: 9, fontSize: 'var(--text-body)', color: 'var(--color-ink-2)' }}>{notice}</div>
          ) : null}
        </Panel>
      </Section>

      <div className="text-center">
        <Bi en="Match, then disappear" zh="配对之后，系统就退场" color="var(--color-faint)" />
      </div>
    </Page>
  );
}
