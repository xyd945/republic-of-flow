'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n/context';
import { useCuratorView } from '@/lib/data/views';
import { useCuratorSuggest, useCuratorUpdateMember, useDismatch } from '@/lib/data/mutations';
import { CLASSES, type ClassName } from '@/lib/classes';
import { LoadError } from '@/components/ui';
import { Page } from '@/components/pixel/shell';
import {
  Avatar, Bi, Button, ErrorNote, Field, Panel, PixelSpinner, Ribbon, Sheet, Sprite, StatRow, StatusChip,
} from '@/components/pixel';
import type { MatchWithParties } from '@/types';

/** Result of a curator action. Green for done, red for refused. */
function Notice({ tone, children }: { tone: 'ok' | 'err'; children: React.ReactNode }) {
  if (tone === 'err') return <div style={{ marginTop: 12 }}><ErrorNote>{children}</ErrorNote></div>;
  return (
    <div className="rof-label" style={{
      marginTop: 12, display: 'flex', alignItems: 'center', gap: 7, padding: '7px 9px',
      background: 'var(--color-sage-tint)', border: '2px solid var(--color-sage)',
      color: '#3F5742', textTransform: 'none', letterSpacing: 0,
    }}>
      <span aria-hidden style={{ flex: 'none', fontFamily: 'var(--font-display)', fontWeight: 700 }}>Y</span>
      <span>{children}</span>
    </div>
  );
}

/** The desk's own tab strip — five tabs, so it scrolls sideways rather than crushing. */
function DeskTabs({
  items, value, onChange,
}: { items: { id: string; label: string }[]; value: string; onChange: (id: string) => void }) {
  return (
    <div className="no-scrollbar" style={{ overflowX: 'auto' }}>
      <div style={{ display: 'flex', border: '2px solid var(--color-navy-900)', boxShadow: 'var(--shadow-px)', minWidth: 'max-content' }}>
        {items.map((it) => {
          const on = value === it.id;
          return (
            <button key={it.id} type="button" onClick={() => onChange(it.id)}
              className="rof-label"
              style={{
                minHeight: 44, padding: '9px 12px', border: 'none', borderRadius: 0, cursor: 'pointer',
                lineHeight: 1, whiteSpace: 'nowrap',
                background: on ? 'var(--color-navy-900)' : 'transparent',
                color: on ? 'var(--color-gold)' : 'var(--color-muted)',
              }}>{it.label}</button>
          );
        })}
      </div>
    </div>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const { t, lang, ui } = useI18n();
  const { people: profiles, listings, matches, viewerProfileId, loading, error } = useCuratorView();
  const updateMember = useCuratorUpdateMember();
  const dismatchMutation = useDismatch();
  const suggest = useCuratorSuggest();
  const [tab, setTab] = useState('people');
  const [suggestListing, setSuggestListing] = useState('');
  const [suggestPerson, setSuggestPerson] = useState('');
  const [suggestReason, setSuggestReason] = useState('');
  const [suggestState, setSuggestState] = useState<{ tone: 'ok' | 'err'; msg: string } | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('');
  const [inviteState, setInviteState] = useState<{ tone: 'ok' | 'err'; msg: string } | null>(null);
  const [matchState, setMatchState] = useState<{ tone: 'ok' | 'err'; msg: string } | null>(null);
  // Per-control, so one write doesn't disable every button on the desk.
  const [busyKey, setBusyKey] = useState<string | null>(null);
  // Deactivation is the one action here whose effect the curator can never see
  // — you always see yourself, and curators always see everyone — so it asks first.
  const [confirmOff, setConfirmOff] = useState<{ id: string; name: string } | null>(null);

  const me = profiles.find((p) => p.id === viewerProfileId);
  const isCurator = me?.is_curator ?? false;

  // The desk is curator-only. RLS already protects the data; this keeps the
  // UI from being reachable by typing /admin.
  useEffect(() => {
    if (!loading && me && !isCurator) router.replace('/profile');
  }, [loading, me, isCurator, router]);

  if (loading) {
    return (
      <div className="grid place-items-center" style={{ minHeight: '50vh' }}>
        <PixelSpinner size={20} color="var(--color-gold)" />
      </div>
    );
  }

  if (error) return <LoadError message={error} onRetry={() => window.location.reload()} />;

  if (!isCurator) {
    return (
      <div className="p-[18px] text-center pt-20">
        <div className="font-serif text-base text-muted">{ui('admin.curators_only')}</div>
      </div>
    );
  }

  const activeCount = profiles.filter((p) => p.is_active).length;
  const wantedCount = listings.filter((l) => l.type === 'wanted').length;
  const offerCount = listings.filter((l) => l.type === 'offer').length;

  /**
   * is_featured, is_active and class_name are no longer directly writable by
   * anyone — a member could otherwise write any column on their own row,
   * including is_curator. The desk goes through a function that checks curator
   * status itself. Note there is deliberately no way to grant curator here:
   * that stays a SQL-only act.
   */
  const patchProfile = async (
    id: string,
    patch: { is_featured?: boolean; is_active?: boolean; class_name?: string },
    key: string,
  ) => {
    setBusyKey(key);
    try {
      await updateMember.mutateAsync({
        p_profile_id: id,
        p_is_featured: patch.is_featured ?? null,
        p_is_active: patch.is_active ?? null,
        p_class_name: patch.class_name ?? null,
      });
    } catch (e) {
      setMatchState({ tone: 'err', msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusyKey(null);
    }
  };

  /**
   * One call. dismatch() closes the match, reopens the listing and returns the
   * accepted request to pending, all inside a single transaction — and, since
   * 00008, notifies both participants. Previously these were three sequential
   * writes with two of the three errors discarded, so a failure could leave a
   * closed match on a listing that never reopened. Curator-only is enforced
   * inside the function.
   */
  const dismatch = async (match: MatchWithParties) => {
    setBusyKey(`${match.id}:dismatch`);
    try {
      await dismatchMutation.mutateAsync({ p_match_id: match.id });
      setMatchState({ tone: 'ok', msg: ui('admin.dismatched') });
    } catch (e) {
      setMatchState({ tone: 'err', msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusyKey(null);
    }
  };

  const sendSuggestion = async () => {
    if (!suggestListing || !suggestPerson) {
      setSuggestState({ tone: 'err', msg: ui('admin.pick_both') });
      return;
    }
    setBusyKey('suggest');
    // suggested_* is no longer directly writable — a member could otherwise
    // forge a curator endorsement on their own listing.
    try {
      await suggest.mutateAsync({
        p_listing_id: suggestListing,
        p_profile_id: suggestPerson,
        p_reason: suggestReason.trim() ? { [lang]: suggestReason.trim() } : null,
      });
      setSuggestState({ tone: 'ok', msg: ui('admin.suggestion_sent') });
      setSuggestListing('');
      setSuggestPerson('');
      setSuggestReason('');
    } catch (e) {
      setSuggestState({ tone: 'err', msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusyKey(null);
    }
  };

  const sendInvite = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email.includes('@')) {
      setInviteState({ tone: 'err', msg: ui('auth.valid_email') });
      return;
    }
    setBusyKey('invite');
    setInviteState(null);
    try {
      const res = await fetch('/api/admin/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, note: inviteRole.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? ui('admin.invitation_failed'));
      setInviteState({ tone: 'ok', msg: `${ui('admin.invitation_sent')} ${email}` });
      setInviteEmail('');
      setInviteRole('');
    } catch (e) {
      setInviteState({ tone: 'err', msg: e instanceof Error ? e.message : ui('admin.invitation_failed') });
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <Page>
      {/* the desk's own head, then the counters in the design's divided strip */}
      <Panel pad={14} tone="navy" innerRule={false}>
        <div className="flex items-center" style={{ gap: 11 }}>
          <Sprite name="nav-journal" size={26} />
          <div style={{ minWidth: 0 }}>
            <Bi en="Curator Desk" zh="策展人事务台" color="var(--color-gold)" />
            <div style={{
              fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-h3)',
              letterSpacing: 'var(--tracking-display)', textTransform: 'uppercase',
              color: 'var(--color-parchment)', marginTop: 6, lineHeight: 1.3,
            }}>{lang === 'zh' ? '维护共和国的真实' : 'Keep the Republic Honest'}</div>
          </div>
        </div>
      </Panel>

      <StatRow stats={[
        { icon: 'stat-friends', value: activeCount, label: 'Dossiers', cn: '档案' },
        { icon: 'nav-auction', value: wantedCount + offerCount, label: 'Listings', cn: '列表' },
        { icon: 'handshake', value: matches.length, label: 'Matches', cn: '匹配' },
      ]} />

      <DeskTabs
        items={[
          { id: 'people', label: ui('admin.people') },
          { id: 'listings', label: ui('admin.listings') },
          { id: 'matches', label: ui('admin.matches') },
          { id: 'suggest', label: ui('admin.suggest') },
          { id: 'invite', label: ui('admin.invite') },
        ]}
        value={tab}
        onChange={setTab}
      />

      {/* people */}
      {tab === 'people' && (
        <div style={{ display: 'grid', gap: 8 }}>
          {profiles.map((p) => (
            <Panel key={p.id} pad={10} innerRule={false} style={{ opacity: p.is_active ? 1 : 0.55 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Avatar initials={p.initials} id={p.id} size={34} featured={p.is_featured} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="truncate" style={{ fontSize: 'var(--text-body)', color: 'var(--color-ink)' }}>{p.full_name}</div>
                  <select
                    value={CLASSES.includes(p.class_name as ClassName) ? p.class_name : ''}
                    disabled={busyKey !== null}
                    onChange={(e) => patchProfile(p.id, { class_name: e.target.value }, `${p.id}:class`)}
                    aria-label={`${ui('profile.class')} — ${p.full_name}`}
                    className="rof-label"
                    style={{
                      marginTop: 4, padding: '3px 5px', background: 'var(--color-white)',
                      border: '2px solid var(--color-line)', borderRadius: 0,
                      color: 'var(--color-muted)', cursor: busyKey !== null ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {!CLASSES.includes(p.class_name as ClassName) && (
                      <option value="">{p.class_name || ui('admin.unassigned')}</option>
                    )}
                    {CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', gap: 5, flex: 'none' }}>
                  {/* Filled star vs hollow — the two states have to differ in
                      shape, not only colour, to read at this size. */}
                  <Button
                    tone={p.is_featured ? 'gold' : 'secondary'}
                    size="sm"
                    disabled={busyKey !== null && busyKey !== `${p.id}:feat`}
                    loading={busyKey === `${p.id}:feat`}
                    ariaPressed={p.is_featured}
                    ariaLabel={`${p.is_featured ? ui('admin.unfeature') : ui('admin.feature')} — ${p.full_name}`}
                    onClick={() => patchProfile(p.id, { is_featured: !p.is_featured }, `${p.id}:feat`)}
                  >{p.is_featured ? '★' : '☆'}</Button>
                  <Button
                    tone={p.is_active ? 'green' : 'secondary'}
                    size="sm"
                    disabled={busyKey !== null && busyKey !== `${p.id}:active`}
                    loading={busyKey === `${p.id}:active`}
                    onClick={() =>
                      p.is_active
                        ? setConfirmOff({ id: p.id, name: p.full_name })
                        : patchProfile(p.id, { is_active: true }, `${p.id}:active`)
                    }
                    ariaPressed={p.is_active}
                    ariaLabel={`${p.is_active ? ui('admin.deactivate') : ui('admin.activate')} — ${p.full_name}`}
                  >{p.is_active ? 'ON' : 'OFF'}</Button>
                </div>
              </div>
            </Panel>
          ))}
        </div>
      )}

      {/* listings */}
      {tab === 'listings' && (
        <div style={{ display: 'grid', gap: 8 }}>
          {listings.length === 0 && (
            <div className="text-center" style={{ padding: '24px 0', fontSize: 'var(--text-body)', color: 'var(--color-muted)' }}>
              {ui('admin.no_listings')}
            </div>
          )}
          {listings.map((l) => (
            <Panel key={l.id} pad={10} innerRule={false}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Avatar initials={l.creator?.initials ?? '?'} id={l.creator_profile_id} size={30} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    <StatusChip tone={l.type === 'wanted' ? 'wanted' : 'offer'}>
                      {l.type === 'wanted' ? ui('market.wanted') : ui('market.offer_one')}
                    </StatusChip>
                    <StatusChip tone={l.status === 'open' ? 'open' : 'matched'}>{l.status}</StatusChip>
                  </div>
                  <div className="truncate" style={{ fontSize: 'var(--text-body)', color: 'var(--color-ink)', marginTop: 5 }}>{t(l.title)}</div>
                </div>
              </div>
            </Panel>
          ))}
        </div>
      )}

      {/* matches */}
      {tab === 'matches' && (
        <div>
          <p style={{ margin: '0 0 13px', fontSize: 'var(--text-body)', color: 'var(--color-muted)', lineHeight: 1.6 }}>
            {ui('admin.matches_desc')}
          </p>
          {matches.length === 0 && (
            <div className="text-center" style={{ padding: '24px 0', fontSize: 'var(--text-body)', color: 'var(--color-muted)' }}>
              {ui('admin.no_matches')}
            </div>
          )}
          <div style={{ display: 'grid', gap: 8 }}>
            {matches.map((m) => {
              const closed = m.status === 'closed';
              return (
                <Panel key={m.id} pad={10} innerRule={false} style={{ opacity: closed ? 0.55 : 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Avatar initials={m.initiator?.initials ?? '?'} id={m.initiator_profile_id} size={28} />
                    <Avatar initials={m.matched?.initials ?? '?'} id={m.matched_profile_id} size={28} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="truncate" style={{ fontSize: 'var(--text-body)', color: 'var(--color-ink)' }}>
                        {m.initiator?.full_name ?? ui('common.unknown_member')} &amp; {m.matched?.full_name ?? ui('common.unknown_member')}
                      </div>
                      <div className="truncate" style={{ fontSize: 'var(--text-small)', color: 'var(--color-faint)', marginTop: 2 }}>
                        {t(m.listing?.title)}
                      </div>
                    </div>
                    {closed ? (
                      <StatusChip tone="closed">{ui('admin.match_closed')}</StatusChip>
                    ) : (
                      <Button tone="red" size="sm"
                        loading={busyKey === `${m.id}:dismatch`}
                        disabled={busyKey !== null && busyKey !== `${m.id}:dismatch`}
                        onClick={() => dismatch(m)}>
                        {busyKey === `${m.id}:dismatch` ? ui('admin.dismatching') : ui('admin.dismatch')}
                      </Button>
                    )}
                  </div>
                </Panel>
              );
            })}
          </div>
          {matchState && <Notice tone={matchState.tone}>{matchState.msg}</Notice>}
        </div>
      )}

      {/* suggest */}
      {tab === 'suggest' && (
        <div>
          <p style={{ margin: '0 0 13px', fontSize: 'var(--text-body)', color: 'var(--color-muted)', lineHeight: 1.6 }}>
            {ui('admin.suggest_desc')}
          </p>
          <div style={{ display: 'grid', gap: 12 }}>
            <Field label={ui('admin.wanted_listing')} cn="需求条目">
              <select className="rof-input" value={suggestListing} onChange={(e) => setSuggestListing(e.target.value)}>
                <option value="">{ui('admin.select_listing')}</option>
                {listings.filter((l) => l.type === 'wanted').map((l) => (
                  <option key={l.id} value={l.id}>{t(l.title)}</option>
                ))}
              </select>
            </Field>
            <Field label={ui('admin.suggest_classmate')} cn="推荐同学">
              <select className="rof-input" value={suggestPerson} onChange={(e) => setSuggestPerson(e.target.value)}>
                <option value="">{ui('admin.select_person')}</option>
                {profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </select>
            </Field>
            <Field label={ui('admin.why_person')} cn="理由">
              <textarea className="rof-input" rows={3} value={suggestReason}
                onChange={(e) => setSuggestReason(e.target.value)} placeholder={ui('admin.brief_reason')} />
            </Field>
            <Button tone="gold" size="lg" block onClick={sendSuggestion}
              loading={busyKey === 'suggest'} disabled={busyKey === 'suggest'}>
              {busyKey === 'suggest' ? ui('common.sending') : ui('admin.send_suggestion')}
            </Button>
          </div>
          {suggestState && <Notice tone={suggestState.tone}>{suggestState.msg}</Notice>}
        </div>
      )}

      {/* invite */}
      {tab === 'invite' && (
        <div>
          <p style={{ margin: '0 0 13px', fontSize: 'var(--text-body)', color: 'var(--color-muted)', lineHeight: 1.6 }}>
            {ui('admin.invite_desc')}
          </p>
          <div style={{ display: 'grid', gap: 12 }}>
            <Field label={ui('auth.email')} cn="邮箱">
              <input className="rof-input" type="email" value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)} placeholder="classmate@school.edu" />
            </Field>
            <Field label={ui('admin.role_context')} cn="角色说明">
              <input className="rof-input" type="text" value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)} placeholder={ui('admin.role_placeholder')} />
            </Field>
            <Button tone="dark" size="lg" block onClick={sendInvite}
              loading={busyKey === 'invite'} disabled={busyKey === 'invite'}>
              {busyKey === 'invite' ? ui('common.sending') : ui('admin.send_invitation')}
            </Button>
          </div>
          {inviteState && <Notice tone={inviteState.tone}>{inviteState.msg}</Notice>}
        </div>
      )}

      <Ribbon cn="没有算法，只有人的判断">No Algorithm. Human Judgment.</Ribbon>

      {confirmOff && (
        <Sheet
          title={ui('admin.confirm_deactivate')} cn="确认停用"
          onClose={() => setConfirmOff(null)}
          footer={
            <div style={{ display: 'flex', gap: 8 }}>
              <Button tone="red" size="lg" onClick={() => {
                const target = confirmOff;
                setConfirmOff(null);
                patchProfile(target.id, { is_active: false }, `${target.id}:active`);
              }}>{ui('admin.deactivate')}</Button>
              <Button tone="secondary" size="lg" onClick={() => setConfirmOff(null)}>{ui('profile.cancel')}</Button>
            </div>
          }
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <Avatar initials={profiles.find((x) => x.id === confirmOff.id)?.initials ?? '?'} id={confirmOff.id} size={38} />
            <span style={{
              fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-h3)',
              letterSpacing: 'var(--tracking-display)', textTransform: 'uppercase', color: 'var(--color-ink)',
            }}>{confirmOff.name}</span>
          </div>
          <p style={{ margin: 0, fontSize: 'var(--text-body)', color: 'var(--color-muted)', lineHeight: 1.6 }}>
            {ui('admin.confirm_deactivate_body')}
          </p>
        </Sheet>
      )}
    </Page>
  );
}
