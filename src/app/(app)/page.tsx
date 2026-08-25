'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Avatar, Icon, Chip, WaxSeal, LoadError } from '@/components/ui';
import { CATEGORY_COLORS } from '@/lib/seed';
import { CATEGORIES } from '@/lib/i18n/translations';
import { useI18n } from '@/lib/i18n/context';
import { useListings, usePeople } from '@/lib/data/views';
import { useNotifications } from '@/lib/data/notifications';
import { NotificationPanel } from '@/components/notification-panel';

function SectionHeading({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between mb-[10px]">
      <h2 className="font-display font-bold text-eyebrow tracking-[0.14em] uppercase" style={{ color: 'var(--color-bronze)' }}>
        {children}
      </h2>
      {action}
    </div>
  );
}

function greetingKey(hour: number) {
  if (hour < 12) return 'home.morning';
  if (hour < 18) return 'home.afternoon';
  return 'home.evening';
}

export default function HomePage() {
  const router = useRouter();
  const { t, ui, lang } = useI18n();
  const { listings, viewerProfileId, loading, error } = useListings();
  const { people: profiles } = usePeople();
  const [shuffleIdx, setShuffleIdx] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const notifications = useNotifications();
  const unreadCount = notifications.unreadCount;

  /**
   * Opening the panel is what marks the batch read — matching what the member
   * has actually now seen. Deliberately not on hover or on page load.
   */
  const openNotifications = async () => {
    setShowNotifications(true);
    // Refresh first. The hook loads on mount and when the tab regains focus,
    // so on a tab that never lost focus the panel would otherwise show a
    // cached list and mark THAT read, silently swallowing anything that
    // arrived in between.
    // Only mark read if the refresh actually succeeded. Marking an inbox read
    // that we failed to load would hide mail the member never saw.
    if (await notifications.refetch()) notifications.markRead();
  };
  // Resolved after mount — the server's clock would cause a hydration mismatch.
  const [hour, setHour] = useState<number | null>(null);
  useEffect(() => setHour(new Date().getHours()), []);

  const me = profiles.find((p) => p.id === viewerProfileId);
  // Only surface other members in discovery — seeing yourself is noise.
  const others = useMemo(
    () => profiles.filter((p) => p.id !== viewerProfileId && p.is_active),
    [profiles, viewerProfileId]
  );

  const shuffled = useMemo(() => {
    const arr = [...others];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = (shuffleIdx * 7 + i * 3) % (i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }, [others, shuffleIdx]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-bronze border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) return <LoadError message={error} onRetry={() => window.location.reload()} />;

  const discoveryPerson = shuffled[0];
  const randomWorld = discoveryPerson?.hidden_worlds[0];
  const suggested = others.filter((p) => p.id !== discoveryPerson?.id).slice(0, 5);
  const recentListings = listings.slice(0, 3);

  const worldCategory = CATEGORIES.find((c) => c.id === randomWorld?.category);
  const worldColor = CATEGORY_COLORS[randomWorld?.category ?? 'craft'] ?? '#8f7044';
  const firstName = me?.full_name?.split(' ')[0] ?? ui('home.explorer');

  return (
    <div className="px-[18px] pt-[22px]">
      {/* Masthead */}
      <div className="flex items-center justify-between mb-[22px]">
        <div>
          <WaxSeal size={28} label="R" />
        </div>
        <button
          type="button"
          onClick={openNotifications}
          aria-label={ui('notif.title')}
          className="relative w-9 h-9 grid place-items-center rounded-full bg-transparent border border-line cursor-pointer"
        >
          <Icon name="bell" size={17} color="var(--color-muted)" />
          {unreadCount > 0 && (
            <span className="absolute -top-[3px] -right-[3px] min-w-[17px] h-[17px] px-[4px] grid place-items-center rounded-full bg-red font-display font-bold text-[10px] leading-none text-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </div>

      <h1 className="font-serif text-2xl text-ink mb-[22px] leading-[1.3]">
        {hour === null ? ui('home.welcome') : ui(greetingKey(hour))}, <span className="italic">{firstName}</span>
      </h1>

      {/* Discover someone new */}
      <div className="sheet p-[18px] mb-5">
        <SectionHeading
          action={
            <button
              type="button"
              onClick={() => setShuffleIdx((i) => i + 1)}
              className="border-none bg-transparent cursor-pointer font-serif text-xs text-bronze underline underline-offset-[3px]"
            >
              {ui('home.shuffle')}
            </button>
          }
        >
          {ui('home.discover')}
        </SectionHeading>
        {discoveryPerson ? (
          <button
            type="button"
            onClick={() => router.push(`/people/${discoveryPerson.id}`)}
            className="w-full flex items-center gap-[14px] bg-transparent border-none cursor-pointer text-left p-0"
          >
            <Avatar initials={discoveryPerson.initials} id={discoveryPerson.id} size={52} />
            <div className="flex-1 min-w-0">
              <div className="font-serif font-semibold text-base text-ink truncate">
                {discoveryPerson.full_name}
              </div>
              <div className="font-serif text-xs text-muted truncate">{t(discoveryPerson.headline)}</div>
              {randomWorld && (
                <div className="flex items-center gap-[6px] mt-[5px]">
                  <span className="w-[6px] h-[6px] rounded-full" style={{ background: worldColor }} />
                  <span className="font-serif text-xs text-faint truncate">{t(randomWorld.name)}</span>
                </div>
              )}
            </div>
            <Icon name="chevron-right" size={16} color="var(--color-faint)" />
          </button>
        ) : (
          <div className="font-serif text-sm text-muted">
            {ui('home.first_member')}
          </div>
        )}
      </div>

      {/* Hidden World of the day */}
      {randomWorld && (
      <div className="sheet-dark p-[18px] mb-5">
        <SectionHeading>
          <span className="text-dark-muted">{ui('home.hidden_world_day')}</span>
        </SectionHeading>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full grid place-items-center" style={{ background: worldColor, opacity: 0.9 }}>
            <Icon name="star" size={18} color="#fdf0e6" />
          </div>
          <div>
            <div className="font-serif font-semibold text-base" style={{ color: 'var(--color-dark-paper)' }}>
              {t(randomWorld?.name)}
            </div>
            <div className="font-serif text-xs" style={{ color: 'var(--color-dark-muted)' }}>
              {(lang === 'zh' ? worldCategory?.zh : worldCategory?.en) ?? ''} &middot; {discoveryPerson.full_name}
            </div>
          </div>
        </div>
      </div>
      )}

      {/* You may not know them yet */}
      <SectionHeading
        action={
          <button
            type="button"
            onClick={() => router.push('/people')}
            className="border-none bg-transparent cursor-pointer font-serif text-xs text-bronze underline underline-offset-[3px]"
          >
            {ui('home.see_all')}
          </button>
        }
      >
        {ui('home.may_not_know')}
      </SectionHeading>
      <div className="flex gap-3 overflow-x-auto no-scrollbar pb-4 -mx-[18px] px-[18px]">
        {suggested.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => router.push(`/people/${p.id}`)}
            className="shrink-0 w-[120px] bg-transparent border-none cursor-pointer p-0 text-left"
          >
            <div className="sheet p-3 flex flex-col items-center text-center">
              <Avatar initials={p.initials} id={p.id} size={42} className="mb-2" />
              <div className="font-serif font-semibold text-xs text-ink truncate w-full">{p.full_name}</div>
              <div className="font-serif text-eyebrow text-muted truncate w-full mt-[2px]">{t(p.headline)}</div>
            </div>
          </button>
        ))}
      </div>

      {/* In the Market now */}
      <SectionHeading
        action={
          <button
            type="button"
            onClick={() => router.push('/market')}
            className="border-none bg-transparent cursor-pointer font-serif text-xs text-bronze underline underline-offset-[3px]"
          >
            {ui('home.see_all')}
          </button>
        }
      >
        {ui('home.in_market')}
      </SectionHeading>
      <div className="flex flex-col gap-3 pb-6">
        {recentListings.map((listing) => (
          <button
            key={listing.id}
            type="button"
            onClick={() => router.push('/market')}
            className="sheet p-[14px] w-full flex items-start gap-3 bg-transparent border-none cursor-pointer text-left"
          >
            <Avatar initials={listing.creator?.initials ?? '?'} id={listing.creator_profile_id} size={36} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-[3px]">
                <Chip variant="wash" tone={listing.type === 'wanted' ? 'red' : 'green'}>
                  {listing.type === 'wanted' ? ui('market.wanted') : ui('market.offer_one')}
                </Chip>
              </div>
              <div className="font-serif font-semibold text-sm text-ink truncate">{t(listing.title)}</div>
              <div className="font-serif text-xs text-muted mt-[2px]">{listing.creator?.full_name ?? ui('common.unknown_member')}</div>
            </div>
            <Icon name="chevron-right" size={14} color="var(--color-faint)" className="mt-1" />
          </button>
        ))}
      </div>

      {showNotifications && (
        <NotificationPanel
          items={notifications.items}
          loading={notifications.loading}
          error={notifications.error}
          onClose={() => setShowNotifications(false)}
        />
      )}
    </div>
  );
}
