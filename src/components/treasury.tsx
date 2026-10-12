'use client';

import { useState } from 'react';
import { useI18n } from '@/lib/i18n/context';
import { fill } from '@/lib/i18n/translations';
import { isActiveHold } from '@/lib/payments';
import { useAccountsQuery, useLedgerAuditQuery } from '@/lib/data/tables';
import { useCuratorRefundPayment, useCuratorReleasePayment } from '@/lib/data/mutations';
import { Avatar, Bi, Button, ErrorNote, Panel, PixelSpinner, StatRow, StatusChip } from '@/components/pixel';
import type { MatchWithParties, ProfileWithHiddenWorlds } from '@/types';

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String((e as { message?: unknown })?.message ?? e);
}

/**
 * The Curator Desk's Treasury (issue #57): how much FLOW exists and where it
 * is, whether the books balance, every payment still on hold, and everyone's
 * wallet. Releasing pays a hold the payer never confirmed; refunding undoes
 * the match, which gives the FLOW back — and both refuse if the hold was
 * settled in the meantime (00016).
 */
export function TreasuryTab({
  profiles, matches,
}: { profiles: ProfileWithHiddenWorlds[]; matches: MatchWithParties[] }) {
  const { t, ui } = useI18n();
  const audit = useLedgerAuditQuery(true);
  const accounts = useAccountsQuery();
  const release = useCuratorReleasePayment();
  const refund = useCuratorRefundPayment();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'err'; msg: string } | null>(null);

  const nameOf = (id: string) => profiles.find((p) => p.id === id)?.full_name ?? ui('common.unknown_member');
  const held = matches.filter((m) => isActiveHold(m.payment, m.status));
  const wallets = (accounts.data ?? [])
    .filter((a) => a.kind === 'member' && a.profile_id)
    .map((a) => ({ ...a, profile: profiles.find((p) => p.id === a.profile_id) }))
    .filter((a) => a.profile)
    .sort((a, b) => Number(b.balance) - Number(a.balance));

  const act = async (key: string, run: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    setNotice(null);
    try {
      await run();
      setNotice({ tone: 'ok', msg: ok });
    } catch (e) {
      setNotice({ tone: 'err', msg: errText(e) });
    } finally {
      setBusy(null);
    }
  };

  if (audit.isPending || accounts.isPending) {
    return <div className="grid place-items-center" style={{ minHeight: 120 }}><PixelSpinner size={18} color="var(--color-gold)" /></div>;
  }
  if (audit.error || accounts.error) return <ErrorNote>{errText(audit.error ?? accounts.error)}</ErrorNote>;
  const a = audit.data!;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 14 }}>
      <p style={{ margin: 0, fontSize: 'var(--text-body)', color: 'var(--color-muted)', lineHeight: 1.6 }}>
        {ui('admin.treasury_desc')}
      </p>

      <StatRow minCell={92} stats={[
        { icon: 'nav-constitution', value: Number(a.issued), label: ui('admin.issued') },
        { icon: 'stat-friends', value: Number(a.in_wallets), label: ui('admin.in_wallets') },
        { icon: 'handshake', value: Number(a.on_hold), label: ui('admin.on_hold') },
      ]} />
      {a.balanced ? (
        <div className="flex items-center" style={{ gap: 8, fontSize: 'var(--text-small)', color: '#3E5A42' }}>
          <StatusChip tone="open">{ui('admin.balanced')}</StatusChip>{ui('admin.balanced_line')}
        </div>
      ) : (
        <ErrorNote>{ui('admin.unbalanced')}</ErrorNote>
      )}

      <Bi en={ui('admin.on_hold')} zh="冻结中" color="var(--color-gold)" />
      {held.length === 0 ? (
        <div style={{ fontSize: 'var(--text-body)', color: 'var(--color-faint)' }}>{ui('admin.no_holds')}</div>
      ) : held.map((m) => {
        const p = m.payment!;
        const payer = nameOf(p.payer_profile_id);
        const payee = nameOf(p.payee_profile_id);
        return (
          <Panel key={m.id} pad={11} innerRule={false}>
            <div style={{ fontSize: 'var(--text-body)', color: 'var(--color-ink)', fontWeight: 600 }}>{t(m.listing?.title)}</div>
            <div className="rof-label" style={{ marginTop: 5, color: '#6B5223', textTransform: 'none', letterSpacing: 0 }}>
              {fill(ui('admin.pays_line'), { payer, payee, n: p.amount })}
            </div>
            <div className="flex" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <Button tone="green" size="sm" loading={busy === `${m.id}:release`} disabled={busy !== null}
                onClick={() => act(`${m.id}:release`, () => release.mutateAsync({ p_match_id: m.id }), ui('admin.released'))}>
                {fill(ui('admin.release'), { name: payee })}
              </Button>
              <Button tone="secondary" size="sm" loading={busy === `${m.id}:refund`} disabled={busy !== null}
                onClick={() => act(`${m.id}:refund`, () => refund.mutateAsync({ p_match_id: m.id }), ui('admin.refunded'))}>
                {fill(ui('admin.refund'), { name: payer })}
              </Button>
            </div>
          </Panel>
        );
      })}
      {notice && (notice.tone === 'err'
        ? <ErrorNote>{notice.msg}</ErrorNote>
        : <div style={{ fontSize: 'var(--text-small)', color: '#3E5A42' }}>{notice.msg}</div>)}

      <Bi en={ui('admin.wallets')} zh="钱包" color="var(--color-gold)" />
      <Panel pad={6} innerRule={false}>
        {wallets.map((w, i) => (
          <div key={w.id} className="flex items-center" style={{
            gap: 10, padding: '8px 10px', borderTop: i ? '2px solid var(--color-line-soft)' : 'none',
          }}>
            <Avatar initials={w.profile!.initials} id={w.profile!.id} size={28} />
            <span className="truncate" style={{ flex: 1, minWidth: 0, fontSize: 'var(--text-body)', color: 'var(--color-ink)' }}>{w.profile!.full_name}</span>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{Number(w.balance)}</span>
          </div>
        ))}
      </Panel>
    </div>
  );
}
