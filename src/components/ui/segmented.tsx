'use client';

/**
 * The tab strip used by People, Market and the Curator Desk.
 *
 * It existed three times, copy-pasted, and the copies had quietly drifted —
 * People carried `mb-3`, Market `mb-4`, and the Desk had a whole dark palette
 * because it sits on the dark overview panel. Merging them naively would have
 * moved pixels on two screens, so the differences are parameters rather than
 * something to average away.
 */
export type SegmentedTone = 'light' | 'dark';

const TONES: Record<SegmentedTone, {
  border: string;
  activeBg: string;
  activeText: string;
  idleText: string;
}> = {
  light: {
    border: 'var(--color-line)',
    activeBg: 'var(--color-ink)',
    activeText: '#fff',
    idleText: 'var(--color-muted)',
  },
  dark: {
    border: 'var(--color-dark-line)',
    activeBg: 'var(--color-dark-paper)',
    activeText: 'var(--color-dark)',
    idleText: 'var(--color-dark-muted)',
  },
};

export function Segmented({
  items,
  value,
  onChange,
  tone = 'light',
  className = '',
}: {
  items: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
  tone?: SegmentedTone;
  /** Spacing is the caller's business — the three screens disagreed on it. */
  className?: string;
}) {
  const t = TONES[tone];
  return (
    <div
      className={`flex gap-0 rounded-xs overflow-hidden border ${className}`}
      style={{ borderColor: t.border }}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          className="flex-1 py-[8px] border-none cursor-pointer font-display font-bold text-eyebrow tracking-[0.10em] uppercase transition-colors"
          style={{
            background: item.id === value ? t.activeBg : 'transparent',
            color: item.id === value ? t.activeText : t.idleText,
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
