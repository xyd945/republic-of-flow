'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui';
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

function iconFor(kind: AppNotification['kind']): { name: string; color: string } {
  switch (kind) {
    case 'interest_accepted': return { name: 'check', color: 'var(--color-green)' };
    case 'interest_declined': return { name: 'x', color: 'var(--color-faint)' };
    case 'match_undone':      return { name: 'x', color: 'var(--color-red)' };
    case 'match_met':         return { name: 'check', color: 'var(--color-green)' };
    case 'suggestion_made':   return { name: 'star', color: 'var(--color-bronze)' };
    default:                  return { name: 'bell', color: 'var(--color-bronze)' };
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

  // Escape closes, and the page behind must not scroll while this is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  // Every kind of notification is about something in the Market, so they all
  // land there. The Market's tabs are component state rather than URL state,
  // so there is no deeper link to make yet without reworking that page.
  const goTo = () => {
    onClose();
    router.push('/market');
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-center" role="dialog" aria-modal="true" aria-label={ui('notif.title')}>
      <button
        type="button"
        aria-label={ui('notif.close')}
        onClick={onClose}
        className="absolute inset-0 bg-ink/25 border-none cursor-pointer p-0"
      />
      <div className="relative w-full max-w-[430px] mt-[64px] mx-[18px] mb-auto rounded-xs border border-line bg-white shadow-lg overflow-hidden">
        <div className="flex items-center justify-between px-[14px] py-[11px] border-b border-line">
          <span className="font-display font-bold text-eyebrow tracking-[0.13em] uppercase text-bronze">
            {ui('notif.title')}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label={ui('notif.close')}
            className="w-7 h-7 grid place-items-center rounded-full bg-transparent border border-line cursor-pointer"
          >
            <Icon name="x" size={12} color="var(--color-faint)" />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {error && (
            <div className="flex items-center gap-[7px] px-[14px] py-[12px] font-serif text-xs text-red">
              <Icon name="x" size={13} color="var(--color-red)" />{error}
            </div>
          )}

          {!error && loading && (
            <div className="px-[14px] py-[18px] text-center">
              <div className="w-5 h-5 mx-auto border-2 border-bronze border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!error && !loading && items.length === 0 && (
            <div className="px-[14px] py-[22px] text-center font-serif text-xs text-faint italic">
              {ui('notif.empty')}
            </div>
          )}

          {!error && !loading && items.map((n) => {
            const icon = iconFor(n.kind);
            return (
              <button
                key={n.id}
                type="button"
                onClick={goTo}
                className={`flex w-full items-start gap-[10px] px-[14px] py-[11px] border-b border-line last:border-b-0 cursor-pointer text-left ${n.read_at ? 'bg-transparent' : 'bg-bronze-wash'}`}
              >
                <span className="w-6 h-6 mt-[1px] grid place-items-center rounded-full border border-line shrink-0">
                  <Icon name={icon.name} size={11} color={icon.color} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-serif text-xs text-ink leading-[1.45]">{line(n, lang, ui)}</span>
                  <span className="block font-serif text-eyebrow text-faint mt-[3px]">{ago(n.created_at, ui)}</span>
                </span>
                {!n.read_at && <span className="w-[6px] h-[6px] mt-[7px] rounded-full bg-bronze shrink-0" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
