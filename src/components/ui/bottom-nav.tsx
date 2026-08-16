'use client';

import { Icon } from './icons';

interface NavItem {
  id: string;
  icon: string;
  label: string;
}

interface BottomNavProps {
  items: NavItem[];
  active: string;
  onChange: (id: string) => void;
}

export function BottomNav({ items, active, onChange }: BottomNavProps) {
  return (
    <nav className="grid gap-0 py-2 px-[7px]" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)`, paddingBottom: 'calc(8px + env(safe-area-inset-bottom))' }}>
      {items.map((item) => {
        const isActive = item.id === active;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className="flex flex-col items-center gap-[2px] py-[3px] border-none bg-transparent cursor-pointer"
          >
            <Icon name={item.icon} size={20} color={isActive ? 'var(--color-ink)' : 'var(--color-faint)'} />
            <span
              className="font-serif"
              style={{
                fontSize: 10,
                color: isActive ? 'var(--color-ink)' : 'var(--color-faint)',
                fontWeight: isActive ? 700 : 400,
              }}
            >
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
