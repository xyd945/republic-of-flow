'use client';

/**
 * Inline activity indicator, sized to sit inside a button or icon control.
 *
 * Writes go to Supabase over the network, and accepting a request is three of
 * them plus a refetch — long enough that a merely-disabled control reads as
 * broken rather than busy.
 */
export function Spinner({
  size = 14,
  color = 'currentColor',
  className = '',
}: {
  size?: number;
  color?: string;
  className?: string;
}) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block shrink-0 rounded-full animate-spin ${className}`}
      style={{
        width: size,
        height: size,
        border: `2px solid ${color}`,
        borderTopColor: 'transparent',
      }}
    />
  );
}
