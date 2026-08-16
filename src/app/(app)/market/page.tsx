'use client';

import { useState } from 'react';
import { Avatar, Icon, Chip, Button } from '@/components/ui';
import { useI18n } from '@/lib/i18n/context';
import { useDirectory } from '@/lib/supabase/directory';
import { createClient } from '@/lib/supabase/client';
import type { ListingWithCreator, MatchWithParties, Language } from '@/types';

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

function MarketCard({
  listing,
  viewerProfileId,
  onInterest,
}: {
  listing: ListingWithCreator;
  viewerProfileId: string | null;
  onInterest: () => void;
}) {
  const { t, ui } = useI18n();
  const isMine = listing.creator_profile_id === viewerProfileId;
  return (
    <div className="sheet p-[16px] mb-3">
      <div className="flex items-start gap-3 mb-[10px]">
        <Avatar initials={listing.creator?.initials ?? '?'} id={listing.creator_profile_id} size={38} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-[2px]">
            <Chip variant="wash" tone={listing.type === 'wanted' ? 'red' : 'green'}>
              {listing.type === 'wanted' ? ui('market.wanted') : ui('market.offers')}
            </Chip>
            {listing.capacity && (
              <span className="font-serif text-eyebrow text-faint">
                {listing.interests_count ?? 0}/{listing.capacity} {ui('market.spots')}
              </span>
            )}
          </div>
          <div className="font-serif font-semibold text-base text-ink leading-[1.35]">{t(listing.title)}</div>
          <div className="font-serif text-xs text-muted mt-[2px]">{listing.creator?.full_name}</div>
        </div>
      </div>
      <div className="font-serif text-sm text-muted leading-[1.6] mb-3">{t(listing.description)}</div>
      <div className="flex flex-wrap gap-[5px] mb-3">
        {listing.chips.map((chip, i) => (
          <Chip key={i}>{t(chip)}</Chip>
        ))}
      </div>
      {isMine ? (
        <div className="font-serif text-xs text-faint italic">
          {ui('market.your_listing')} &middot; {listing.interests_count} {ui('market.interested_count')}
        </div>
      ) : (
        <Button
          tone="bronze"
          variant="outline"
          size="sm"
          onClick={onInterest}
          disabled={listing.viewer_interested}
          icon={<Icon name="arrow-right" size={13} color="var(--color-bronze-deep)" />}
        >
          {listing.viewer_interested ? ui('market.interest_sent') : ui('market.interested')}
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
  const done = match.status === 'completed';

  const markMet = async () => {
    setBusy(true);
    await createClient()
      .from('matches')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', match.id);
    setBusy(false);
    onDone();
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
          <div className="font-serif font-semibold text-sm text-ink">{match.initiator?.full_name} & {match.matched?.full_name}</div>
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
      <Button tone="green" size="sm" onClick={markMet} disabled={busy || done} icon={<Icon name="check" size={13} color="#fff" />}>
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

  const send = async () => {
    if (!viewerProfileId) { setError(ui('market.profile_loading')); return; }
    setBusy(true);
    setError('');
    const { error: err } = await createClient().from('market_interests').insert({
      listing_id: listing.id,
      profile_id: viewerProfileId,
      message: msg.trim() ? { [lang]: msg.trim() } : null,
    });
    setBusy(false);
    if (err) {
      setError(err.code === '23505' ? ui('market.already_interested') : err.message);
      return;
    }
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
        <Button tone="bronze" onClick={send} disabled={busy} icon={<Icon name="arrow-right" size={15} color="var(--color-dark)" />}>
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

  const publish = async () => {
    if (!title.trim()) { setError(ui('market.need_title')); return; }
    if (!viewerProfileId) { setError(ui('market.profile_loading')); return; }
    setBusy(true);
    setError('');
    const { error: err } = await createClient().from('market_listings').insert({
      creator_profile_id: viewerProfileId,
      type,
      title: { [lang]: title.trim() },
      description: { [lang]: desc.trim() },
      status: 'open',
    });
    setBusy(false);
    if (err) { setError(err.message); return; }
    onDone();
    onClose();
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
        <Button tone="ink" onClick={publish} disabled={busy} icon={<Icon name="arrow-right" size={15} color="#fff" />}>
          {busy ? ui('market.publishing') : ui('market.publish')}
        </Button>
      </div>
    </div>
  );
}

export default function MarketPage() {
  const { lang, ui } = useI18n();
  const { listings, matches, viewerProfileId, loading, refetch } = useDirectory();
  const [tab, setTab] = useState('wanted');
  const [interestFor, setInterestFor] = useState<ListingWithCreator | null>(null);
  const [showPublish, setShowPublish] = useState(false);

  const wanted = listings.filter((l) => l.type === 'wanted');
  const offers = listings.filter((l) => l.type === 'offer');

  if (loading) return <Loading />;

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

      <Segmented
        items={[
          { id: 'wanted', label: ui('market.wanted') },
          { id: 'offer', label: ui('market.offers') },
          { id: 'matches', label: ui('market.matches') },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'wanted' && (
        <div>
          {wanted.length === 0 && <EmptyState text={ui('market.no_wanted')} />}
          {wanted.map((l) => (
            <MarketCard key={l.id} listing={l} viewerProfileId={viewerProfileId} onInterest={() => setInterestFor(l)} />
          ))}
        </div>
      )}

      {tab === 'offer' && (
        <div>
          {offers.length === 0 && <EmptyState text={ui('market.no_offers')} />}
          {offers.map((l) => (
            <MarketCard key={l.id} listing={l} viewerProfileId={viewerProfileId} onInterest={() => setInterestFor(l)} />
          ))}
        </div>
      )}

      {tab === 'matches' && (
        <div>
          {matches.length === 0 && <EmptyState text={ui('market.no_matches')} />}
          {matches.map((m) => (
            <MatchCard key={m.id} match={m} onDone={refetch} />
          ))}
        </div>
      )}

      {interestFor && (
        <InterestModal
          listing={interestFor}
          viewerProfileId={viewerProfileId}
          lang={lang}
          onClose={() => setInterestFor(null)}
          onDone={refetch}
        />
      )}
      {showPublish && (
        <PublishModal
          viewerProfileId={viewerProfileId}
          lang={lang}
          onClose={() => setShowPublish(false)}
          onDone={refetch}
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
