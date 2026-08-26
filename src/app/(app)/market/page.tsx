'use client';

import { useState, useRef, useEffect } from 'react';
import { useI18n } from '@/lib/i18n/context';
import { useListings, useMatches } from '@/lib/data/views';
import {
  useAcceptInterest, useDeclineInterest, useMarkMatchMet,
  usePublishListing, useRaiseInterest,
} from '@/lib/data/mutations';
import { LoadError } from '@/components/ui';
import { Page } from '@/components/pixel/shell';
import {
  Avatar, Bi, BiText, Button, Divider, EmptyState, ErrorNote, Panel, PixelSpinner, SectionHeader, Sheet, StatusChip,
} from '@/components/pixel';
import type { ListingWithCreator, ListingInterest, MatchWithParties, Language } from '@/types';

/* ------------------------------------------------------------- segmented */

/** Hard-edged tab strip. The design's rounded pills are not in this system. */
function Tabs({
  items, value, onChange,
}: { items: { id: string; label: string; cn?: string; badge?: number }[]; value: string; onChange: (id: string) => void }) {
  /* Scrolls rather than crushes. At the raised type scale four labels no longer
     fit across 375px, and shrinking them either wraps mid-word or clips. */
  return (
    <div className="no-scrollbar" style={{ overflowX: 'auto' }}>
    <div style={{ display: 'flex', minWidth: '100%', width: 'max-content', border: '2px solid var(--color-navy-900)', boxShadow: 'var(--shadow-px)' }}>
      {items.map((it) => {
        const on = value === it.id;
        return (
          <button key={it.id} type="button" onClick={() => onChange(it.id)}
            className="rof-label"
            style={{
              position: 'relative', flex: '1 0 auto', whiteSpace: 'nowrap',
              minHeight: 44, padding: '9px 12px', border: 'none', borderRadius: 0,
              cursor: 'pointer', lineHeight: 1,
              background: on ? 'var(--color-navy-900)' : 'transparent',
              color: on ? 'var(--color-gold)' : 'var(--color-muted)',
            }}>
            {it.label}
            {it.badge ? (
              <span className="rof-label" style={{
                marginLeft: 4, padding: '1px 3px', background: 'var(--color-red)',
                color: '#F7E7E2', fontSize: 'var(--text-small)',
              }}>{it.badge}</span>
            ) : null}
          </button>
        );
      })}
    </div>
    </div>
  );
}

/* ----------------------------------------------------------- request row */

/** One incoming request, shown only to the listing owner. */
function RequestRow({
  interest, actionable, busyKey, onAccept, onReject,
}: {
  interest: ListingInterest;
  actionable: boolean;
  busyKey: string | null;
  onAccept: () => void;
  onReject: () => void;
}) {
  const { t, ui } = useI18n();
  const settled = interest.status === 'accepted' || interest.status === 'declined';
  const accepting = busyKey === `${interest.id}:accept`;
  const rejecting = busyKey === `${interest.id}:reject`;
  // Any write in flight locks every control — the database serializes accepts
  // now, but locking avoids firing a request that is certain to be rejected.
  // Only the button you pressed shows a spinner.
  const locked = busyKey !== null;

  return (
    <div style={{
      padding: 11, border: '2px solid var(--color-line-soft)', background: 'var(--color-white)',
      opacity: interest.status === 'declined' || (!actionable && !settled) ? 0.55 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <Avatar initials={interest.profile?.initials ?? '?'} id={interest.profile_id} size={38} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="truncate" style={{ fontSize: 'var(--text-body)', color: 'var(--color-ink)' }}>
          {interest.profile?.full_name ?? '—'}
        </div>
        {interest.message ? (
          <div style={{ fontSize: 'var(--text-body)', color: 'var(--color-muted)', marginTop: 3, lineHeight: 1.5 }}>
            {t(interest.message)}
          </div>
        ) : null}
      </div>

      {interest.status === 'accepted' ? (
        <StatusChip tone="open">{ui('market.accepted')}</StatusChip>
      ) : interest.status === 'declined' ? (
        <StatusChip tone="closed">{ui('market.rejected')}</StatusChip>
      ) : null}
      </div>
      {actionable && interest.status === 'pending' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 8, marginTop: 11 }}>
          <Button tone="green" size="lg" block cn="接受" onClick={onAccept}
            disabled={locked && !accepting} loading={accepting}>{ui('market.accept')}</Button>
          <Button tone="tertiary" size="lg" block cn="婉拒" onClick={onReject}
            disabled={locked && !rejecting} loading={rejecting}>{ui('market.reject')}</Button>
        </div>
      ) : null}
    </div>
  );
}

/** A listing you raised a hand on, with where that request now stands. */
function SentRow({ listing }: { listing: ListingWithCreator }) {
  const { t, ui } = useI18n();
  const s = listing.viewer_interest_status;
  const [label, tone] =
    s === 'accepted' ? [ui('market.youre_matched'), 'open' as const]
    : s === 'declined' ? [ui('market.not_selected'), 'closed' as const]
    : listing.status === 'matched' ? [ui('market.already_matched'), 'closed' as const]
    : [ui('market.interest_sent'), 'neutral' as const];

  return (
    <Panel pad={10} innerRule={false}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Avatar initials={listing.creator?.initials ?? '?'} id={listing.creator_profile_id} size={30} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="truncate" style={{ fontSize: 'var(--text-body)', color: 'var(--color-ink)' }}>{t(listing.title)}</div>
          <div className="truncate" style={{ fontSize: 'var(--text-small)', color: 'var(--color-faint)', marginTop: 2 }}>
            {listing.creator?.full_name ?? ui('common.unknown_member')}
          </div>
        </div>
        <StatusChip tone={tone}>{label}</StatusChip>
      </div>
    </Panel>
  );
}

/* --------------------------------------------------------- listing card */

function MarketCard({
  listing, viewerProfileId, busyKey, onInterest, onAccept, onReject,
}: {
  listing: ListingWithCreator;
  viewerProfileId: string | null;
  busyKey: string | null;
  onInterest: () => void;
  onAccept: (i: ListingInterest) => void;
  onReject: (i: ListingInterest) => void;
}) {
  const { t, ui } = useI18n();
  const isMine = listing.creator_profile_id === viewerProfileId;
  const isMatched = listing.status === 'matched';
  const mine = listing.viewer_interest_status;
  const wanted = listing.type === 'wanted';

  // A non-owner's button reflects where they stand, not just whether they clicked.
  const viewerLabel = isMatched && mine !== 'accepted'
    ? (mine === 'declined' ? ui('market.not_selected') : ui('market.already_matched'))
    : mine === 'accepted' ? ui('market.youre_matched')
    : mine === 'declined' ? ui('market.not_selected')
    : mine === 'pending' ? ui('market.interest_sent')
    : ui('market.interested');

  return (
    <Panel pad={13} accent={wanted ? 'var(--color-red)' : 'var(--color-sage)'}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <Avatar initials={listing.creator?.initials ?? '?'} id={listing.creator_profile_id} size={38} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <StatusChip tone={wanted ? 'wanted' : 'offer'} cn={wanted ? '寻求' : '提供'}>
              {wanted ? ui('market.wanted') : ui('market.offer_one')}
            </StatusChip>
            {/* Status, not a count: RLS hides other members' interest rows, so
                any number rendered to a non-owner would be wrong. */}
            <StatusChip tone={isMatched ? 'matched' : 'open'}>
              {isMatched ? ui('market.status_matched') : ui('market.status_open')}
            </StatusChip>
          </div>
          <div style={{
            fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-h3)',
            letterSpacing: 'var(--tracking-display)', color: 'var(--color-ink)',
            marginTop: 7, lineHeight: 1.3,
          }}>{t(listing.title)}</div>
          <div style={{ fontSize: 'var(--text-small)', color: 'var(--color-faint)', marginTop: 3 }}>
            {listing.creator?.full_name ?? ui('common.unknown_member')}
          </div>
        </div>
      </div>

      {t(listing.description) ? (
        <p style={{ margin: '11px 0 0', fontSize: 'var(--text-body)', color: 'var(--color-muted)', lineHeight: 1.6 }}>
          {t(listing.description)}
        </p>
      ) : null}

      {listing.chips.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 10 }}>
          {listing.chips.map((chip, i) => <StatusChip key={i} tone="neutral">{t(chip)}</StatusChip>)}
        </div>
      )}

      {isMine ? (
        <div style={{ marginTop: 12 }}>
          <SectionHeader icon="handshake" cn="收到的请求" trailing={
            <span className="rof-label" style={{ color: 'var(--color-faint)' }}>{ui('market.your_listing')}</span>
          } className="mb-2">{ui('market.requests')}</SectionHeader>
          {listing.interests.length === 0 ? (
            <div style={{ fontSize: 'var(--text-body)', color: 'var(--color-faint)' }}>{ui('market.no_requests')}</div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 6 }}>
                {listing.interests.map((i) => (
                  <RequestRow key={i.id} interest={i} actionable={!isMatched} busyKey={busyKey}
                    onAccept={() => onAccept(i)} onReject={() => onReject(i)} />
                ))}
              </div>
              {!isMatched && listing.interests.some((i) => i.status === 'pending') && (
                <div style={{ fontSize: 'var(--text-small)', color: 'var(--color-faint)', marginTop: 8 }}>
                  {ui('market.pick_one')}
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <div style={{ marginTop: 12 }}>
          <Button tone="primary" size="sm" onClick={onInterest} disabled={mine !== null || isMatched}>
            {viewerLabel}
          </Button>
        </div>
      )}

      {listing.suggested_profile ? (
        <>
          <Divider className="my-3" />
          <Bi en="Curator Suggestion" zh="策展人推荐" color="var(--color-gold)" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 7 }}>
            <Avatar initials={listing.suggested_profile.initials} id={listing.suggested_profile.id} size={30} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 'var(--text-body)', color: 'var(--color-ink)' }}>{listing.suggested_profile.full_name}</div>
              <div style={{ fontSize: 'var(--text-small)', color: 'var(--color-faint)', lineHeight: 1.45, marginTop: 2 }}>
                {t(listing.suggested_reason)}
              </div>
            </div>
          </div>
        </>
      ) : null}
    </Panel>
  );
}

/* ------------------------------------------------------------ match card */

function MatchCard({ match, onDone }: { match: MatchWithParties; onDone: () => void }) {
  const { t, ui } = useI18n();
  const [busy, setBusy] = useState(false);
  const markMetMutation = useMarkMatchMet();
  const done = match.status === 'completed';
  const [error, setError] = useState('');

  /**
   * Direct writes to matches are revoked: the row describes a relationship
   * between two people, so it is only ever changed by a function that checks
   * who is asking. Participants may mark it met; closing it stays curator-only,
   * because that also has to reopen the listing and restore the request.
   */
  const markMet = async () => {
    setBusy(true);
    setError('');
    try {
      await markMetMutation.mutateAsync({ p_match_id: match.id });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel pad={13} tone="gold" corners>
      <Bi en={ui('market.matched')} zh="已配对" color="var(--color-navy-900)" />
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 10 }}>
        <Avatar initials={match.initiator?.initials ?? '?'} id={match.initiator_profile_id} size={36} />
        <span aria-hidden className="rof-label" style={{ color: 'var(--color-gold)', flex: 'none' }}>&lt;&gt;</span>
        <Avatar initials={match.matched?.initials ?? '?'} id={match.matched_profile_id} size={36} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 'var(--text-body)', color: 'var(--color-ink)', lineHeight: 1.35 }}>
            {match.initiator?.full_name ?? ui('common.unknown_member')} &amp; {match.matched?.full_name ?? ui('common.unknown_member')}
          </div>
          <div className="truncate" style={{ fontSize: 'var(--text-small)', color: 'var(--color-muted)', marginTop: 2 }}>
            {t(match.listing?.title)}
          </div>
        </div>
      </div>

      {match.next_step ? (
        <div style={{
          marginTop: 11, padding: 9, background: 'var(--color-sage-tint)',
          border: '2px solid var(--color-sage)', fontSize: 'var(--text-body)',
          color: '#3F5742', lineHeight: 1.5,
        }}>
          <Bi en={ui('market.next_step')} color="#3F5742" />
          <div style={{ marginTop: 4 }}>{t(match.next_step)}</div>
        </div>
      ) : null}

      {error ? <div style={{ marginTop: 10 }}><ErrorNote>{error}</ErrorNote></div> : null}

      <div style={{ marginTop: 12 }}>
        <Button tone="green" size="sm" onClick={markMet} loading={busy} disabled={done}>
          {done ? ui('market.met') : busy ? ui('market.saving') : ui('market.we_met')}
        </Button>
      </div>
    </Panel>
  );
}

/* ---------------------------------------------------------------- modals */

function InterestModal({
  listing, viewerProfileId, lang, onClose, onDone,
}: {
  listing: ListingWithCreator;
  viewerProfileId: string | null;
  lang: Language;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t, ui } = useI18n();
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const raise = useRaiseInterest();

  // Closing the modal mid-request would otherwise set state on an unmounted
  // component when the response lands.
  const alive = useRef(true);
  // Set true on setup, not just false on teardown: React's development Strict
  // Mode runs the cleanup once before the real mount, which would otherwise
  // leave this false for the component's whole life and wedge the button on
  // "Sending...".
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const send = async () => {
    if (!viewerProfileId) { setError(ui('market.profile_loading')); return; }
    setBusy(true);
    setError('');
    // Was a direct insert. It goes through the function now so the listing
    // owner is notified in the same transaction — a notification written by the
    // client afterwards could be lost the moment the request fails or the tab
    // closes. The function also enforces what the UI only ever implied: not
    // your own listing, still open, and not twice.
    const { error: err } = await raise.mutateAsync({
      p_listing_id: listing.id,
      p_message: msg.trim() ? { [lang]: msg.trim() } : null,
    }).then(() => ({ error: null as null | { code?: string; message: string } }))
      .catch((e) => ({ error: e as { code?: string; message: string } }));
    if (alive.current) setBusy(false);
    if (err) {
      if (alive.current) setError(err.code === '23505' ? ui('market.already_interested') : err.message);
      return;
    }
    // Deliberately outside the alive check: the request succeeded, so the
    // parent still needs to refresh even if the member closed this modal while
    // it was in flight. These are the parent's callbacks, not our state.
    onDone();
    onClose();
  };

  return (
    <Sheet
      title={ui('market.express_interest')} cn="表达兴趣" onClose={onClose}
      footer={
        <Button tone="primary" size="lg" block onClick={send} loading={busy}>
          {busy ? ui('market.sending') : ui('market.send_interest')}
        </Button>
      }
    >
      <Panel pad={11} innerRule={false}>
        <div style={{ fontSize: 'var(--text-body)', color: 'var(--color-ink)' }}>{t(listing.title)}</div>
        <div style={{ fontSize: 'var(--text-small)', color: 'var(--color-faint)', marginTop: 3 }}>
          {listing.creator?.full_name ?? ui('common.unknown_member')}
        </div>
      </Panel>

      <label style={{ display: 'block' }}>
        <div style={{ marginBottom: 6 }}><Bi en={ui('market.message_optional')} zh="留言（可选）" color="var(--color-gold)" /></div>
        <textarea className="rof-input" rows={4} value={msg} onChange={(e) => setMsg(e.target.value)}
          placeholder={ui('market.why_interested')} />
      </label>

      {error ? <ErrorNote>{error}</ErrorNote> : null}
    </Sheet>
  );
}

function PublishModal({
  viewerProfileId, lang, onClose, onDone,
}: {
  viewerProfileId: string | null;
  lang: Language;
  onClose: () => void;
  onDone: () => void;
}) {
  const { ui } = useI18n();
  const [type, setType] = useState<'wanted' | 'offer'>('wanted');
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const publish_ = usePublishListing();

  const publish = async () => {
    if (!title.trim()) { setError(ui('market.need_title')); return; }
    if (!viewerProfileId) { setError(ui('market.profile_loading')); return; }
    setBusy(true);
    setError('');
    try {
      await publish_.mutateAsync({
        creator_profile_id: viewerProfileId,
        type,
        title: { [lang]: title.trim() },
        description: { [lang]: desc.trim() },
        status: 'open',
      });
      onDone();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      title={ui('market.new_listing')} cn="新条目" onClose={onClose}
      footer={
        <Button tone="dark" size="lg" block onClick={publish} loading={busy}>
          {busy ? ui('market.publishing') : ui('market.publish')}
        </Button>
      }
    >
      <Tabs
        items={[
          { id: 'wanted', label: ui('market.wanted') },
          { id: 'offer', label: ui('market.offers') },
        ]}
        value={type}
        onChange={(id) => setType(id as 'wanted' | 'offer')}
      />

      <label style={{ display: 'block' }}>
        <div style={{ marginBottom: 6 }}><Bi en={ui('market.listing_title')} zh="标题" color="var(--color-gold)" /></div>
        <input className="rof-input" type="text" value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder={ui('market.title_placeholder')} />
      </label>

      <label style={{ display: 'block' }}>
        <div style={{ marginBottom: 6 }}><Bi en={ui('market.description')} zh="描述" color="var(--color-gold)" /></div>
        <textarea className="rof-input" rows={4} value={desc} onChange={(e) => setDesc(e.target.value)}
          placeholder={ui('market.desc_placeholder')} />
      </label>

      {error ? <ErrorNote>{error}</ErrorNote> : null}
    </Sheet>
  );
}

/* ------------------------------------------------------------------ page */

export default function MarketPage() {
  const { lang, ui } = useI18n();
  const { listings, viewerProfileId, loading: listingsLoading, error: listingsError } = useListings();
  // Matches has its own loading and error. Ignoring them made a failed matches
  // query render the Matches tab as "no matches yet" — the exact outage-looks-
  // like-emptiness bug this refactor exists to remove, reintroduced one tab over.
  const { matches, loading: matchesLoading, error: matchesError } = useMatches();
  const loading = listingsLoading || matchesLoading;
  const loadError = listingsError || matchesError;
  const [tab, setTab] = useState('wanted');
  const [interestFor, setInterestFor] = useState<ListingWithCreator | null>(null);
  const [showPublish, setShowPublish] = useState(false);
  // Which control is mid-write, e.g. `<interestId>:accept`. A plain boolean
  // would spin every button on the page at once.
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState('');

  const wanted = listings.filter((l) => l.type === 'wanted');
  const offers = listings.filter((l) => l.type === 'offer');
  // Closed matches are history — the curator desk shows them, members don't.
  // Scoped to the viewer on purpose. RLS lets a curator read every match, so
  // without this the member-facing tab silently becomes a cohort-wide list —
  // with a live "We met!" on pairings the curator isn't part of. Cross-cohort
  // matches belong in the Curator Desk, which has its own Matches tab.
  const liveMatches = matches.filter(
    (m) =>
      m.status !== 'closed' &&
      (m.initiator_profile_id === viewerProfileId || m.matched_profile_id === viewerProfileId),
  );

  // Requests are otherwise only visible inline on your own card, buried among
  // everyone else's listings — this is the one place you can reliably find them.
  const myListings = listings.filter((l) => l.creator_profile_id === viewerProfileId);
  const mySent = listings.filter(
    (l) => l.viewer_interest_status !== null && l.creator_profile_id !== viewerProfileId,
  );
  const awaitingReply = myListings.reduce(
    (n, l) => n + (l.status === 'matched' ? 0 : l.interests.filter((i) => i.status === 'pending').length),
    0,
  );

  /**
   * One call each — accept_interest and decline_interest run every write
   * inside a single database transaction. The listing row is locked there, so
   * two owners accepting at once queue instead of racing, and a failure part
   * way through rolls the whole thing back rather than stranding a listing as
   * matched with no pairing behind it. Ownership is checked inside the
   * function, which also returns a readable message straight to the UI.
   */
  const accept = useAcceptInterest();
  const decline = useDeclineInterest();

  const acceptInterest = async (interest: ListingInterest) => {
    setBusyKey(`${interest.id}:accept`);
    setError('');
    try {
      await accept.mutateAsync({ p_interest_id: interest.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyKey(null);
    }
  };

  const rejectInterest = async (interest: ListingInterest) => {
    setBusyKey(`${interest.id}:reject`);
    setError('');
    try {
      await decline.mutateAsync({ p_interest_id: interest.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyKey(null);
    }
  };

  if (loading) {
    return <div className="grid place-items-center" style={{ minHeight: '50vh' }}><PixelSpinner size={20} color="var(--color-gold)" /></div>;
  }
  if (loadError) return <LoadError message={loadError} onRetry={() => window.location.reload()} />;

  const listFor = (rows: ListingWithCreator[], empty: string, emptyCn: string) =>
    rows.length === 0 ? <EmptyState title={empty} cn={emptyCn} /> : (
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 11 }}>
        {rows.map((l) => (
          <MarketCard key={l.id} listing={l} viewerProfileId={viewerProfileId} busyKey={busyKey}
            onInterest={() => setInterestFor(l)} onAccept={acceptInterest} onReject={rejectInterest} />
        ))}
      </div>
    );

  return (
    <Page>
      {/* Every screen in the design opens the same way: an eyebrow, a headline
          that asks something, a line of explanation, then the primary action
          full width. */}
      <Panel pad={14} innerRule={false}>
        <Bi en="Flow Market" zh="市场" color="var(--color-gold)" />
        <div style={{
          fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-h2)',
          letterSpacing: 'var(--tracking-display)', textTransform: 'uppercase',
          color: 'var(--color-ink)', lineHeight: 1.4, marginTop: 9,
        }}>{lang === 'zh' ? '你想发现什么？' : 'What Do You Want to Discover?'}</div>
        <div style={{ marginTop: 12 }}>
          <BiText
            en="Wanted: I do not know who to ask. Offer: I will open one of my worlds."
            zh="悬赏：我不知道该找谁。邀请：我愿意打开一个世界。" />
        </div>
        <div style={{ marginTop: 14 }}>
          <Button tone="primary" size="lg" block cn="发布" onClick={() => setShowPublish(true)}>
            Post to the Market
          </Button>
        </div>
      </Panel>

      {error ? <ErrorNote>{error}</ErrorNote> : null}

      <Tabs
        items={[
          { id: 'wanted', label: ui('market.wanted') },
          { id: 'offer', label: ui('market.offers') },
          { id: 'mine', label: ui('market.mine'), badge: awaitingReply || undefined },
          { id: 'matches', label: ui('market.matches') },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'wanted' && listFor(wanted, ui('market.no_wanted'), '还没有需求')}
      {tab === 'offer' && listFor(offers, ui('market.no_offers'), '还没有供给')}

      {tab === 'mine' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 18 }}>
          <section>
            <SectionHeader icon="nav-auction" cn="收到的" className="mb-3" trailing={
              awaitingReply > 0
                ? <span className="rof-label" style={{ color: 'var(--color-red)' }}>{awaitingReply} {ui('market.awaiting_you')}</span>
                : undefined
            }>{ui('market.received')}</SectionHeader>
            {myListings.length === 0
              ? <EmptyState title={ui('market.nothing_posted')} cn="你还没有发布任何条目" />
              : listFor(myListings, ui('market.nothing_posted'), '你还没有发布任何条目')}
          </section>

          <section>
            <SectionHeader icon="handshake" cn="已发出" className="mb-3">{ui('market.sent')}</SectionHeader>
            {mySent.length === 0 ? (
              <EmptyState title={ui('market.nothing_sent')} cn="你还没有表达过兴趣" />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 8 }}>
                {mySent.map((l) => <SentRow key={l.id} listing={l} />)}
              </div>
            )}
          </section>
        </div>
      )}

      {tab === 'matches' && (
        liveMatches.length === 0
          ? <EmptyState title={ui('market.no_matches')} cn="还没有配对" />
          : (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 11 }}>
              {liveMatches.map((m) => <MatchCard key={m.id} match={m} onDone={() => {}} />)}
            </div>
          )
      )}

      {interestFor && (
        <InterestModal listing={interestFor} viewerProfileId={viewerProfileId} lang={lang}
          onClose={() => setInterestFor(null)} onDone={() => {}} />
      )}
      {showPublish && (
        <PublishModal viewerProfileId={viewerProfileId} lang={lang}
          onClose={() => setShowPublish(false)} onDone={() => {}} />
      )}
    </Page>
  );
}
