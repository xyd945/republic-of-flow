'use client';

import { useI18n } from '@/lib/i18n/context';
import { fill } from '@/lib/i18n/translations';
import { useWallet } from '@/lib/data/views';
import { Bi, EmptyState, ErrorNote, Panel, PixelSpinner, SectionHeader } from '@/components/pixel';
import type { LedgerLine } from '@/types';

/**
 * Your FLOW wallet (issue #57): the balance, what is on hold, and your lines
 * of the ledger, newest first. Lines only ever arrive; nothing here changes.
 */
export function WalletPanel() {
  const { ui, lang } = useI18n();
  const wallet = useWallet();
  const when = new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  const label = (l: LedgerLine) => {
    const memo = l.transaction?.memo || '—';
    switch (l.transaction?.kind) {
      case 'welcome': return ui('wallet.welcome');
      case 'hold': return fill(ui('wallet.line_hold'), { memo });
      case 'pay': return fill(ui('wallet.line_received'), { memo });
      case 'refund': return fill(ui('wallet.line_refund'), { memo });
      default: return memo;
    }
  };

  return (
    <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 12 }}>
      <SectionHeader icon="stat-badges" cn="钱包">{ui('wallet.title')}</SectionHeader>

      {wallet.loading ? (
        <div className="grid place-items-center" style={{ minHeight: 80 }}><PixelSpinner size={16} color="var(--color-gold)" /></div>
      ) : wallet.error ? (
        <ErrorNote>{wallet.error}</ErrorNote>
      ) : wallet.balance === null ? (
        <EmptyState title={ui('wallet.not_yet')} />
      ) : (
        <>
          <Panel pad={16}>
            <Bi en={ui('wallet.title')} zh="钱包" color="var(--color-gold)" />
            <div style={{
              marginTop: 10, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 40, lineHeight: 1,
              color: 'var(--color-ink)', fontVariantNumeric: 'tabular-nums',
            }}>
              {wallet.balance}<span className="rof-label" style={{ fontSize: 13, marginLeft: 8 }}>FLOW</span>
            </div>
            {(wallet.heldFromMe > 0 || wallet.heldForMe > 0) && (
              <div style={{ display: 'grid', gap: 6, marginTop: 12 }}>
                {wallet.heldFromMe > 0 && (
                  <div style={{ padding: '8px 10px', background: 'var(--color-gold-tint)', border: '2px solid var(--color-gold)', fontSize: 'var(--text-small)', color: 'var(--color-ink-2)' }}>
                    {fill(ui('wallet.held_from_me'), { n: wallet.heldFromMe })}
                  </div>
                )}
                {wallet.heldForMe > 0 && (
                  <div style={{ padding: '8px 10px', background: 'var(--color-sage-tint)', border: '2px solid var(--color-sage)', fontSize: 'var(--text-small)', color: 'var(--color-ink-2)' }}>
                    {fill(ui('wallet.held_for_me'), { n: wallet.heldForMe })}
                  </div>
                )}
              </div>
            )}
          </Panel>

          <Panel pad={6} innerRule={false}>
            <div style={{ padding: '4px 10px 2px' }}><Bi en={ui('wallet.ledger')} zh="账本" color="var(--color-gold)" /></div>
            {wallet.lines.length === 0 ? (
              <div style={{ padding: '10px', fontSize: 'var(--text-body)', color: 'var(--color-faint)' }}>{ui('wallet.empty')}</div>
            ) : wallet.lines.map((l, i) => (
              <div key={l.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px',
                borderTop: i ? '2px solid var(--color-line-soft)' : 'none',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="truncate" style={{ fontSize: 'var(--text-body)', color: 'var(--color-ink)', fontWeight: 600 }}>{label(l)}</div>
                  <div style={{ fontSize: 'var(--text-small)', color: 'var(--color-faint)', marginTop: 2 }}>{when.format(new Date(l.created_at))}</div>
                </div>
                <span style={{
                  fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-h3)', fontVariantNumeric: 'tabular-nums',
                  color: l.amount > 0 ? '#3E5A42' : '#7E2F24',
                }}>{l.amount > 0 ? '+' : '−'}{Math.abs(l.amount)}</span>
              </div>
            ))}
          </Panel>
          <div style={{ fontSize: 'var(--text-small)', color: 'var(--color-faint)', lineHeight: 1.5 }}>{ui('wallet.only_grows')}</div>
        </>
      )}
    </section>
  );
}
