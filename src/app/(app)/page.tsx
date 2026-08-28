'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n/context';
import { useListings, usePeople } from '@/lib/data/views';
import { LoadError } from '@/components/ui';
import { Page } from '@/components/pixel/shell';
import {
  Avatar, Bi, BiText, Button, EmptyState, Panel, ParchmentNote, PixelSpinner, Ribbon, SecAction, SectionHeader, Sprite, StatRow, StatusChip,
} from '@/components/pixel';

/**
 * Home — the discovery surface.
 *
 * Follows the design's composition: hero panel, a shuffled member spotlight,
 * a Hidden World, and a glance at the market. The design's stat row is kept
 * but reduced to the three numbers we can actually count — it also carries
 * badges and XP, which this app has never had.
 */
export default function HomePage() {
  const router = useRouter();
  const { t, ui, lang } = useI18n();
  const { listings, viewerProfileId, loading, error } = useListings();
  const { people: profiles } = usePeople();
  const [shuffleIdx, setShuffleIdx] = useState(0);

  // Resolved after mount — the server's clock would cause a hydration mismatch.
  const [hour, setHour] = useState<number | null>(null);
  useEffect(() => setHour(new Date().getHours()), []);

  const me = profiles.find((p) => p.id === viewerProfileId);
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

  const spot = shuffled[0];
  const worldCount = others.reduce((n, p) => n + p.hidden_worlds.length, 0);

  // A Hidden World from someone else, rotated with the shuffle so the page
  // never feels static between visits.
  const worldPool = useMemo(
    () => others.flatMap((p) => p.hidden_worlds.filter((w) => w.visibility === 'members').map((w) => ({ p, w }))),
    [others]
  );
  const pick = worldPool.length ? worldPool[(shuffleIdx * 3 + 1) % worldPool.length] : null;

  const openMarket = listings.filter((l) => l.status === 'open' && l.creator_profile_id !== viewerProfileId);
  const wanted = openMarket.find((l) => l.type === 'wanted');
  const offer = openMarket.find((l) => l.type === 'offer');

  if (loading) {
    return <div className="grid place-items-center" style={{ minHeight: '50vh' }}><PixelSpinner size={20} color="var(--color-gold)" /></div>;
  }
  if (error) return <LoadError message={error} onRetry={() => window.location.reload()} />;

  const greeting = hour === null ? ui('home.welcome') : ui(hour < 12 ? 'home.morning' : hour < 18 ? 'home.afternoon' : 'home.evening');

  return (
    <Page>
      {/* hero */}
      <Panel pad={0} innerRule={false} style={{ overflow: 'hidden' }}>
        <div style={{
          height: 176, display: 'grid', placeItems: 'center',
          background: 'linear-gradient(180deg, var(--color-mist-tint), var(--color-card))',
          borderBottom: '2px solid var(--color-navy-900)',
        }}>
          <Sprite name="fountain" kind="sprites" size={150} alt="" />
        </div>
        <div style={{ padding: 16 }}>
          <Bi en="The Republic Today" zh="今日共和国" color="var(--color-gold)" />
          <h1 style={{
            margin: '10px 0 0', fontFamily: 'var(--font-display)', fontWeight: 700,
            fontSize: 'var(--text-h2)', lineHeight: 1.4, letterSpacing: 'var(--tracking-display)',
            textTransform: 'uppercase', color: 'var(--color-ink)',
          }}>
            {greeting}{me?.full_name ? `, ${me.full_name}` : ''}
          </h1>
          <div style={{ marginTop: 12 }}>
            <BiText lang={lang}
              en="Someone here knows something you would never guess. Hidden World over resume."
              zh="这里总有人藏着你猜不到的东西。隐藏世界，胜过简历。" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 10, marginTop: 16 }}>
            <Button tone="primary" size="lg" block cn="发现成员" onClick={() => router.push('/people')}>Discover People</Button>
            <Button tone="secondary" size="lg" block cn="去市场" onClick={() => router.push('/market')}>Open the Market</Button>
          </div>
        </div>
      </Panel>

      {/* the numbers we can actually count, in the design's divided strip */}
      <StatRow stats={[
        // A curator's RLS lets them read invited-but-not-yet-arrived rows too,
        // and those are not founders yet.
        { icon: 'stat-friends', value: profiles.filter((p) => p.is_active).length, label: 'Founders', cn: '创始人' },
        { icon: 'stat-worlds', value: worldCount, label: 'Worlds', cn: '隐藏世界' },
        { icon: 'handshake', value: openMarket.length, label: 'Open', cn: '进行中' },
      ]} />

      {/* discover someone new */}
      {spot && (
        <section>
          <SectionHeader icon="nav-discover" cn="认识新的人" className="mb-3"
            trailing={
              <SecAction en="Shuffle" zh="换一个" onClick={() => setShuffleIdx((i) => i + 1)} />
            }>
            Discover
          </SectionHeader>
          <Panel pad={14} corners>
            <div className="flex items-start" style={{ gap: 13 }}>
              <Avatar initials={spot.initials} id={spot.id} size={64} featured={spot.is_featured} />
              <div style={{ minWidth: 0, flex: 1 }}>
                {spot.founder_no !== null ? (
                  <Bi en={`Founder No. ${String(spot.founder_no).padStart(2, '0')}`} color="var(--color-gold)" />
                ) : null}
                <div style={{
                  fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-h2)',
                  letterSpacing: 'var(--tracking-display)', color: 'var(--color-ink)', lineHeight: 1.25, marginTop: 5,
                }}>{spot.full_name}</div>
                {spot.native_name ? <div className="rof-cjk" style={{ fontSize: 'var(--text-h3)', color: 'var(--color-ink-2)', marginTop: 3 }}>{spot.native_name}</div> : null}
                <div style={{ marginTop: 8 }}><StatusChip tone="neutral">{spot.class_name}</StatusChip></div>
              </div>
            </div>
            {spot.hidden_worlds[0] && (
              <div style={{ marginTop: 12, padding: '10px 12px', background: 'var(--color-white)', border: '2px dashed var(--color-line-soft)' }}>
                <Bi en="Hidden World" zh="隐藏世界" color="var(--color-gold)" />
                <div style={{ fontSize: 'var(--text-body)', color: 'var(--color-ink)', marginTop: 6 }}>{t(spot.hidden_worlds[0].name)}</div>
              </div>
            )}
            <div style={{ marginTop: 12 }}>
              <Button tone="primary" size="lg" block cn="查看档案" onClick={() => router.push(`/people/${spot.id}`)}>View Dossier</Button>
            </div>
          </Panel>
        </section>
      )}

      {/* hidden world of the day */}
      {pick && (
        <section>
          <SectionHeader icon="star" cn="今日隐藏世界" className="mb-3">Hidden World</SectionHeader>
          <Panel pad={14} ariaLabel={`${ui('dossier.title')} — ${pick.p.full_name}`}
            onClick={() => router.push(`/people/${pick.p.id}`)}>
            <Bi en="Hidden World" zh="隐藏世界" color="var(--color-gold)" />
            <div style={{
              fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-h3)',
              letterSpacing: 'var(--tracking-display)', textTransform: 'uppercase',
              color: 'var(--color-ink)', marginTop: 7, lineHeight: 1.4,
            }}>{t(pick.w.name)}</div>
            <div className="flex items-center" style={{ gap: 9, marginTop: 11 }}>
              <Avatar initials={pick.p.initials} id={pick.p.id} size={30} />
              <span style={{ fontSize: 'var(--text-body)', color: 'var(--color-muted)' }}>
                {pick.p.full_name}{pick.p.native_name ? ` · ${pick.p.native_name}` : ''}
              </span>
            </div>
          </Panel>
        </section>
      )}

      {/* market glance */}
      <section>
        <SectionHeader icon="nav-auction" cn="市场动态" className="mb-3"
          trailing={
            <SecAction en="All" zh="全部" onClick={() => router.push('/market')} />
          }>
          Market
        </SectionHeader>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 12 }}>
          {[wanted, offer].filter(Boolean).map((l) => (
            <Panel key={l!.id} pad={13} ariaLabel={ui('market.title')}
                onClick={() => router.push('/market')}>
              <div className="flex items-center" style={{ gap: 7, marginBottom: 8 }}>
                <StatusChip tone={l!.type === 'wanted' ? 'wanted' : 'offer'} cn={l!.type === 'wanted' ? '寻找' : '提供'}>
                  {l!.type === 'wanted' ? 'Wanted' : 'Offer'}
                </StatusChip>
                <StatusChip tone="open" cn="进行中">Open</StatusChip>
              </div>
              <div style={{
                fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-h3)',
                letterSpacing: 'var(--tracking-display)', textTransform: 'uppercase',
                color: 'var(--color-ink)', lineHeight: 1.4,
              }}>{t(l!.title)}</div>
              <div style={{ fontSize: 'var(--text-body)', color: 'var(--color-muted)', marginTop: 6 }}>
                {l!.creator?.full_name ?? ui('common.unknown_member')}
              </div>
            </Panel>
          ))}
          {!wanted && !offer && <EmptyState title="Nothing open right now" cn="市场暂时安静" />}
        </div>
      </section>

      {/* the Republic's own voice: a notched ribbon, then a taped slip */}
      <Ribbon cn="一个共和国，无限连接">One Republic, Infinite Connections</Ribbon>

      <ParchmentNote title="Reality First" cn="现实优先">
        {lang === 'zh'
          ? '配对之后，系统就退场。当现实更容易时，共和国让路。'
          : 'Match, then disappear. When reality is easier, the Republic gets out of the way.'}
      </ParchmentNote>
    </Page>
  );
}
