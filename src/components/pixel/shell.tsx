'use client';

/**
 * The chrome every screen sits inside: status strip, top bar, tab bar.
 *
 * The design frames each screen in a gold-bordered handset on a navy field.
 * That is a presentation device for the mockup, not a UI — so it survives on
 * desktop (where it reads as intentional) and falls away entirely below 470px,
 * where the screen simply becomes the viewport. Our members are on phones.
 */

import type { ReactNode } from 'react';
import { Bi, Sprite } from './index';

/* --------------------------------------------------------------- top bar */

export function TopBar({
  title, cn, onBack, right,
}: { title?: string; cn?: string; onBack?: () => void; right?: ReactNode }) {
  return (
    <header style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
      padding: '10px 12px', background: 'var(--color-navy-900)',
      borderBottom: '3px solid var(--color-gold)', minHeight: 48,
    }}>
      <div className="flex items-center" style={{ gap: 10, minWidth: 0 }}>
        {onBack ? (
          <button type="button" onClick={onBack} aria-label="Back"
            style={{
              width: 30, height: 30, flex: 'none', display: 'grid', placeItems: 'center', cursor: 'pointer',
              background: 'transparent', border: '2px solid var(--color-gold)', borderRadius: 0,
              color: 'var(--color-gold)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-h3)', lineHeight: 1,
            }}>{'<'}</button>
        ) : null}
        {title ? (
          <span className="rof-label inline-flex items-baseline" style={{ gap: 6, color: 'var(--color-gold)', minWidth: 0 }}>
            <span style={{ whiteSpace: 'nowrap' }}>{title}</span>
            {cn ? <span className="rof-cjk" style={{ whiteSpace: 'nowrap' }}>{cn}</span> : null}
          </span>
        ) : (
          <span className="rof-label" style={{ color: 'var(--color-gold)', fontSize: 'var(--text-h3)', whiteSpace: 'nowrap' }}>REPUBLIC OF FLOW</span>
        )}
      </div>
      <div className="flex items-center" style={{ gap: 8 }}>{right}</div>
    </header>
  );
}

/* -------------------------------------------------------- language switch */

export function LangSwitch({ lang, onChange }: { lang: string; onChange: (l: 'en' | 'zh') => void }) {
  return (
    <span style={{ display: 'inline-flex', border: '2px solid var(--color-gold)' }}>
      {(['en', 'zh'] as const).map((l) => {
        const on = lang === l;
        return (
          <button key={l} type="button" onClick={() => onChange(l)} aria-pressed={on}
            className={l === 'zh' ? 'rof-cjk' : 'rof-label'}
            style={{
              padding: '4px 7px', border: 'none', borderRadius: 0, cursor: 'pointer', lineHeight: 1,
              fontSize: 'var(--text-small)',
              background: on ? 'var(--color-gold)' : 'transparent',
              color: on ? 'var(--color-navy-900)' : 'var(--color-gold)',
              fontFamily: l === 'zh' ? 'var(--font-cjk)' : 'var(--font-display)',
              fontWeight: 700,
            }}>{l === 'en' ? 'EN' : '中'}</button>
        );
      })}
    </span>
  );
}

/* ----------------------------------------------------------- notification */

export function BellButton({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label="Notifications"
      style={{
        position: 'relative', width: 30, height: 30, display: 'grid', placeItems: 'center', cursor: 'pointer',
        background: 'transparent', border: '2px solid var(--color-gold)', borderRadius: 0,
        color: 'var(--color-gold)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-h3)', lineHeight: 1,
      }}>
      !
      {count > 0 && (
        <span className="rof-label" style={{
          position: 'absolute', top: -7, right: -7, minWidth: 15, height: 15, padding: '0 3px',
          display: 'grid', placeItems: 'center', background: 'var(--color-red)', color: '#F7E7E2',
          border: '2px solid var(--color-navy-900)', fontSize: 'var(--text-small)',
        }}>{count > 9 ? '9+' : count}</span>
      )}
    </button>
  );
}

/* --------------------------------------------------------------- tab bar */

export const TABS = [
  { id: '/', icon: 'nav-home', label: 'Home', cn: '首页' },
  { id: '/people', icon: 'nav-discover', label: 'People', cn: '成员' },
  { id: '/market', icon: 'nav-auction', label: 'Market', cn: '市场' },
  { id: '/profile', icon: 'nav-journal', label: 'You', cn: '我的' },
] as const;

export function TabBar({ active, onChange }: { active: string; onChange: (id: string) => void }) {
  return (
    <nav style={{
      display: 'grid', gridTemplateColumns: `repeat(${TABS.length}, 1fr)`,
      background: 'var(--color-navy-900)', borderTop: '3px solid var(--color-gold)',
    }}>
      {TABS.map((it) => {
        const on = it.id === active;
        return (
          <button key={it.id} type="button" onClick={() => onChange(it.id)}
            style={{
              position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', gap: 4, minHeight: 56, padding: '8px 2px',
              borderRadius: 0, cursor: 'pointer', border: 'none',
              background: on ? 'rgba(201,166,107,0.16)' : 'transparent',
              borderTop: `3px solid ${on ? 'var(--color-gold)' : 'transparent'}`, marginTop: -3,
              color: on ? 'var(--color-gold)' : '#E8DFCB',
            }}>
            <Sprite name={it.icon} size={22} className={on ? '' : 'opacity-75'} />
            <span className="rof-label" style={{ letterSpacing: '0.04em' }}>{it.label}</span>
            <span className="rof-cjk" style={{ fontSize: 'var(--text-small)', lineHeight: 1 }}>{it.cn}</span>
          </button>
        );
      })}
    </nav>
  );
}

/* ------------------------------------------------------------ status bar */

/** The mock status strip from the design. Decorative; hidden from readers. */
export function StatusStrip() {
  return (
    <div aria-hidden style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '3px 10px', background: 'var(--color-navy-900)', color: 'var(--color-parchment)',
      fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-small)', letterSpacing: '0.06em',
    }}>
      <span>REPUBLIC</span>
      <span style={{ display: 'flex', alignItems: 'flex-end', gap: 2 }}>
        {[4, 6, 8, 10].map((h) => <i key={h} style={{ width: 3, height: h, background: 'var(--color-parchment)', display: 'block' }} />)}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ page */

/** Standard page padding — the design's 16/14 gutter and 18px stack gap. */
export function Page({ children }: { children: ReactNode }) {
  return <div style={{ padding: '16px 14px 28px', display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 18 }}>{children}</div>;
}

export { Bi };
