'use client';

import Link from 'next/link';
import { useI18n } from '@/lib/i18n/context';
import { fill } from '@/lib/i18n/translations';
import { useWallet } from '@/lib/data/views';
import { useLedgerLinesQuery } from '@/lib/data/tables';
import { Bi, Button, EmptyState, ErrorNote, Panel, PixelSpinner } from '@/components/pixel';
import type { LedgerLine } from '@/types';

/** A fixed-size entry point on You; it never requests transaction history. */
export function WalletLink() {
  const { ui } = useI18n();
  const wallet = useWallet();
  return (
    <Link href="/wallet" prefetch={false} style={{
      display: 'grid', gap: 8, padding: '14px 16px', textDecoration: 'none', color: 'var(--color-ink)',
      background: 'var(--color-gold-tint)', border: '2px solid var(--color-gold)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <Bi en={ui('wallet.title')} color="var(--color-ink-2)" />
        {!wallet.loading && !wallet.error && wallet.balance !== null && (
          <strong>{wallet.balance} FLOW</strong>
        )}
      </div>
      {!wallet.loading && !wallet.error && (wallet.heldFromMe > 0 || wallet.heldForMe > 0) && (
        <div style={{ fontSize: 'var(--text-small)' }}>
          {[
            wallet.heldFromMe ? fill(ui('wallet.held_from_me'), { n: wallet.heldFromMe }) : '',
            wallet.heldForMe ? fill(ui('wallet.held_for_me'), { n: wallet.heldForMe }) : '',
          ].filter(Boolean).join(' · ')}
        </div>
      )}
      <span style={{ fontSize: 'var(--text-small)', fontWeight: 600 }}>{ui('wallet.open')} →</span>
    </Link>
  );
}

export function WalletPanel() {
  const { ui, lang } = useI18n();
  const wallet = useWallet();
  const history = useLedgerLinesQuery(wallet.accountId);
  const lines = history.data?.pages.flat() ?? [];
  const when = new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
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
      {wallet.loading ? (
        <div className="grid place-items-center" style={{ minHeight: 80 }}><PixelSpinner size={16} color="var(--color-gold)" /></div>
      ) : wallet.error ? (
        <>
          <ErrorNote>{wallet.error}</ErrorNote>
          <Button tone="secondary" onClick={wallet.retry}>{ui('common.try_again')}</Button>
        </>
      ) : wallet.balance === null ? (
        <EmptyState title={ui('wallet.not_yet')} />
      ) : (
        <>
          <Panel pad={16}>
            <Bi en={ui('wallet.available')} color="var(--color-gold)" />
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
            <div style={{ padding: '4px 10px 2px' }}><Bi en={ui('wallet.ledger')} color="var(--color-gold)" /></div>
            {history.isPending ? (
              <div className="grid place-items-center" style={{ minHeight: 80 }}><PixelSpinner size={16} color="var(--color-gold)" /></div>
            ) : lines.length === 0 && !history.error ? (
              <div style={{ padding: '10px', fontSize: 'var(--text-body)', color: 'var(--color-faint)' }}>{ui('wallet.empty')}</div>
            ) : lines.map((l, i) => (
              <div key={l.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px',
                borderTop: i ? '2px solid var(--color-line-soft)' : 'none',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 'var(--text-body)', color: 'var(--color-ink)', fontWeight: 600, overflowWrap: 'anywhere' }}>
                    {l.transaction?.match_id ? (
                      <Link href={`/market?match=${encodeURIComponent(l.transaction.match_id)}`} prefetch={false}
                        style={{ color: 'inherit', textUnderlineOffset: 3 }}>{label(l)} →</Link>
                    ) : label(l)}
                  </div>
                  <div style={{ fontSize: 'var(--text-small)', color: 'var(--color-faint)', marginTop: 2 }}>{when.format(new Date(l.created_at))}</div>
                </div>
                <span style={{
                  fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-h3)', fontVariantNumeric: 'tabular-nums',
                  color: l.amount > 0 ? '#3E5A42' : '#7E2F24',
                }}>{l.amount > 0 ? '+' : '−'}{Math.abs(l.amount)}</span>
              </div>
            ))}
          </Panel>
          {history.error && (
            <>
              <ErrorNote>{history.error.message}</ErrorNote>
              <Button tone="secondary" loading={history.isFetching}
                onClick={() => { if (history.isFetchNextPageError) history.fetchNextPage(); else history.refetch(); }}>
                {ui('common.try_again')}
              </Button>
            </>
          )}
          {history.hasNextPage && !history.error && (
            <Button tone="secondary" block loading={history.isFetching} onClick={() => { history.fetchNextPage(); }}>
              {ui('wallet.load_more')}
            </Button>
          )}
          <div style={{ fontSize: 'var(--text-small)', color: 'var(--color-faint)', lineHeight: 1.5 }}>{ui('wallet.only_grows')}</div>
        </>
      )}
    </section>
  );
}
