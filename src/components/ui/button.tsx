'use client';

import { type ReactNode, type ButtonHTMLAttributes } from 'react';

type Tone = 'ink' | 'bronze' | 'red' | 'green';
type Variant = 'solid' | 'outline';
type Size = 'default' | 'sm';

const toneMap: Record<Tone, Record<Variant, string>> = {
  ink: {
    solid: 'bg-ink text-white border-ink',
    outline: 'bg-transparent text-ink border-ink',
  },
  bronze: {
    solid: 'bg-bronze-light text-dark border-bronze-light',
    outline: 'bg-transparent text-bronze-deep border-bronze',
  },
  red: {
    solid: 'bg-red text-white border-red',
    outline: 'bg-transparent text-red border-red',
  },
  green: {
    solid: 'bg-green text-white border-green',
    outline: 'bg-transparent text-green border-green',
  },
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: Tone;
  variant?: Variant;
  size?: Size;
  block?: boolean;
  icon?: ReactNode;
  children: ReactNode;
}

export function Button({
  tone = 'ink',
  variant = 'solid',
  size = 'default',
  block = true,
  icon,
  children,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  const colors = toneMap[tone]?.[variant] ?? toneMap.ink.solid;
  const pad = size === 'sm' ? 'py-[7px] px-3 text-xs' : 'py-[11px] px-3 text-xs';

  return (
    <button
      className={`
        flex items-center justify-center gap-2 border rounded-[var(--radius-sm)]
        font-display font-bold tracking-[0.08em] uppercase cursor-pointer
        transition-opacity duration-200
        ${colors} ${pad}
        ${block ? 'w-full' : ''}
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        ${className}
      `}
      disabled={disabled}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}
