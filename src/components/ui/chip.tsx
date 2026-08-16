'use client';

interface ChipProps {
  children: React.ReactNode;
  variant?: 'default' | 'wash';
  tone?: 'neutral' | 'green' | 'blue' | 'red';
  className?: string;
}

const washTones: Record<string, string> = {
  neutral: 'bg-bronze-wash text-bronze-deep border-bronze-wash',
  green: 'bg-green-wash text-green border-green-wash',
  blue: 'bg-blue-wash text-blue border-blue-wash',
  red: 'bg-red-wash text-red border-red-wash',
};

export function Chip({ children, variant = 'default', tone = 'neutral', className = '' }: ChipProps) {
  const base = variant === 'wash'
    ? washTones[tone] ?? washTones.neutral
    : 'border-line text-muted bg-white/55';

  return (
    <span className={`inline-block text-eyebrow font-serif px-2 py-[5px] rounded-full border ${base} ${className}`}>
      {children}
    </span>
  );
}
