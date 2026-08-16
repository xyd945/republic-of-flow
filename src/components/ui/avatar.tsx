'use client';

const PALETTE = ['#8f7044', '#6f552f', '#465a49', '#405069', '#8a3a32', '#5a4a6a'];

function seedOf(id: string): number {
  return id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
}

interface AvatarProps {
  initials: string;
  id: string;
  size?: number;
  ring?: string;
  className?: string;
}

export function Avatar({ initials, id, size = 44, ring = 'var(--color-paper-1)', className }: AvatarProps) {
  const g = PALETTE[seedOf(id) % PALETTE.length];
  return (
    <div
      className={`grid place-items-center rounded-full shrink-0 font-display font-bold ${className ?? ''}`}
      style={{
        width: size,
        height: size,
        background: `linear-gradient(150deg, ${g}, #2a2016)`,
        color: '#fff',
        fontSize: size * 0.36,
        letterSpacing: '0.04em',
        border: `2px solid ${ring}`,
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      {initials}
    </div>
  );
}

interface PolaroidProps {
  initials: string;
  id: string;
  size?: number;
  rotate?: number;
  clip?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function Polaroid({ initials, id, size = 82, rotate = -2.5, clip = false, className, style }: PolaroidProps) {
  const g = PALETTE[seedOf(id) % PALETTE.length];
  const pad = Math.max(5, size * 0.09);
  return (
    <div className={`relative shrink-0 ${className ?? ''}`} style={{ transform: `rotate(${rotate}deg)`, ...style }}>
      {clip && <Clip />}
      <div
        style={{
          padding: pad,
          paddingBottom: pad * 2.4,
          background: 'var(--color-white)',
          border: '1px solid var(--color-line-soft)',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        <div
          className="grid place-items-center font-display font-bold"
          style={{
            width: size,
            height: size,
            background: `linear-gradient(150deg, ${g}, #2a2016)`,
            filter: 'sepia(0.32) contrast(0.97)',
            color: '#fdf6ea',
            fontSize: size * 0.34,
            letterSpacing: '0.04em',
          }}
        >
          {initials}
        </div>
      </div>
    </div>
  );
}

function Clip() {
  return (
    <div className="absolute top-[-9px] left-1/2 -translate-x-1/2 z-[3]" style={{ width: 26, height: 20 }}>
      <div className="absolute inset-0 rounded-t-[4px] rounded-b-[3px]" style={{ background: 'linear-gradient(180deg,#4a4038,#241d16)', boxShadow: '0 2px 4px rgba(0,0,0,.35)' }} />
      <div className="absolute top-1 left-1 right-1 h-2 rounded-[3px]" style={{ border: '1.5px solid #6f6250' }} />
    </div>
  );
}
