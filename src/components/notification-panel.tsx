'use client';

import { useRouter } from 'next/navigation';
import { Bi, ErrorNote, PixelSpinner } from '@/components/pixel';
import { useOverlay } from '@/components/pixel/overlay';
import { useI18n } from '@/lib/i18n/context';
import { t } from '@/lib/i18n/translations';
import type { AppNotification, Language } from '@/types';

/**
 * Relative time, coarse on purpose. An inbox this small does not need a date
 * library, and "3d ago" is more use here than a timestamp.
 */
function ago(iso: string, ui: (k: string) => string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return ui('notif.just_now');
  if (mins < 60) return ui('notif.minutes_ago').replace('{n}', String(mins));
  const hours = Math.floor(mins / 60);
  if (hours < 24) return ui('notif.hours_ago').replace('{n}', String(hours));
  return ui('notif.days_ago').replace('{n}', String(Math.floor(hours / 24)));
}

/**
 * Rendered entirely from the payload snapshot, never from a join. The listing
 * it refers to may since have been deleted, and the row should still read
 * correctly rather than collapsing to "undefined".
 */
function line(n: AppNotification, lang: Language, ui: (k: string) => string): string {
  const name = n.payload.actor_name?.trim() || ui('notif.someone');
  const listing = t(n.payload.listing_title, lang).trim() || ui('notif.a_listing');
  return ui(`notif.${n.kind}`).replace('{name}', name).replace('{listing}', listing);
}

/**
 * The bitmap system has no icon font, and a 22px glyph carries further than a
 * hairline SVG at this size anyway. Colour does the categorising; the glyph
 * only has to be distinguishable at a glance.
 */
function markFor(kind: AppNotification['kind']): { glyph: string; bg: string; bd: string; fg: string } {
  switch (kind) {
    case 'interest_accepted':
    case 'match_met':
      return { glyph: 'Y', bg: 'var(--color-sage-tint)', bd: 'var(--color-sage)', fg: '#3F5742' };
    case 'interest_declined':
      return { glyph: 'N', bg: 'var(--color-slate-tint)', bd: 'var(--color-slate)', fg: 'var(--color-slate)' };
    case 'match_undone':
      return { glyph: '!', bg: 'var(--color-red-tint)', bd: 'var(--color-red)', fg: '#6E2A20' };
    case 'suggestion_made':
      return { glyph: '*', bg: 'var(--color-gold-tint)', bd: 'var(--color-gold)', fg: '#6B5223' };
    default:
      return { glyph: '!', bg: 'var(--color-gold-tint)', bd: 'var(--color-gold)', fg: '#6B5223' };
  }
}

export function NotificationPanel({
  items, loading, error, onClose,
}: {
  items: AppNotification[];
  loading: boolean;
  error: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const { lang, ui } = useI18n();

  // Escape closes and the page behind is locked — both through the shared
  // registry, so a second open layer cannot corrupt the restore.
  useOverlay(onClose);

  // Every kind of notification is about something in the Market, so they all
  // land there. The Market's tabs are component state rather than URL state,
  // so there is no deeper link to make yet without reworking that page.
  const goTo = () => {
    onClose();
    router.push('/market');
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={ui('notif.title')}
      style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', justifyContent: 'center' }}>
      <button type="button" aria-label={ui('common.close')} onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'rgba(15,30,52,0.55)', border: 'none', borderRadius: 0, cursor: 'pointer', padding: 0 }} />

      <div style={{
        position: 'relative', width: '100%', maxWidth: 430, margin: '58px 14px auto',
        background: 'var(--color-card)', border: 'var(--bw) solid var(--color-navy-900)',
        borderRadius: 0, boxShadow: 'var(--shadow-px)', overflow: 'hidden',
        display: 'flex', flexDirection: 'column', maxHeight: '70vh',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          padding: '11px 13px', background: 'var(--color-navy-900)',
          borderBottom: '3px solid var(--color-gold)', flex: 'none',
        }}>
          <Bi en={ui('notif.title')} zh="通知" color="var(--color-gold)" size="var(--text-h3)" />
          <button type="button" onClick={onClose} aria-label={ui('common.close')}
            style={{
              width: 44, height: 44, flex: 'none', display: 'grid', placeItems: 'center', cursor: 'pointer',
              background: 'transparent', border: '2px solid var(--color-gold)', borderRadius: 0,
              color: 'var(--color-gold)', fontFamily: 'var(--font-display)', fontWeight: 700,
              fontSize: 'var(--text-small)', lineHeight: 1,
            }}>X</button>
        </div>

        <div style={{ overflowY: 'auto' }}>
          {error && (
            <div style={{ padding: 13 }}><ErrorNote>{error}</ErrorNote></div>
          )}

          {!error && loading && (
            <div style={{ padding: '20px 13px', textAlign: 'center' }}>
              <PixelSpinner size={14} color="var(--color-gold)" />
            </div>
          )}

          {!error && !loading && items.length === 0 && (
            <div style={{ padding: '22px 13px', textAlign: 'center' }}>
              <Bi en={ui('notif.empty')} zh="暂无通知" color="var(--color-faint)" />
            </div>
          )}

          {!error && !loading && items.map((n, idx) => {
            const mark = markFor(n.kind);
            return (
              <button
                key={n.id}
                type="button"
                onClick={goTo}
                style={{
                  display: 'flex', width: '100%', alignItems: 'flex-start', gap: 10,
                  padding: '11px 13px', textAlign: 'left', cursor: 'pointer',
                  border: 'none', borderRadius: 0,
                  borderTop: idx === 0 ? 'none' : '2px solid var(--color-line)',
                  background: n.read_at ? 'transparent' : 'var(--color-gold-tint)',
                }}
              >
                <span aria-hidden style={{
                  width: 22, height: 22, flex: 'none', display: 'grid', placeItems: 'center',
                  background: mark.bg, border: `2px solid ${mark.bd}`, color: mark.fg,
                  fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-small)', lineHeight: 1,
                }}>{mark.glyph}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 'var(--text-body)', color: 'var(--color-ink)', lineHeight: 1.45 }}>
                    {line(n, lang, ui)}
                  </span>
                  <span className="rof-label" style={{ display: 'block', color: 'var(--color-faint)', marginTop: 4 }}>
                    {ago(n.created_at, ui)}
                  </span>
                </span>
                {!n.read_at && (
                  <span aria-hidden style={{ width: 7, height: 7, marginTop: 7, flex: 'none', background: 'var(--color-red)', display: 'block' }} />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
