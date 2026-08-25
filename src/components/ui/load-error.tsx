'use client';

import { Icon } from './icons';
import { useI18n } from '@/lib/i18n/context';

/**
 * What a screen shows when it could not read its data.
 *
 * This component exists because the old DirectoryProvider read every query as
 * `res.data ?? []` and never checked `.error`. A dropped network, a paused
 * project or an RLS refusal all rendered as a calm, confident empty state —
 * "no people yet", "nothing in the market". The Republic looked EMPTY rather
 * than BROKEN, which is the more damaging of the two lies: an empty community
 * app reads as a dead community app.
 */
export function LoadError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { ui } = useI18n();
  return (
    <div className="px-[18px] py-[40px] text-center">
      <div className="w-9 h-9 mx-auto mb-3 grid place-items-center rounded-full border border-line">
        <Icon name="x" size={16} color="var(--color-red)" />
      </div>
      <div className="font-serif text-sm text-ink mb-[6px]">{ui('common.load_failed')}</div>
      <div className="font-serif text-xs text-faint mb-4 break-words">{message}</div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="font-display font-bold text-eyebrow tracking-[0.12em] uppercase text-bronze bg-transparent border border-line rounded-xs px-4 py-2 cursor-pointer"
        >
          {ui('common.try_again')}
        </button>
      )}
    </div>
  );
}
