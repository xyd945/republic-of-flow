'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Avatar, Icon, LoadError } from '@/components/ui';
import { CATEGORY_COLORS } from '@/lib/seed';
import { CATEGORIES } from '@/lib/i18n/translations';
import { useI18n } from '@/lib/i18n/context';
import { usePeople } from '@/lib/data/views';
import { CLASSES } from '@/lib/classes';
import type { CategoryId } from '@/types';

function SearchField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative mb-[14px]">
      <Icon name="search" size={15} color="var(--color-faint)" className="absolute left-3 top-1/2 -translate-y-1/2" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="parch-input pl-9 text-sm"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-3 top-1/2 -translate-y-1/2 border-none bg-transparent cursor-pointer p-0"
        >
          <Icon name="x" size={14} color="var(--color-faint)" />
        </button>
      )}
    </div>
  );
}

function Segmented({ items, value, onChange }: { items: { id: string; label: string }[]; value: string; onChange: (id: string) => void }) {
  return (
    <div className="flex gap-0 rounded-xs overflow-hidden border border-line mb-3">
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

export default function PeoplePage() {
  const router = useRouter();
  const { t, ui, lang } = useI18n();
  const { people: profiles, loading, error } = usePeople();
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('all');
  const [catFilter, setCatFilter] = useState<CategoryId | null>(null);

  const filtered = useMemo(() => {
    let list = profiles;
    if (classFilter !== 'all') {
      list = list.filter((p) => p.class_name === classFilter);
    }
    if (catFilter) {
      list = list.filter((p) => p.hidden_worlds.some((hw) => hw.category === catFilter));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
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
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-bronze border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) return <LoadError message={error} onRetry={() => window.location.reload()} />;

  return (
    <div className="px-[18px] pt-[22px]">
      <h1 className="font-display font-bold text-eyebrow tracking-[0.14em] uppercase text-bronze mb-4">
        {ui('people.title')}
      </h1>

      <SearchField value={search} onChange={setSearch} placeholder={ui('people.search')} />

      <Segmented
        items={[
          { id: 'all', label: ui('people.all') },
          ...CLASSES.map((c) => ({ id: c, label: c })),
        ]}
        value={classFilter}
        onChange={setClassFilter}
      />

      <div className="flex gap-[6px] flex-wrap mb-4">
        {CATEGORIES.map((cat) => {
          const active = catFilter === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCatFilter(active ? null : cat.id)}
              className="border rounded-full cursor-pointer transition-colors font-serif text-eyebrow px-[10px] py-[5px]"
              style={{
                background: active ? CATEGORY_COLORS[cat.id] : 'rgba(255,255,255,0.45)',
                color: active ? '#fff' : 'var(--color-muted)',
                borderColor: active ? CATEGORY_COLORS[cat.id] : '#c9b99f',
              }}
            >
              {lang === 'zh' ? cat.zh : cat.en}
            </button>
          );
        })}
      </div>

      <div className="text-xs text-faint font-serif mb-3">{filtered.length} {ui('people.count')}</div>

      <div className="flex flex-col gap-[10px] pb-6">
        {filtered.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => router.push(`/people/${p.id}`)}
            className="sheet p-[14px] w-full flex items-start gap-3 border-none cursor-pointer text-left"
          >
            <Avatar initials={p.initials} id={p.id} size={44} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-serif font-semibold text-base text-ink truncate">{p.full_name}</span>
                {p.is_featured && (
                  <Icon name="star" size={12} color="var(--color-bronze)" fill="var(--color-bronze)" />
                )}
              </div>
              <div className="font-serif text-xs text-muted truncate">{t(p.headline)}</div>
              <div className="font-serif text-xs text-faint mt-[2px]">{p.class_name}</div>
              {p.hidden_worlds.length > 0 && (
                <div className="flex items-center gap-[6px] mt-[6px] flex-wrap">
                  {p.hidden_worlds.slice(0, 2).map((hw) => (
                    <span key={hw.id} className="flex items-center gap-[4px]">
                      <span className="w-[5px] h-[5px] rounded-full" style={{ background: CATEGORY_COLORS[hw.category] }} />
                      <span className="font-serif text-eyebrow text-faint">{t(hw.name)}</span>
                    </span>
                  ))}
                  {p.hidden_worlds.length > 2 && (
                    <span className="font-serif text-eyebrow text-faint">+{p.hidden_worlds.length - 2}</span>
                  )}
                </div>
              )}
            </div>
            <Icon name="chevron-right" size={14} color="var(--color-faint)" className="mt-1 shrink-0" />
          </button>
        ))}

        {filtered.length === 0 && (
          <div className="text-center py-10">
            <Icon name="search" size={28} color="var(--color-faint)" className="mx-auto mb-3" />
            <div className="font-serif text-sm text-muted">{ui('people.none')}</div>
            <div className="font-serif text-xs text-faint mt-1">{ui('people.adjust')}</div>
          </div>
        )}
      </div>
    </div>
  );
}
