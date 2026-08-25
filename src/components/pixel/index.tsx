'use client';

/**
 * Republic of FLOW — pixel primitives.
 *
 * Ported from the MVP v1 design system. Only the components our screens
 * actually need are here: the design ships guild badges, XP meters, stat rows
 * and an archive, none of which this app has built, and a component library
 * full of things nothing renders is just debt.
 *
 * Everything obeys the same rules: square corners, hard 2px borders, offset
 * shadows with zero blur, stepped motion, and integer type sizes.
 */

import { useState, type CSSProperties, type ReactNode } from 'react';
import { useOverlay } from './overlay';

/* ------------------------------------------------------------------ text */

/**
 * The bilingual caps label — the single most-used mark in the system.
 *
 * English takes the bitmap display face; 中文 follows in the CJK face, because
 * Silkscreen has no CJK coverage at all and would fall back mid-sentence.
 * The pairing is always rendered, in both languages, by design: the Republic's
 * voice is bilingual rather than translated.
 */
export function Bi({
  en, zh, color = 'var(--color-ink)', size = 'var(--text-small)', gap = 6, wrap = false, className = '',
}: {
  en: string; zh?: string; color?: string; size?: string; gap?: number;
  wrap?: boolean; className?: string;
}) {
  /* The two halves must not break apart from each other mid-pair, so each is
     nowrap by default. A long sentence passed as `en` needs the opposite —
     `wrap` lets it fold instead of running off the side of the screen. */
  const ws = wrap ? 'normal' : 'nowrap';
  return (
    <span className={`rof-label inline-flex items-baseline ${className}`}
      style={{ color, fontSize: size, gap, flexWrap: wrap ? 'wrap' : 'nowrap', maxWidth: '100%' }}>
      <span style={{ whiteSpace: ws }}>{en}</span>
      {zh ? <span className="rof-cjk" style={{ fontSize: size, whiteSpace: ws }}>{zh}</span> : null}
    </span>
  );
}

/** Stacked bilingual title — display line over the 中文 line. */
export function BiTitle({
  en, zh, size = 'var(--text-h2)', color = 'var(--color-ink)', className = '',
}: { en: string; zh?: string; size?: string; color?: string; className?: string }) {
  return (
    <div className={className}>
      <div style={{
        fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: size, lineHeight: 1.4,
        letterSpacing: 'var(--tracking-display)', textTransform: 'uppercase', color,
      }}>{en}</div>
      {zh ? <div className="rof-cjk" style={{ fontSize: 'var(--text-h3)', color: 'var(--color-ink-2)', marginTop: 4 }}>{zh}</div> : null}
    </div>
  );
}

/** Prose block: the reader's language first, the other beneath it. */
export function BiText({
  en, zh, lang, color = 'var(--color-muted)', className = '',
}: { en: string; zh?: string; lang: string; color?: string; className?: string }) {
  const zhFirst = lang === 'zh' && !!zh;
  const primary = zhFirst ? zh : en;
  const secondary = zhFirst ? en : zh;
  return (
    <p className={className} style={{ margin: 0, fontFamily: 'var(--font-body)', fontSize: 'var(--text-body)', lineHeight: 1.6, color }}>
      <span className={zhFirst ? 'rof-cjk' : undefined}>{primary}</span>
      {secondary ? <><br /><span className={zhFirst ? undefined : 'rof-cjk'}>{secondary}</span></> : null}
    </p>
  );
}

/* --------------------------------------------------------------- surfaces */

const PANEL_TONES = {
  cream: { bg: 'var(--color-card)', fg: 'var(--color-ink)', border: 'var(--color-navy-900)' },
  warm: { bg: 'var(--color-card-warm)', fg: 'var(--color-ink)', border: 'var(--color-navy-900)' },
  navy: { bg: 'var(--color-navy-900)', fg: 'var(--color-on-navy)', border: 'var(--color-gold)' },
  gold: { bg: 'var(--color-gold-tint)', fg: 'var(--color-ink)', border: 'var(--color-gold)' },
} as const;

export type PanelTone = keyof typeof PANEL_TONES;

/**
 * The panel everything sits on.
 *
 * `innerRule` draws the thin gold line inset from the border — done with a
 * layered box-shadow rather than a second element, so it costs no DOM and
 * cannot fall out of alignment.
 */
export function Panel({
  children, tone = 'cream', pad = 16, corners = false, innerRule = true, shadow = true,
  accent, className = '', style, onClick, ariaLabel,
}: {
  children: ReactNode; tone?: PanelTone; pad?: number; corners?: boolean; innerRule?: boolean;
  shadow?: boolean; accent?: string; className?: string; style?: CSSProperties;
  onClick?: () => void; ariaLabel?: string;
}) {
  const t = PANEL_TONES[tone];
  const rule = innerRule ? `inset 0 0 0 3px ${t.bg}, inset 0 0 0 4px var(--color-gold)` : '';
  const drop = shadow ? 'var(--shadow-px)' : '';
  const box = [rule, drop].filter(Boolean).join(', ');
  /* A clickable panel renders as a real <button>. It was a <div onClick>, which
     is invisible to Tab and deaf to Enter — and the people directory is built
     entirely out of these, so keyboard users could not open a single dossier.
     None of the clickable panels nest their own controls, so the button
     element is safe here. */
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      {...(onClick ? { type: 'button' as const, onClick, 'aria-label': ariaLabel } : {})}
      className={`relative ${onClick ? 'cursor-pointer text-left w-full' : ''} ${className}`}
      style={{
        background: t.bg, color: t.fg,
        border: `var(--bw) solid ${accent || t.border}`,
        borderRadius: 0,
        padding: innerRule ? pad + 4 : pad,
        boxShadow: box || undefined,
        // A <button> supplies its own font, alignment and box sizing; a <div>
        // must keep its own, so this reset is applied only when it is a button.
        ...(onClick ? { font: 'inherit', textAlign: 'left' as const, display: 'block', width: '100%' } : {}),
        ...style,
      }}
    >
      {corners && (['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const).map((p) => {
        const [v, h] = p.split('-') as ['top' | 'bottom', 'left' | 'right'];
        return (
          <span key={p} aria-hidden style={{
            position: 'absolute', width: 6, height: 6, pointerEvents: 'none', [v]: 2, [h]: 2,
            [`border${v === 'top' ? 'Top' : 'Bottom'}`]: '2px solid var(--color-gold)',
            [`border${h === 'left' ? 'Left' : 'Right'}`]: '2px solid var(--color-gold)',
          } as CSSProperties} />
        );
      })}
      {children}
    </Tag>
  );
}

/* ---------------------------------------------------------------- buttons */

const BUTTON_TONES = {
  primary: { bg: 'var(--color-navy-700)', fg: '#F5EDD8', bd: 'var(--color-navy-900)' },
  dark: { bg: 'var(--color-navy-900)', fg: '#F5EDD8', bd: 'var(--color-navy-900)' },
  green: { bg: '#4A6B4E', fg: '#F2F6EF', bd: '#2F4733' },
  red: { bg: 'var(--color-red)', fg: '#F7E7E2', bd: '#6E2A20' },
  gold: { bg: 'var(--color-gold)', fg: 'var(--color-navy-900)', bd: '#9C7B44' },
  tertiary: { bg: 'var(--color-parchment)', fg: 'var(--color-navy-900)', bd: 'var(--color-brown)' },
  secondary: { bg: 'var(--color-card)', fg: 'var(--color-navy-900)', bd: 'var(--color-navy-900)' },
} as const;

const BUTTON_SIZES = {
  lg: { pad: '12px 24px', fs: 'var(--text-body)', gap: 10 },
  md: { pad: '10px 16px', fs: 'var(--text-body)', gap: 8 },
  sm: { pad: '6px 12px', fs: 'var(--text-small)', gap: 6 },
} as const;

export type ButtonTone = keyof typeof BUTTON_TONES;

/**
 * The press behaviour is the whole personality of this button: the shadow
 * collapses from 3px to 1px and the button translates 2px down-right, so it
 * physically sinks into the page. Stepped, not eased — a smooth transition
 * here reads as glassy and breaks the illusion.
 */
export function Button({
  children, cn, tone = 'primary', size = 'md', block = false, disabled = false, loading = false,
  icon, onClick, type = 'button', className = '', style, ariaLabel, ariaPressed, title,
}: {
  children: ReactNode; cn?: string; tone?: ButtonTone; size?: keyof typeof BUTTON_SIZES;
  block?: boolean; disabled?: boolean; loading?: boolean; icon?: ReactNode;
  onClick?: () => void; type?: 'button' | 'submit'; className?: string; style?: CSSProperties;
  /* A glyph is not a name. Any button whose whole label is ★ or ON needs these
     two, or a screen reader announces a row of identical "star button"s with
     no member, no action and no state. */
  ariaLabel?: string; ariaPressed?: boolean; title?: string;
}) {
  const [hover, setHover] = useState(false);
  const [press, setPress] = useState(false);
  const t = BUTTON_TONES[tone];
  const s = BUTTON_SIZES[size];
  const off = press ? 1 : 3;
  const off_ = disabled || loading;
  return (
    <button
      type={type}
      disabled={off_}
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
      title={title ?? ariaLabel}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setPress(false); }}
      onMouseDown={() => setPress(true)}
      onMouseUp={() => setPress(false)}
      className={className}
      style={{
        display: block ? 'flex' : 'inline-flex',
        width: block ? '100%' : 'auto',
        alignItems: 'center', justifyContent: 'center', gap: s.gap,
        fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: s.fs,
        letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase',
        padding: s.pad, borderRadius: 0, lineHeight: 1,
        background: off_ ? 'var(--color-slate-tint)' : t.bg,
        color: off_ ? 'var(--color-faint)' : t.fg,
        border: `var(--bw) solid ${off_ ? 'var(--color-slate)' : hover ? 'var(--color-gold)' : t.bd}`,
        boxShadow: off_ ? 'none' : `${off}px ${off}px 0 rgba(15,30,52,0.25)`,
        transform: press && !off_ ? 'translate(2px, 2px)' : 'none',
        cursor: off_ ? 'not-allowed' : 'pointer',
        transition: 'border-color var(--dur-fast) var(--ease-snap)',
        ...style,
      }}
    >
      {loading ? <PixelSpinner /> : icon}
      <span style={{ whiteSpace: 'nowrap' }}>{children}</span>
      {cn ? <span className="rof-cjk" style={{ whiteSpace: 'nowrap' }}>{cn}</span> : null}
    </button>
  );
}

/** Four blocks chasing each other. No spinning — pixel art does not rotate. */
export function PixelSpinner({ size = 10, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <span aria-hidden style={{ display: 'inline-grid', gridTemplateColumns: '1fr 1fr', gap: 1, width: size, height: size }}>
      {[0, 1, 3, 2].map((i) => (
        <span key={i} style={{
          background: color, width: '100%', height: '100%',
          animation: `rofBlink 600ms steps(1,end) ${i * 150}ms infinite`,
        }} />
      ))}
      <style>{`@keyframes rofBlink{0%,100%{opacity:.25}25%{opacity:1}}`}</style>
    </span>
  );
}

/* ------------------------------------------------------------------ chips */

const STATUS_TONES = {
  open: { bg: 'var(--color-sage-tint)', fg: '#3F5742', bd: 'var(--color-sage)' },
  matched: { bg: 'var(--color-gold-tint)', fg: '#6B5223', bd: 'var(--color-gold)' },
  closed: { bg: 'var(--color-slate-tint)', fg: 'var(--color-slate)', bd: 'var(--color-slate)' },
  hot: { bg: 'var(--color-red-tint)', fg: '#6E2A20', bd: 'var(--color-red)' },
  wanted: { bg: 'var(--color-red-tint)', fg: '#6E2A20', bd: 'var(--color-red)' },
  offer: { bg: 'var(--color-sage-tint)', fg: '#3F5742', bd: 'var(--color-sage)' },
  neutral: { bg: 'var(--color-mist-tint)', fg: 'var(--color-slate)', bd: 'var(--color-slate)' },
} as const;

export type StatusTone = keyof typeof STATUS_TONES;

export function StatusChip({
  children, cn, tone = 'neutral', className = '',
}: { children: ReactNode; cn?: string; tone?: StatusTone; className?: string }) {
  const t = STATUS_TONES[tone];
  return (
    <span className={`rof-label inline-flex items-baseline ${className}`} style={{
      gap: 5, padding: '4px 7px', background: t.bg, color: t.fg,
      border: `var(--bw) solid ${t.bd}`, borderRadius: 0,
    }}>
      <span>{children}</span>
      {cn ? <span className="rof-cjk">{cn}</span> : null}
    </span>
  );
}

/* ----------------------------------------------------------------- layout */

/** Section heading: gold rule, caps title, optional trailing action. */
export function SectionHeader({
  children, cn, trailing, className = '',
}: { children: ReactNode; cn?: string; trailing?: ReactNode; className?: string }) {
  return (
    <div className={`flex items-end justify-between gap-3 ${className}`}
      style={{ borderBottom: '2px solid var(--color-gold)', paddingBottom: 7 }}>
      <span className="rof-label" style={{ color: 'var(--color-ink)', fontSize: 'var(--text-h3)', lineHeight: 1.35, minWidth: 0 }}>
        {children}
        {cn ? <span className="rof-cjk" style={{ fontSize: 'var(--text-h3)', marginLeft: 6 }}>{cn}</span> : null}
      </span>
      {trailing ? <span style={{ flex: 'none' }}>{trailing}</span> : null}
    </div>
  );
}

export function Divider({ className = '' }: { className?: string }) {
  return <div className={className} aria-hidden style={{ height: 2, background: 'var(--color-line-soft)' }} />;
}

/** Field wrapper: gold caps label above the control. */
export function Field({
  label, cn, hint, children, className = '',
}: { label?: string; cn?: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      {label ? <span className="block" style={{ marginBottom: 7 }}><Bi en={label} zh={cn} color="var(--color-gold)" /></span> : null}
      {children}
      {hint ? <span className="block" style={{ marginTop: 6, fontSize: 'var(--text-small)', color: 'var(--color-faint)' }}>{hint}</span> : null}
    </label>
  );
}

export function EmptyState({
  title, cn, body, className = '',
}: { title: string; cn?: string; body?: string; className?: string }) {
  return (
    <div className={`text-center ${className}`} style={{
      padding: '26px 16px', border: '2px dashed var(--color-line-soft)', background: 'var(--color-card)',
    }}>
      <Bi en={title} zh={cn} color="var(--color-faint)" />
      {body ? <div style={{ marginTop: 7, fontSize: 'var(--text-body)', color: 'var(--color-faint)' }}>{body}</div> : null}
    </div>
  );
}

/* ---------------------------------------------------------------- avatars */

/**
 * Initials in a bordered plate. The design ships pixel portraits for its demo
 * founders; real members have no portrait, so the frame is what carries the
 * identity — the border colour is derived from the id so a given member always
 * reads the same, the way the old avatar did.
 */
export function Avatar({
  initials, id, size = 44, featured = false,
}: { initials: string; id: string; size?: number; featured?: boolean }) {
  const ACCENTS = ['var(--color-navy-700)', 'var(--color-brown)', 'var(--color-red)', 'var(--color-sage)', 'var(--color-slate)'];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const accent = ACCENTS[h % ACCENTS.length];
  return (
    <span style={{
      width: size, height: size, flex: 'none', display: 'grid', placeItems: 'center',
      background: accent, color: '#F5EDD8',
      border: `var(--bw) solid ${featured ? 'var(--color-gold)' : 'var(--color-navy-900)'}`,
      boxShadow: featured ? 'inset 0 0 0 2px var(--color-gold)' : 'var(--shadow-px)',
      fontFamily: 'var(--font-display)', fontWeight: 700,
      fontSize: size >= 56 ? 'var(--text-h2)' : 'var(--text-h3)', letterSpacing: '0.02em',
    }}>{initials}</span>
  );
}

/* ---------------------------------------------------------------- sprites */

/** A pixel PNG from the design system, never smoothed. */
export function Sprite({
  name, kind = 'icons', size = 22, className = '', alt = '',
}: { name: string; kind?: 'icons' | 'sprites' | 'logo'; size?: number; className?: string; alt?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/ds/${kind}/${name}.png`}
      alt={alt}
      width={size}
      height={size}
      className={`pixel ${className}`}
      style={{ width: size, height: size, objectFit: 'contain', display: 'block' }}
    />
  );
}

/* ------------------------------------------------------------------ crest */

/**
 * The Republic's mark, drawn rather than loaded.
 *
 * There was a logo-mark.png, but it arrived truncated — 192KB exactly, no IEND
 * chunk — and a half-decoded PNG renders as a stripe of garbage rather than
 * failing honestly. Drawing it in the same primitives as everything else costs
 * one component, scales to any size without a second asset, and cannot arrive
 * broken. Swap this for the real artwork once the file is re-exported.
 */
export function Crest({ size = 96, className = '' }: { size?: number; className?: string }) {
  const unit = Math.round(size / 12);
  const corner = { position: 'absolute' as const, width: unit, height: unit, background: 'var(--color-gold)' };
  return (
    <div className={`relative ${className}`} aria-hidden style={{
      width: size, height: size, flex: 'none',
      background: 'var(--color-navy-700)',
      border: `${Math.max(2, unit)}px solid var(--color-gold)`,
      boxShadow: `inset 0 0 0 ${unit}px var(--color-navy-900)`,
      display: 'grid', placeItems: 'center',
    }}>
      <span style={{
        fontFamily: 'var(--font-display)', fontWeight: 700,
        /* Integer only — a fractional size knocks the bitmap off the pixel grid. */
        fontSize: Math.round(size * 0.42),
        lineHeight: 1, color: 'var(--color-gold)',
        letterSpacing: 0, transform: `translateY(${Math.round(size * 0.02)}px)`,
      }}>R</span>
      <i style={{ ...corner, top: -unit, left: -unit }} />
      <i style={{ ...corner, top: -unit, right: -unit }} />
      <i style={{ ...corner, bottom: -unit, left: -unit }} />
      <i style={{ ...corner, bottom: -unit, right: -unit }} />
    </div>
  );
}

/* ------------------------------------------------------------------ sheet */

/**
 * A bottom sheet. Slides up in four discrete steps rather than gliding —
 * a smooth ease here reads as glassy and breaks the bitmap illusion.
 *
 * The scrim swallows its own clicks to close; the panel stops propagation so
 * a click inside never closes it. Escape closes too, and the body scroll is
 * locked while open so the page behind cannot be dragged around under it.
 */
export function Sheet({
  title, cn, onClose, children, footer,
}: {
  title: string; cn?: string; onClose: () => void; children: ReactNode; footer?: ReactNode;
}) {
  useOverlay(onClose);

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        background: 'rgba(15,30,52,0.55)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative', width: '100%', maxWidth: 430,
          background: 'var(--color-card)', color: 'var(--color-ink)',
          border: 'var(--bw) solid var(--color-navy-900)', borderBottom: 'none', borderRadius: 0,
          boxShadow: '0 -4px 0 rgba(15,30,52,0.25)',
          maxHeight: '86vh', display: 'flex', flexDirection: 'column',
          animation: 'rofSheet 200ms steps(4, end)',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          padding: '12px 14px', background: 'var(--color-navy-900)',
          borderBottom: '3px solid var(--color-gold)', flex: 'none',
        }}>
          <span className="rof-label inline-flex items-baseline" style={{ gap: 6, color: 'var(--color-gold)', minWidth: 0 }}>
            <span style={{ whiteSpace: 'nowrap' }}>{title}</span>
            {cn ? <span className="rof-cjk" style={{ whiteSpace: 'nowrap' }}>{cn}</span> : null}
          </span>
          <button type="button" onClick={onClose} aria-label="Close"
            style={{
              width: 28, height: 28, flex: 'none', display: 'grid', placeItems: 'center', cursor: 'pointer',
              background: 'transparent', border: '2px solid var(--color-gold)', borderRadius: 0,
              color: 'var(--color-gold)', fontFamily: 'var(--font-display)', fontWeight: 700,
              fontSize: 'var(--text-body)', lineHeight: 1,
            }}>X</button>
        </div>

        <div style={{ padding: 16, overflowY: 'auto', display: 'grid', gap: 14 }}>{children}</div>

        {footer ? (
          <div style={{ padding: 14, borderTop: '3px solid var(--color-line)', flex: 'none' }}>{footer}</div>
        ) : null}

        <style>{`@keyframes rofSheet{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
      </div>
    </div>
  );
}

/** An inline error line. Blocky, red, impossible to mistake for content. */
export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <div className="rof-label" style={{
      display: 'flex', alignItems: 'center', gap: 7, padding: '7px 9px',
      background: 'var(--color-red-tint)', border: '2px solid var(--color-red)',
      color: '#6E2A20', textTransform: 'none', letterSpacing: 0,
    }}>
      <span aria-hidden style={{ flex: 'none', fontFamily: 'var(--font-display)', fontWeight: 700 }}>!</span>
      <span>{children}</span>
    </div>
  );
}
