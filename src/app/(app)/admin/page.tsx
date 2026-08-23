'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Avatar, Icon, Badge, Button, Chip, Spinner } from '@/components/ui';
import { useI18n } from '@/lib/i18n/context';
import { useDirectory } from '@/lib/supabase/directory';
import { createClient } from '@/lib/supabase/client';
import { CLASSES, type ClassName } from '@/lib/classes';
import type { MatchWithParties } from '@/types';

function Segmented({ items, value, onChange }: { items: { id: string; label: string }[]; value: string; onChange: (id: string) => void }) {
  return (
    <div className="flex gap-0 rounded-xs overflow-hidden border" style={{ borderColor: 'var(--color-dark-line)' }}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          className="flex-1 py-[8px] border-none cursor-pointer font-display font-bold text-eyebrow tracking-[0.10em] uppercase transition-colors"
          style={{
            background: item.id === value ? 'var(--color-dark-paper)' : 'transparent',
            color: item.id === value ? 'var(--color-dark)' : 'var(--color-dark-muted)',
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function StatBlock({ value, label }: { value: number; label: string }) {
  return (
    <div className="text-center">
      <div className="font-display font-bold text-2xl" style={{ color: 'var(--color-dark-paper)' }}>{value}</div>
      <div className="font-serif text-eyebrow" style={{ color: 'var(--color-dark-muted)' }}>{label}</div>
    </div>
  );
}

function Notice({ tone, children }: { tone: 'ok' | 'err'; children: React.ReactNode }) {
  return (
    <div className={`mt-3 flex items-center gap-[7px] font-serif text-xs ${tone === 'ok' ? 'text-green' : 'text-red'}`}>
      <Icon name={tone === 'ok' ? 'check' : 'x'} size={14} color={tone === 'ok' ? 'var(--color-green)' : 'var(--color-red)'} />
      {children}
    </div>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const { t, lang, ui } = useI18n();
  const { profiles, listings, matches, viewerProfileId, loading, refetch } = useDirectory();
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

  const me = profiles.find((p) => p.id === viewerProfileId);
  const isCurator = me?.is_curator ?? false;

  // The desk is curator-only. RLS already protects the data; this keeps the
  // UI from being reachable by typing /admin.
  useEffect(() => {
    if (!loading && me && !isCurator) router.replace('/profile');
  }, [loading, me, isCurator, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-bronze border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

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

  const patchProfile = async (id: string, patch: Record<string, unknown>, key: string) => {
    setBusyKey(key);
    await createClient().from('profiles').update(patch).eq('id', id);
    setBusyKey(null);
    refetch();
  };

  /**
   * Undo a pairing: close the match, reopen the listing, and put the accepted
   * request back to pending so the owner can choose again. Rejected requests
   * are deliberately left alone — the owner already made that call.
   */
  /**
   * One call — the dismatch() function closes the match, reopens the listing
   * and returns the accepted request to pending inside a single transaction.
   * Previously these were three sequential writes and two of the three errors
   * were discarded, so a failure could leave a closed match on a listing that
   * never reopened. Curator-only is enforced inside the function.
   */
  const dismatch = async (match: MatchWithParties) => {
    setBusyKey(`${match.id}:dismatch`);
    const { error } = await createClient().rpc('dismatch', { p_match_id: match.id });
    setBusyKey(null);
    if (error) { setMatchState({ tone: 'err', msg: error.message }); return; }
    setMatchState({ tone: 'ok', msg: ui('admin.dismatched') });
    refetch();
  };

  const sendSuggestion = async () => {
    if (!suggestListing || !suggestPerson) {
      setSuggestState({ tone: 'err', msg: ui('admin.pick_both') });
      return;
    }
    setBusyKey('suggest');
    const { error } = await createClient()
      .from('market_listings')
      .update({
        suggested_profile_id: suggestPerson,
        suggested_reason: suggestReason.trim() ? { [lang]: suggestReason.trim() } : null,
      })
      .eq('id', suggestListing);
    setBusyKey(null);
    if (error) { setSuggestState({ tone: 'err', msg: error.message }); return; }
    setSuggestState({ tone: 'ok', msg: ui('admin.suggestion_sent') });
    setSuggestListing('');
    setSuggestPerson('');
    setSuggestReason('');
    refetch();
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
      refetch();
    } catch (e) {
      setInviteState({ tone: 'err', msg: e instanceof Error ? e.message : ui('admin.invitation_failed') });
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="pb-6">
      {/* Back header */}
      <div className="flex items-center gap-3 px-[18px] pt-[16px] pb-[10px]">
        <button type="button" onClick={() => router.back()} className="w-8 h-8 grid place-items-center rounded-full bg-transparent border border-line cursor-pointer">
          <Icon name="chevron-right" size={16} color="var(--color-ink)" style={{ transform: 'rotate(180deg)' }} />
        </button>
        <span className="font-display font-bold text-eyebrow tracking-[0.14em] uppercase text-bronze">{ui('admin.title')}</span>
      </div>

      {/* Dark header with stats */}
      <div className="sheet-dark mx-[18px] p-[18px] mb-5">
        <div className="flex items-center gap-[6px] mb-4">
          <Icon name="shield" size={16} color="var(--color-dark-muted)" />
          <span className="font-display font-bold text-eyebrow tracking-[0.14em] uppercase" style={{ color: 'var(--color-dark-muted)' }}>
            {ui('admin.overview')}
          </span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <StatBlock value={activeCount} label={ui('admin.profiles')} />
          <StatBlock value={wantedCount} label={ui('admin.wanted')} />
          <StatBlock value={offerCount} label={ui('admin.offers')} />
          <StatBlock value={matches.length} label={ui('admin.matches')} />
        </div>
      </div>

      <div className="px-[18px]">
        <Segmented
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

        {/* People tab */}
        {tab === 'people' && (
          <div className="mt-4 flex flex-col gap-[8px]">
            {profiles.map((p) => (
              <div key={p.id} className="flex items-center gap-3 p-[10px] rounded-xs border border-line">
                <Avatar initials={p.initials} id={p.id} size={34} />
                <div className="flex-1 min-w-0">
                  <div className="font-serif font-semibold text-sm text-ink truncate">{p.full_name}</div>
                  <select
                    value={CLASSES.includes(p.class_name as ClassName) ? p.class_name : ''}
                    disabled={busyKey !== null}
                    onChange={(e) => patchProfile(p.id, { class_name: e.target.value }, `${p.id}:class`)}
                    className="font-serif text-eyebrow text-faint bg-transparent border-none cursor-pointer p-0 -ml-[2px]"
                  >
                    {!CLASSES.includes(p.class_name as ClassName) && (
                      <option value="">{p.class_name || ui('admin.unassigned')}</option>
                    )}
                    {CLASSES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    title={p.is_featured ? ui('admin.unfeature') : ui('admin.feature')}
                    disabled={busyKey !== null}
                    onClick={() => patchProfile(p.id, { is_featured: !p.is_featured }, `${p.id}:feat`)}
                    className="w-7 h-7 grid place-items-center rounded-full cursor-pointer"
                    style={{
                      background: p.is_featured ? 'var(--color-bronze-wash)' : 'transparent',
                      border: `1px solid ${p.is_featured ? 'var(--color-bronze)' : 'var(--color-line)'}`,
                    }}
                  >
                    {/* Filled vs hollow — bronze and faint are too close in
                        brightness to read as an on/off state on their own. */}
                    {busyKey === `${p.id}:feat` ? (
                      <Spinner size={12} color="var(--color-bronze)" />
                    ) : (
                      <Icon
                        name="star"
                        size={13}
                        color={p.is_featured ? 'var(--color-bronze)' : 'var(--color-faint)'}
                        fill={p.is_featured ? 'var(--color-bronze)' : 'none'}
                      />
                    )}
                  </button>
                  <button
                    type="button"
                    title={p.is_active ? ui('admin.deactivate') : ui('admin.activate')}
                    disabled={busyKey !== null}
                    onClick={() => patchProfile(p.id, { is_active: !p.is_active }, `${p.id}:active`)}
                    className="w-7 h-7 grid place-items-center rounded-full bg-transparent border border-line cursor-pointer"
                  >
                    {busyKey === `${p.id}:active` ? (
                      <Spinner size={12} color="var(--color-green)" />
                    ) : (
                      <span className="w-2 h-2 rounded-full" style={{ background: p.is_active ? 'var(--color-green)' : 'var(--color-faint)' }} />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Listings tab */}
        {tab === 'listings' && (
          <div className="mt-4 flex flex-col gap-[8px]">
            {listings.length === 0 && (
              <div className="font-serif text-sm text-muted text-center py-8">{ui('admin.no_listings')}</div>
            )}
            {listings.map((l) => (
              <div key={l.id} className="flex items-center gap-3 p-[10px] rounded-xs border border-line">
                <Avatar initials={l.creator?.initials ?? '?'} id={l.creator_profile_id} size={30} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-[2px]">
                    <Chip variant="wash" tone={l.type === 'wanted' ? 'red' : 'green'}>
                      {l.type === 'wanted' ? ui('market.wanted') : ui('market.offer_one')}
                    </Chip>
                    <Badge tone={l.status === 'open' ? 'green' : 'neutral'}>{l.status}</Badge>
                  </div>
                  <div className="font-serif text-xs text-ink truncate">{t(l.title)}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Matches tab */}
        {tab === 'matches' && (
          <div className="mt-4">
            <p className="font-serif text-sm text-muted leading-[1.6] mb-4">{ui('admin.matches_desc')}</p>
            {matches.length === 0 && (
              <div className="font-serif text-sm text-muted text-center py-8">{ui('admin.no_matches')}</div>
            )}
            <div className="flex flex-col gap-[8px]">
              {matches.map((m) => {
                const closed = m.status === 'closed';
                return (
                  <div key={m.id} className="flex items-center gap-3 p-[10px] rounded-xs border border-line" style={{ opacity: closed ? 0.55 : 1 }}>
                    <Avatar initials={m.initiator?.initials ?? '?'} id={m.initiator_profile_id} size={28} />
                    <Avatar initials={m.matched?.initials ?? '?'} id={m.matched_profile_id} size={28} />
                    <div className="flex-1 min-w-0">
                      <div className="font-serif font-semibold text-xs text-ink truncate">
                        {m.initiator?.full_name} &amp; {m.matched?.full_name}
                      </div>
                      <div className="font-serif text-xs text-faint truncate">{t(m.listing?.title)}</div>
                    </div>
                    {closed ? (
                      <Chip variant="wash" tone="neutral">{ui('admin.match_closed')}</Chip>
                    ) : (
                      <Button tone="red" variant="outline" size="sm" block={false} loading={busyKey === `${m.id}:dismatch`} disabled={busyKey !== null} onClick={() => dismatch(m)}>
                        {busyKey === `${m.id}:dismatch` ? ui('admin.dismatching') : ui('admin.dismatch')}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
            {matchState && <Notice tone={matchState.tone}>{matchState.msg}</Notice>}
          </div>
        )}

        {/* Suggest tab */}
        {tab === 'suggest' && (
          <div className="mt-4">
            <p className="font-serif text-sm text-muted leading-[1.6] mb-4">
              {ui('admin.suggest_desc')}
            </p>
            <label className="block mb-3">
              <span className="font-display font-bold text-eyebrow tracking-[0.13em] uppercase text-bronze mb-[7px] block">{ui('admin.wanted_listing')}</span>
              <select value={suggestListing} onChange={(e) => setSuggestListing(e.target.value)} className="parch-input">
                <option value="">{ui('admin.select_listing')}</option>
                {listings.filter((l) => l.type === 'wanted').map((l) => (
                  <option key={l.id} value={l.id}>{t(l.title)}</option>
                ))}
              </select>
            </label>
            <label className="block mb-3">
              <span className="font-display font-bold text-eyebrow tracking-[0.13em] uppercase text-bronze mb-[7px] block">{ui('admin.suggest_classmate')}</span>
              <select value={suggestPerson} onChange={(e) => setSuggestPerson(e.target.value)} className="parch-input">
                <option value="">{ui('admin.select_person')}</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.full_name}</option>
                ))}
              </select>
            </label>
            <label className="block mb-4">
              <span className="font-display font-bold text-eyebrow tracking-[0.13em] uppercase text-bronze mb-[7px] block">{ui('admin.why_person')}</span>
              <textarea
                value={suggestReason}
                onChange={(e) => setSuggestReason(e.target.value)}
                placeholder={ui('admin.brief_reason')}
                rows={2}
                className="parch-input"
              />
            </label>
            <Button tone="bronze" onClick={sendSuggestion} loading={busyKey === 'suggest'} icon={<Icon name="arrow-right" size={15} color="var(--color-dark)" />}>
              {busyKey === 'suggest' ? ui('common.sending') : ui('admin.send_suggestion')}
            </Button>
            {suggestState && <Notice tone={suggestState.tone}>{suggestState.msg}</Notice>}
          </div>
        )}

        {/* Invite tab */}
        {tab === 'invite' && (
          <div className="mt-4">
            <p className="font-serif text-sm text-muted leading-[1.6] mb-4">
              {ui('admin.invite_desc')}
            </p>
            <label className="block mb-3">
              <span className="font-display font-bold text-eyebrow tracking-[0.13em] uppercase text-bronze mb-[7px] block">{ui('auth.email')}</span>
              <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="classmate@school.edu" className="parch-input" />
            </label>
            <label className="block mb-4">
              <span className="font-display font-bold text-eyebrow tracking-[0.13em] uppercase text-bronze mb-[7px] block">{ui('admin.role_context')}</span>
              <input type="text" value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} placeholder={ui('admin.role_placeholder')} className="parch-input" />
            </label>
            <Button tone="ink" onClick={sendInvite} loading={busyKey === 'invite'} icon={<Icon name="arrow-right" size={15} color="#fff" />}>
              {busyKey === 'invite' ? ui('common.sending') : ui('admin.send_invitation')}
            </Button>
            {inviteState && <Notice tone={inviteState.tone}>{inviteState.msg}</Notice>}
          </div>
        )}
      </div>
    </div>
  );
}
