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
import { useI18n } from '@/lib/i18n/context';
import { Bi, Sprite } from './index';

/* --------------------------------------------------------------- top bar */

export function TopBar({
  title, cn, onBack, right,
}: { title?: string; cn?: string; onBack?: () => void; right?: ReactNode }) {
  const { lang } = useI18n();
  const cjk = lang === 'zh' && !!cn;
  return (
    <header style={{
      display: 'flex', alignItems: 'center', gap: 10,
      minHeight: 56, padding: '0 12px', background: 'var(--color-navy-900)',
      color: 'var(--color-on-navy)', borderBottom: '3px solid var(--color-gold)',
    }}>
      {onBack ? (
        /* A drawn chevron, not a "<" in a box. 30 wide, 44 tall: the design
           gives the target its height without drawing a button frame. */
        <button type="button" onClick={onBack} aria-label="Back"
          style={{
            display: 'grid', placeItems: 'center', width: 30, height: 44, flex: 'none',
            background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
          }}>
          <span aria-hidden style={{
            width: 0, height: 0,
            borderTop: '6px solid transparent', borderBottom: '6px solid transparent',
            borderRight: '8px solid var(--color-gold)',
          }} />
        </button>
      ) : null}

      {title ? (
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontFamily: cjk ? 'var(--font-cjk)' : 'var(--font-display)', fontWeight: 700,
            fontSize: 'var(--text-h3)',
            letterSpacing: cjk ? 0 : 'var(--tracking-label)',
            textTransform: cjk ? 'none' : 'uppercase', lineHeight: 1.2,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{cjk ? cn : title}</div>
        </div>
      ) : (
        <span className="rof-label" style={{
          flex: 1, color: 'var(--color-gold)', fontSize: 'var(--text-h3)', whiteSpace: 'nowrap',
        }}>REPUBLIC OF FLOW</span>
      )}
      {right}
    </header>
  );
}

/* -------------------------------------------------------- language switch */

export function LangSwitch({ lang, onChange }: { lang: string; onChange: (l: 'en' | 'zh') => void }) {
  /* The design's own switcher: 中文 first, EN second, body-size type, 6/12
     padding, a gold divider between them and a translucent navy ground. */
  const items = [
    { code: 'zh' as const, label: '中文' },
    { code: 'en' as const, label: 'EN' },
  ];
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'stretch', flex: 'none',
      border: '2px solid var(--color-gold)', background: 'rgba(15,30,52,0.5)', borderRadius: 0,
    }}>
      {items.map((l, i) => {
        const on = l.code === lang;
        return (
          <button key={l.code} type="button" onClick={() => onChange(l.code)} aria-pressed={on}
            style={{
              padding: '6px 12px',
              background: on ? 'var(--color-gold)' : 'transparent',
              color: on ? 'var(--color-navy-900)' : 'var(--color-gold)',
              border: 'none', borderLeft: i ? '2px solid var(--color-gold)' : 'none',
              borderRadius: 0, cursor: 'pointer', lineHeight: 1,
              fontFamily: l.code === 'zh' ? 'var(--font-cjk)' : 'var(--font-display)',
              fontWeight: 700, fontSize: 'var(--text-body)',
              letterSpacing: l.code === 'zh' ? 0 : 'var(--tracking-label)',
            }}>{l.label}</button>
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------- notification */

export function BellButton({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label="Notifications"
      style={{
        position: 'relative', width: 30, height: 44, flex: 'none', display: 'grid', placeItems: 'center', cursor: 'pointer',
        background: 'transparent', border: 'none', borderRadius: 0, padding: 0,
        color: 'var(--color-gold)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-h2)', lineHeight: 1,
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
  const { lang } = useI18n();
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
            <span className={lang === 'zh' ? 'rof-cjk' : 'rof-label'}
              style={{ fontSize: 'var(--text-small)', letterSpacing: lang === 'zh' ? 0 : 'var(--tracking-nav)', lineHeight: 1 }}>
              {lang === 'zh' ? it.cn : it.label}
            </span>
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
