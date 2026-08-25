'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n/context';
import { CATEGORIES } from '@/lib/i18n/translations';
import { usePeople } from '@/lib/data/views';
import { CLASSES } from '@/lib/classes';
import { LoadError } from '@/components/ui';
import { Page } from '@/components/pixel/shell';
import { Avatar, Bi, EmptyState, Panel, PixelSpinner, StatusChip } from '@/components/pixel';

/**
 * The founder directory.
 *
 * Search, class filter and category filter all behave exactly as before —
 * this is a reskin, not a rework. The design's "guild" grouping is not used
 * because our members belong to classes, not guilds.
 */
export default function PeoplePage() {
  const router = useRouter();
  const { t, ui, lang } = useI18n();
  const { people: profiles, loading, error } = usePeople();
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState<string>('all');
  const [catFilter, setCatFilter] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let list = profiles.filter((p) => p.is_active);
    if (classFilter !== 'all') list = list.filter((p) => p.class_name === classFilter);
    if (catFilter) list = list.filter((p) => p.hidden_worlds.some((hw) => hw.category === catFilter));
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((p) => {
        const hay = [
          p.full_name, p.native_name, t(p.headline), t(p.role), t(p.intro),
          ...p.hidden_worlds.map((hw) => t(hw.name)),
          ...p.ask_topics.map((a) => t(a)),
          ...p.want_topics.map((w) => t(w)),
        ].filter(Boolean).join(' ').toLowerCase();
        return hay.includes(q);
      });
    }
    return list;
  }, [profiles, search, classFilter, catFilter, t]);

  if (loading) {
    return <div className="grid place-items-center" style={{ minHeight: '50vh' }}><PixelSpinner size={20} color="var(--color-gold)" /></div>;
  }
  if (error) return <LoadError message={error} onRetry={() => window.location.reload()} />;

  const CLASS_TABS = [{ id: 'all', label: ui('people.all') }, ...CLASSES.map((c) => ({ id: c, label: c }))];

  return (
    <Page>
      {/* search */}
      <input
        className="rof-input"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={ui('people.search')}
      />

      {/* class filter — a hard-edged segmented control, not pills */}
      <div style={{ display: 'flex', border: '2px solid var(--color-navy-900)', boxShadow: 'var(--shadow-px)' }}>
        {CLASS_TABS.map((c) => {
          const on = classFilter === c.id;
          return (
            <button key={c.id} type="button" onClick={() => setClassFilter(c.id)}
              className="rof-label flex-1"
              style={{
                padding: '9px 4px', border: 'none', borderRadius: 0, cursor: 'pointer', lineHeight: 1,
                background: on ? 'var(--color-navy-900)' : 'transparent',
                color: on ? 'var(--color-gold)' : 'var(--color-muted)',
              }}>{c.label}</button>
          );
        })}
      </div>

      {/* category filter */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {CATEGORIES.map((cat) => {
          const on = catFilter === cat.id;
          return (
            <button key={cat.id} type="button" onClick={() => setCatFilter(on ? null : cat.id)} aria-pressed={on}
              className="rof-label inline-flex items-baseline"
              style={{
                gap: 5, padding: '5px 8px', cursor: 'pointer', borderRadius: 0,
                background: on ? `var(--color-cat-${cat.id})` : 'var(--color-white)',
                color: on ? '#F5EDD8' : 'var(--color-muted)',
                border: `2px solid ${on ? `var(--color-cat-${cat.id})` : 'var(--color-line-soft)'}`,
                boxShadow: on ? 'var(--shadow-press)' : 'none',
                transition: 'none',
              }}>
              <span style={{ whiteSpace: 'nowrap' }}>{cat.en}</span>
              <span className="rof-cjk" style={{ whiteSpace: 'nowrap' }}>{cat.zh}</span>
            </button>
          );
        })}
      </div>

      <div className="rof-label" style={{ color: 'var(--color-muted)' }}>
        {filtered.length} {ui('people.count')}
      </div>

      {/* the roll */}
      <div style={{ display: 'grid', gap: 11 }}>
        {filtered.map((p) => (
          <Panel key={p.id} pad={12} innerRule={false} onClick={() => router.push(`/people/${p.id}`)}>
            <div className="flex items-start" style={{ gap: 11 }}>
              <Avatar initials={p.initials} id={p.id} size={44} featured={p.is_featured} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="flex items-baseline" style={{ gap: 7, flexWrap: 'wrap' }}>
                  <span style={{
                    fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-h3)',
                    letterSpacing: 'var(--tracking-display)', color: 'var(--color-ink)',
                  }}>{p.full_name}</span>
                  {p.native_name ? <span className="rof-cjk" style={{ fontSize: 'var(--text-body)', color: 'var(--color-ink-2)' }}>{p.native_name}</span> : null}
                </div>
                {t(p.headline) ? (
                  <div style={{ fontSize: 'var(--text-body)', color: 'var(--color-muted)', marginTop: 4 }} className="truncate">{t(p.headline)}</div>
                ) : null}
                <div className="flex items-center" style={{ gap: 5, marginTop: 7, flexWrap: 'wrap' }}>
                  <StatusChip tone="neutral">{p.class_name}</StatusChip>
                  {p.hidden_worlds.slice(0, 2).map((hw) => (
                    <span key={hw.id} className="rof-label inline-flex items-center" style={{
                      gap: 5, padding: '3px 6px', border: '2px solid var(--color-line-soft)',
                      background: 'var(--color-white)', color: 'var(--color-muted)',
                    }}>
                      <span aria-hidden style={{ width: 5, height: 5, background: `var(--color-cat-${hw.category})`, display: 'block' }} />
                      <span className={lang === 'zh' ? 'rof-cjk' : undefined} style={{ textTransform: 'none' }}>{t(hw.name)}</span>
                    </span>
                  ))}
                  {p.hidden_worlds.length > 2 ? (
                    <span className="rof-label" style={{ color: 'var(--color-faint)' }}>+{p.hidden_worlds.length - 2}</span>
                  ) : null}
                </div>
              </div>
            </div>
          </Panel>
        ))}
        {filtered.length === 0 && <EmptyState title="No one matches" cn="没有匹配的成员" body={ui('people.search')} />}
      </div>

      <div className="text-center">
        <Bi en="Hidden World over resume" zh="隐藏世界，胜过简历" color="var(--color-faint)" />
      </div>
    </Page>
  );
}
