'use client';

import type { Language } from '@/types';

interface LanguageSwitcherProps {
  languages: { code: Language; label: string }[];
  value: Language;
  onChange: (code: Language) => void;
}

export function LanguageSwitcher({ languages, value, onChange }: LanguageSwitcherProps) {
  return (
    <div className="flex gap-[5px]">
      {languages.map(({ code, label }) => (
        <button
          key={code}
          type="button"
          onClick={() => onChange(code)}
          className="border rounded-full cursor-pointer transition-colors duration-200"
          style={{
            fontSize: 9,
            lineHeight: 1,
            padding: '6px 7px',
            background: code === value ? 'var(--color-ink)' : 'rgba(255,255,255,0.45)',
            color: code === value ? 'white' : 'var(--color-muted)',
            borderColor: code === value ? 'var(--color-ink)' : '#c9b99f',
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
