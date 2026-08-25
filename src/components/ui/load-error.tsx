'use client';

import { useI18n } from '@/lib/i18n/context';
import { Bi, Button, Panel } from '@/components/pixel';

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
    <div style={{ padding: '24px 14px' }}>
      <Panel pad={16} corners accent="var(--color-red)">
        <div className="text-center">
          <div aria-hidden style={{
            width: 34, height: 34, margin: '0 auto 12px', display: 'grid', placeItems: 'center',
            background: 'var(--color-red-tint)', border: '2px solid var(--color-red)',
            fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-h3)',
            color: 'var(--color-red)', lineHeight: 1,
          }}>!</div>
          <Bi en={ui('common.load_failed')} zh="加载失败" color="var(--color-red)" />
          <p style={{
            margin: '10px 0 0', fontSize: 'var(--text-body)', color: 'var(--color-muted)',
            lineHeight: 1.6, wordBreak: 'break-word',
          }}>{message}</p>
          {onRetry && (
            <div style={{ marginTop: 14 }}>
              <Button tone="secondary" onClick={onRetry}>{ui('common.try_again')}</Button>
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}
