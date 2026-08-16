'use client';

interface WaxSealProps {
  size?: number;
  label?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function WaxSeal({ size = 48, label = 'R', className, style }: WaxSealProps) {
  const r = size / 2;
  const points = 18;
  const inner = r * 0.72;
  const outer = r * 0.92;

  const path = Array.from({ length: points * 2 }, (_, i) => {
    const angle = (Math.PI * 2 * i) / (points * 2) - Math.PI / 2;
    const rad = i % 2 === 0 ? outer : inner;
    const x = r + rad * Math.cos(angle);
    const y = r + rad * Math.sin(angle);
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ') + 'Z';

  return (
    // No `relative` here: it would beat a caller-supplied `absolute`, since
    // Tailwind emits .relative after .absolute regardless of class order.
    <div className={`inline-block ${className ?? ''}`} style={{ width: size, height: size, ...style }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        <defs>
          <radialGradient id="seal-g" cx="40%" cy="38%">
            <stop offset="0%" stopColor="#a84438" />
            <stop offset="60%" stopColor="#8a3a32" />
            <stop offset="100%" stopColor="#6f2b25" />
          </radialGradient>
          <filter id="seal-s">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#5a1e19" floodOpacity="0.45" />
          </filter>
        </defs>
        <path d={path} fill="url(#seal-g)" filter="url(#seal-s)" />
        <text
          x="50%"
          y="52%"
          textAnchor="middle"
          dominantBaseline="central"
          fill="#fdf0e6"
          fontFamily="var(--font-display)"
          fontWeight="700"
          fontSize={size * 0.32}
          letterSpacing="0.06em"
        >
          {label}
        </text>
      </svg>
    </div>
  );
}
