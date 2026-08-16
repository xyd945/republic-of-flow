'use client';

type Tone = 'neutral' | 'green' | 'red' | 'blue';

const toneStyles: Record<Tone, string> = {
  neutral: 'bg-bronze-wash text-bronze',
  green: 'bg-green-wash text-green',
  red: 'bg-red-wash text-red',
  blue: 'bg-blue-wash text-blue',
};

interface BadgeProps {
  tone?: Tone;
  children: React.ReactNode;
}

export function Badge({ tone = 'neutral', children }: BadgeProps) {
  return (
    <span className={`inline-block text-eyebrow font-bold px-2 py-[5px] rounded-full ${toneStyles[tone]}`}>
      {children}
    </span>
  );
}
