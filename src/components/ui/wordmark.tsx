'use client';

interface WordmarkProps {
  size?: 'sm' | 'lg';
  align?: 'left' | 'center';
  subtitle?: string;
}

export function Wordmark({ size = 'sm', align = 'left', subtitle }: WordmarkProps) {
  const fontSize = size === 'lg' ? 18 : 13;
  return (
    <div style={{ textAlign: align }}>
      <div
        className="font-display font-semibold"
        style={{
          fontSize,
          letterSpacing: '0.10em',
          color: 'var(--color-ink)',
        }}
      >
        REPUBLIC OF FLOW
      </div>
      {subtitle && (
        <div className="font-serif italic text-muted mt-1" style={{ fontSize: 12 }}>
          {subtitle}
        </div>
      )}
    </div>
  );
}
