'use client';

import { useState, useRef, useEffect } from 'react';
import { Avatar, Icon, Chip, Button, Spinner, LoadError } from '@/components/ui';
import { useI18n } from '@/lib/i18n/context';
import { useListings, useMatches } from '@/lib/data/views';
import {
  useAcceptInterest, useDeclineInterest, useMarkMatchMet,
  usePublishListing, useRaiseInterest,
} from '@/lib/data/mutations';
import { createClient } from '@/lib/supabase/client';
import type { ListingWithCreator, ListingInterest, MatchWithParties, Language } from '@/types';

function Segmented({ items, value, onChange }: { items: { id: string; label: string }[]; value: string; onChange: (id: string) => void }) {
  return (
    <div className="flex gap-0 rounded-xs overflow-hidden border border-line mb-4">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          className="flex-1 py-[8px] border-none cursor-pointer font-display font-bold text-eyebrow tracking-[0.10em] uppercase transition-colors"
          style={{
            background: item.id === value ? 'var(--color-ink)' : 'transparent',
            color: item.id === value ? '#fff' : 'var(--color-muted)',
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

/** One incoming request, shown only to the listing owner. */
function RequestRow({
  interest,
  actionable,
  busyKey,
  onAccept,
  onReject,
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
    <div
      className="flex items-start gap-[10px] p-[10px] rounded-xs border border-line"
      style={{ opacity: interest.status === 'declined' || (!actionable && !settled) ? 0.55 : 1 }}
    >
      <Avatar initials={interest.profile?.initials ?? '?'} id={interest.profile_id} size={30} />
      <div className="flex-1 min-w-0">
        <div className="font-serif font-semibold text-xs text-ink truncate">
          {interest.profile?.full_name ?? '—'}
        </div>
        {interest.message && (
          <div className="font-serif text-xs text-muted italic leading-[1.45] mt-[2px]">
            {t(interest.message)}
          </div>
        )}
      </div>

      {interest.status === 'accepted' ? (
        <Chip variant="wash" tone="green">{ui('market.accepted')}</Chip>
      ) : interest.status === 'declined' ? (
        <Chip variant="wash" tone="neutral">{ui('market.rejected')}</Chip>
      ) : actionable ? (
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            title={ui('market.accept')}
            disabled={locked}
            onClick={onAccept}
            className="w-7 h-7 grid place-items-center rounded-full cursor-pointer bg-transparent"
            style={{ border: '1px solid var(--color-green)', opacity: locked && !accepting ? 0.4 : 1 }}
          >
            {accepting ? <Spinner size={12} color="var(--color-green)" /> : <Icon name="check" size={13} color="var(--color-green)" />}
          </button>
          <button
            type="button"
            title={ui('market.reject')}
            disabled={locked}
            onClick={onReject}
            className="w-7 h-7 grid place-items-center rounded-full cursor-pointer bg-transparent"
            style={{ border: '1px solid var(--color-line)', opacity: locked && !rejecting ? 0.4 : 1 }}
          >
            {rejecting ? <Spinner size={12} color="var(--color-faint)" /> : <Icon name="x" size={13} color="var(--color-faint)" />}
          </button>
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
    s === 'accepted' ? [ui('market.youre_matched'), 'green' as const]
    : s === 'declined' ? [ui('market.not_selected'), 'neutral' as const]
    : listing.status === 'matched' ? [ui('market.already_matched'), 'neutral' as const]
    : [ui('market.interest_sent'), 'neutral' as const];

  return (
    <div className="flex items-center gap-3 p-[10px] rounded-xs border border-line">
      <Avatar initials={listing.creator?.initials ?? '?'} id={listing.creator_profile_id} size={30} />
      <div className="flex-1 min-w-0">
        <div className="font-serif font-semibold text-xs text-ink truncate">{t(listing.title)}</div>
        <div className="font-serif text-xs text-faint truncate">{listing.creator?.full_name ?? ui('common.unknown_member')}</div>
      </div>
      <Chip variant="wash" tone={tone}>{label}</Chip>
    </div>
  );
}

function MarketCard({
  listing,
  viewerProfileId,
  busyKey,
  onInterest,
  onAccept,
  onReject,
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

  // A non-owner's button reflects where they stand, not just whether they clicked.
  const viewerLabel = isMatched && mine !== 'accepted'
    ? (mine === 'declined' ? ui('market.not_selected') : ui('market.already_matched'))
    : mine === 'accepted' ? ui('market.youre_matched')
    : mine === 'declined' ? ui('market.not_selected')
    : mine === 'pending' ? ui('market.interest_sent')
    : ui('market.interested');

  return (
    <div className="sheet p-[16px] mb-3">
      <div className="flex items-start gap-3 mb-[10px]">
        <Avatar initials={listing.creator?.initials ?? '?'} id={listing.creator_profile_id} size={38} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-[2px]">
            <Chip variant="wash" tone={listing.type === 'wanted' ? 'red' : 'green'}>
              {listing.type === 'wanted' ? ui('market.wanted') : ui('market.offer_one')}
            </Chip>
            {/* Status, not a count: RLS hides other members' interest rows, so
                any number rendered to a non-owner would be wrong. */}
            <span className="font-serif text-eyebrow text-faint">
              {isMatched ? ui('market.status_matched') : ui('market.status_open')}
            </span>
          </div>
          <div className="font-serif font-semibold text-base text-ink leading-[1.35]">{t(listing.title)}</div>
          <div className="font-serif text-xs text-muted mt-[2px]">{listing.creator?.full_name ?? ui('common.unknown_member')}</div>
        </div>
      </div>
      <div className="font-serif text-sm text-muted leading-[1.6] mb-3">{t(listing.description)}</div>
      <div className="flex flex-wrap gap-[5px] mb-3">
        {listing.chips.map((chip, i) => (
          <Chip key={i}>{t(chip)}</Chip>
        ))}
      </div>

      {isMine ? (
        <div>
          <div className="flex items-baseline justify-between mb-[8px]">
            <span className="font-display font-bold text-eyebrow tracking-[0.13em] uppercase text-bronze">
              {ui('market.requests')}
            </span>
            <span className="font-serif text-xs text-faint italic">{ui('market.your_listing')}</span>
          </div>
          {listing.interests.length === 0 ? (
            <div className="font-serif text-xs text-faint">{ui('market.no_requests')}</div>
          ) : (
            <>
              <div className="flex flex-col gap-[6px]">
                {listing.interests.map((i) => (
                  <RequestRow
                    key={i.id}
                    interest={i}
                    actionable={!isMatched}
                    busyKey={busyKey}
                    onAccept={() => onAccept(i)}
                    onReject={() => onReject(i)}
                  />
                ))}
              </div>
              {!isMatched && listing.interests.some((i) => i.status === 'pending') && (
                <div className="font-serif text-xs text-faint italic mt-[8px]">
                  {ui('market.pick_one')}
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <Button
          tone="bronze"
          variant="outline"
          size="sm"
          onClick={onInterest}
          disabled={mine !== null || isMatched}
          icon={<Icon name="arrow-right" size={13} color="var(--color-bronze-deep)" />}
        >
          {viewerLabel}
        </Button>
      )}

      {listing.suggested_profile && (
        <div className="mt-3 pt-3 border-t border-line-soft">
          <div className="flex items-center gap-[6px] mb-[6px]">
            <Icon name="shield" size={12} color="var(--color-bronze)" />
            <span className="font-display font-bold text-eyebrow tracking-[0.13em] uppercase text-bronze">{ui('market.curator_suggestion')}</span>
          </div>
          <div className="flex items-center gap-[10px]">
            <Avatar initials={listing.suggested_profile.initials} id={listing.suggested_profile.id} size={30} />
            <div className="flex-1 min-w-0">
              <div className="font-serif font-semibold text-xs text-ink">{listing.suggested_profile.full_name}</div>
              <div className="font-serif text-xs text-faint italic leading-[1.4]">{t(listing.suggested_reason)}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

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
    <div className="sheet p-[16px] mb-3">
      <div className="flex items-center gap-[6px] mb-[10px]">
        <Icon name="check" size={14} color="var(--color-green)" />
        <span className="font-display font-bold text-eyebrow tracking-[0.13em] uppercase text-green">{ui('market.matched')}</span>
      </div>
      <div className="flex items-center gap-3 mb-3">
        <Avatar initials={match.initiator?.initials ?? '?'} id={match.initiator_profile_id} size={36} />
        <div className="font-serif text-sm text-muted">&harr;</div>
        <Avatar initials={match.matched?.initials ?? '?'} id={match.matched_profile_id} size={36} />
        <div className="flex-1 min-w-0">
          <div className="font-serif font-semibold text-sm text-ink">{match.initiator?.full_name ?? ui('common.unknown_member')} & {match.matched?.full_name ?? ui('common.unknown_member')}</div>
          <div className="font-serif text-xs text-muted truncate">{t(match.listing?.title)}</div>
        </div>
      </div>
      {match.next_step && (
        <div className="p-[10px] rounded-xs mb-3" style={{ background: 'var(--color-green-wash)' }}>
          <div className="font-serif text-xs text-green leading-[1.5]">
            <strong>{ui('market.next_step')}</strong> {t(match.next_step)}
          </div>
        </div>
      )}
      {error && (
        <div className="mb-2 flex items-center gap-[7px] font-serif text-xs text-red">
          <Icon name="x" size={14} color="var(--color-red)" />{error}
        </div>
      )}
      <Button tone="green" size="sm" onClick={markMet} loading={busy} disabled={done} icon={<Icon name="check" size={13} color="#fff" />}>
        {done ? ui('market.met') : busy ? ui('market.saving') : ui('market.we_met')}
      </Button>
    </div>
  );
}

function InterestModal({
  listing,
  viewerProfileId,
  lang,
  onClose,
  onDone,
}: {
  listing: ListingWithCreator;
  viewerProfileId: string | null;
  lang: Language;
  onClose: () => void;
  onDone: () => void;
}) {
  const { ui } = useI18n();
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
    <div className="fixed inset-0 z-[100] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative w-full max-w-[430px] bg-white rounded-t-[18px] p-[22px] animate-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-bold text-eyebrow tracking-[0.14em] uppercase text-bronze">{ui('market.express_interest')}</h3>
          <button type="button" onClick={onClose} className="w-7 h-7 grid place-items-center rounded-full bg-transparent border border-line cursor-pointer">
            <Icon name="x" size={14} color="var(--color-ink)" />
          </button>
        </div>
        <label className="block mb-4">
          <span className="font-display font-bold text-eyebrow tracking-[0.13em] uppercase text-bronze mb-[7px] block">
            {ui('market.message_optional')}
          </span>
          <textarea
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            placeholder={ui('market.why_interested')}
            rows={3}
            className="parch-input"
          />
        </label>
        {error && (
          <div className="mb-3 flex items-center gap-[7px] font-serif text-xs text-red">
            <Icon name="x" size={14} color="var(--color-red)" />{error}
          </div>
        )}
        <Button tone="bronze" onClick={send} loading={busy} icon={<Icon name="arrow-right" size={15} color="var(--color-dark)" />}>
          {busy ? ui('market.sending') : ui('market.send_interest')}
        </Button>
      </div>
    </div>
  );
}

function PublishModal({
  viewerProfileId,
  lang,
  onClose,
  onDone,
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
    <div className="fixed inset-0 z-[100] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative w-full max-w-[430px] bg-white rounded-t-[18px] p-[22px] animate-sheet max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-bold text-eyebrow tracking-[0.14em] uppercase text-bronze">{ui('market.new_listing')}</h3>
          <button type="button" onClick={onClose} className="w-7 h-7 grid place-items-center rounded-full bg-transparent border border-line cursor-pointer">
            <Icon name="x" size={14} color="var(--color-ink)" />
          </button>
        </div>

        <Segmented
          items={[
            { id: 'wanted', label: ui('market.wanted') },
            { id: 'offer', label: ui('market.offers') },
          ]}
          value={type}
          onChange={(id) => setType(id as 'wanted' | 'offer')}
        />

        <label className="block mb-3">
          <span className="font-display font-bold text-eyebrow tracking-[0.13em] uppercase text-bronze mb-[7px] block">{ui('market.listing_title')}</span>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={ui('market.title_placeholder')} className="parch-input" />
        </label>
        <label className="block mb-4">
          <span className="font-display font-bold text-eyebrow tracking-[0.13em] uppercase text-bronze mb-[7px] block">{ui('market.description')}</span>
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={ui('market.desc_placeholder')} rows={4} className="parch-input" />
        </label>

        {error && (
          <div className="mb-3 flex items-center gap-[7px] font-serif text-xs text-red">
            <Icon name="x" size={14} color="var(--color-red)" />{error}
          </div>
        )}
        <Button tone="ink" onClick={publish} loading={busy} icon={<Icon name="arrow-right" size={15} color="#fff" />}>
          {busy ? ui('market.publishing') : ui('market.publish')}
        </Button>
      </div>
    </div>
  );
}

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
   * Accepting is three writes with no transaction available over PostgREST, so
   * the match row goes first: if it fails nothing has changed and a retry is
   * clean. The insert is guarded against an existing open match so a retry
   * after a partial failure can't produce a duplicate pairing.
   */
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

  if (loading) return <Loading />;
  if (loadError) return <LoadError message={loadError} onRetry={() => window.location.reload()} />;

  return (
    <div className="px-[18px] pt-[22px]">
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-display font-bold text-eyebrow tracking-[0.14em] uppercase text-bronze">{ui('market.title')}</h1>
        <button
          type="button"
          onClick={() => setShowPublish(true)}
          className="flex items-center gap-[5px] py-[6px] px-3 rounded-full bg-transparent border border-line cursor-pointer"
        >
          <Icon name="plus" size={13} color="var(--color-bronze)" />
          <span className="font-display font-bold text-eyebrow tracking-[0.10em] uppercase text-bronze">{ui('market.new')}</span>
        </button>
      </div>

      {error && (
        <div className="mb-3 flex items-center gap-[7px] font-serif text-xs text-red">
          <Icon name="x" size={14} color="var(--color-red)" />{error}
        </div>
      )}

      <Segmented
        items={[
          { id: 'wanted', label: ui('market.wanted') },
          { id: 'offer', label: ui('market.offers') },
          { id: 'mine', label: awaitingReply > 0 ? `${ui('market.mine')} (${awaitingReply})` : ui('market.mine') },
          { id: 'matches', label: ui('market.matches') },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'wanted' && (
        <div>
          {wanted.length === 0 && <EmptyState text={ui('market.no_wanted')} />}
          {wanted.map((l) => (
            <MarketCard
              key={l.id}
              listing={l}
              viewerProfileId={viewerProfileId}
              busyKey={busyKey}
              onInterest={() => setInterestFor(l)}
              onAccept={acceptInterest}
              onReject={rejectInterest}
            />
          ))}
        </div>
      )}

      {tab === 'offer' && (
        <div>
          {offers.length === 0 && <EmptyState text={ui('market.no_offers')} />}
          {offers.map((l) => (
            <MarketCard
              key={l.id}
              listing={l}
              viewerProfileId={viewerProfileId}
              busyKey={busyKey}
              onInterest={() => setInterestFor(l)}
              onAccept={acceptInterest}
              onReject={rejectInterest}
            />
          ))}
        </div>
      )}

      {tab === 'mine' && (
        <div>
          <div className="flex items-baseline justify-between mb-[10px]">
            <span className="font-display font-bold text-eyebrow tracking-[0.13em] uppercase text-bronze">
              {ui('market.received')}
            </span>
            {awaitingReply > 0 && (
              <span className="font-serif text-xs text-red">
                {awaitingReply} {ui('market.awaiting_you')}
              </span>
            )}
          </div>
          {myListings.length === 0 ? (
            <div className="font-serif text-sm text-muted mb-6">{ui('market.nothing_posted')}</div>
          ) : (
            myListings.map((l) => (
              <MarketCard
                key={l.id}
                listing={l}
                viewerProfileId={viewerProfileId}
                busyKey={busyKey}
                onInterest={() => setInterestFor(l)}
                onAccept={acceptInterest}
                onReject={rejectInterest}
              />
            ))
          )}

          <div className="font-display font-bold text-eyebrow tracking-[0.13em] uppercase text-bronze mt-6 mb-[10px]">
            {ui('market.sent')}
          </div>
          {mySent.length === 0 ? (
            <div className="font-serif text-sm text-muted pb-6">{ui('market.nothing_sent')}</div>
          ) : (
            <div className="flex flex-col gap-[8px] pb-6">
              {mySent.map((l) => <SentRow key={l.id} listing={l} />)}
            </div>
          )}
        </div>
      )}

      {tab === 'matches' && (
        <div>
          {liveMatches.length === 0 && <EmptyState text={ui('market.no_matches')} />}
          {liveMatches.map((m) => (
            <MatchCard key={m.id} match={m} onDone={() => {}} />
          ))}
        </div>
      )}

      {interestFor && (
        <InterestModal
          listing={interestFor}
          viewerProfileId={viewerProfileId}
          lang={lang}
          onClose={() => setInterestFor(null)}
          onDone={() => {}}
        />
      )}
      {showPublish && (
        <PublishModal
          viewerProfileId={viewerProfileId}
          lang={lang}
          onClose={() => setShowPublish(false)}
          onDone={() => {}}
        />
      )}
    </div>
  );
}

function Loading() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-8 h-8 border-2 border-bronze border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="text-center py-10">
      <Icon name="search" size={28} color="var(--color-faint)" className="mx-auto mb-3" />
      <div className="font-serif text-sm text-muted">{text}</div>
    </div>
  );
}
