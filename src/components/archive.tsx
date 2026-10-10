'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n/context';
import { dayNumber, roman, type ArchiveChapter, type ArchiveEntry, type ArchiveFounder } from '@/lib/archive';
import { usePhotoLinks } from '@/lib/data/photos';
import { PhotoCover } from '@/components/photos';
import { Avatar, Button, Panel, Sprite, StatusChip } from '@/components/pixel';

/**
 * How the Archive reads aloud: the words for each kind of entry, and the card
 * each one sits on. Shared by the Archive page and its card on Home, so the
 * latest entry says the same thing in both places.
 */

/** "{n} founders" → "38 founders". Unknown names are left as they are. */
export const fill = (s: string, vars: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

const ICON: Record<ArchiveEntry['kind'], string> = {
  founding: 'nav-constitution',
  founders: 'stat-friends',
  founder_milestone: 'stat-friends',
  meeting_milestone: 'handshake',
  first_meeting: 'star',
  first_listing: 'nav-auction',
  meeting: 'handshake',
  note: 'nav-journal',
};

/** The timeline's square for each kind: gold for the days that count. */
export const NODE: Record<ArchiveEntry['kind'], string> = {
  founding: 'var(--color-gold)',
  founders: 'var(--color-navy-700)',
  founder_milestone: 'var(--color-gold)',
  meeting_milestone: 'var(--color-gold)',
  first_meeting: 'var(--color-gold)',
  first_listing: 'var(--color-gold)',
  meeting: 'var(--color-navy-700)',
  note: 'var(--color-brown)',
};

export function useArchiveWords() {
  const { t, ui, lang } = useI18n();
  const locale = lang === 'zh' ? 'zh-CN' : 'en-US';
  const typeWord = (type: 'wanted' | 'offer') => ui(type === 'wanted' ? 'archive.wanted' : 'archive.offer');
  const inSentence = (type: 'wanted' | 'offer') => ui(type === 'wanted' ? 'archive.a_wanted' : 'archive.an_offer');

  const calendar = (day: string) => {
    const [y, m, d] = day.split('-').map(Number);
    return new Date(y, m - 1, d);
  };

  const dateLabel = (day: string, founding: string | null) => {
    const date = new Intl.DateTimeFormat(locale, { month: 'short', day: lang === 'zh' ? 'numeric' : '2-digit' }).format(calendar(day));
    const n = dayNumber(founding, day);
    return `${date} · ${n ? fill(ui('archive.day_n'), { n }) : ui('archive.before_day_one')}`;
  };

  const monthLabel = (c: ArchiveChapter) =>
    new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(new Date(c.year, c.month - 1, 1));

  const chapterLabel = (c: ArchiveChapter) =>
    c.number ? fill(ui('archive.chapter'), { n: lang === 'zh' ? c.number : roman(c.number) }) : ui('archive.prologue');

  const names = (fs: ArchiveFounder[]) =>
    fs.slice(0, 3).map((f) => f.full_name).join(', ') + (fs.length > 3 ? ` +${fs.length - 3}` : '');

  /** The words for one entry: its kind, its headline, a line of detail. */
  const describe = (e: ArchiveEntry): { what: string; title: string; body: string; icon: string } => {
    const icon = ICON[e.kind];
    switch (e.kind) {
      case 'founding':
        return { what: ui('archive.chip_first'), title: ui('archive.founding_title'), body: ui('archive.founding_body'), icon };
      case 'founders':
        return {
          what: ui('archive.chip_founders'),
          title: e.founders.length === 1 ? ui('archive.arrived_one') : fill(ui('archive.arrived_many'), { n: e.founders.length }),
          body: names(e.founders),
          icon,
        };
      case 'founder_milestone':
        return {
          what: ui('archive.chip_milestone'),
          title: fill(ui('archive.founders_title'), { n: e.count }),
          body: fill(ui('archive.founders_body'), { no: String(e.founder.founder_no).padStart(2, '0'), name: e.founder.full_name, n: e.count }),
          icon,
        };
      case 'meeting_milestone':
        return {
          what: ui('archive.chip_milestone'),
          title: fill(ui('archive.meetings_title'), { n: e.count }),
          body: fill(ui('archive.meetings_body'), { n: e.count }),
          icon,
        };
      case 'first_meeting':
        return {
          what: ui('archive.chip_first'),
          title: ui('archive.first_meeting_title'),
          body: fill(ui('archive.first_meeting_body'), { type: inSentence(e.listing.type), listing: t(e.listing.title) }),
          icon,
        };
      case 'first_listing':
        return {
          what: ui('archive.chip_first'),
          title: ui('archive.first_listing_title'),
          body: fill(ui('archive.first_listing_body'), { type: inSentence(e.listing.type), listing: t(e.listing.title) }),
          icon,
        };
      case 'meeting':
        return { what: ui('archive.chip_met'), title: t(e.listing.title), body: fill(ui('archive.met_body'), { listing: t(e.listing.title) }), icon };
      case 'note':
        return { what: ui('archive.from_curator'), title: e.note.title, body: e.note.body, icon };
    }
  };

  return { t, ui, lang, typeWord, dateLabel, monthLabel, chapterLabel, describe };
}

/* ------------------------------------------------------------------ cards */

const headline = (size: string): React.CSSProperties => ({
  margin: 0, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: size, lineHeight: 1.35,
  letterSpacing: 'var(--tracking-display)', textTransform: 'uppercase', color: 'var(--color-ink)',
});

const prose: React.CSSProperties = {
  margin: '6px 0 0', fontSize: 'var(--text-body)', lineHeight: 1.6, color: 'var(--color-ink-2)',
};

/** A listing's cover, as a picture only — a meeting card opens nothing. */
function ListingCover({ path }: { path: string }) {
  const links = usePhotoLinks([path], 'thumb');
  const src = links.data?.get(path);
  return (
    <div style={{
      aspectRatio: '16 / 9', overflow: 'hidden', marginBottom: 12,
      border: '2px solid var(--color-navy-900)', background: 'var(--color-mist-tint)',
    }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src ? <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : null}
    </div>
  );
}

function FounderRow({ f, last }: { f: ArchiveFounder; last: boolean }) {
  const router = useRouter();
  const { ui } = useI18n();
  return (
    <button type="button" onClick={() => router.push(`/people/${f.id}`)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 52, padding: '9px 0',
        background: 'transparent', border: 'none', borderBottom: last ? 'none' : '2px solid var(--color-line-soft)',
        textAlign: 'left', font: 'inherit', color: 'inherit', cursor: 'pointer',
      }}>
      <Avatar initials={f.initials} id={f.id} size={34} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontWeight: 600, color: 'var(--color-ink)' }}>
          {f.full_name}{f.native_name ? ` · ${f.native_name}` : ''}
        </span>
        <span style={{ display: 'block', fontSize: 'var(--text-small)', color: 'var(--color-muted)', marginTop: 2 }}>{f.class_name}</span>
      </span>
      <span className="rof-label" style={{ color: 'var(--color-brown)' }}>
        {fill(ui('archive.no'), { no: String(f.founder_no).padStart(2, '0') })}
      </span>
    </button>
  );
}

/** Up to four in full; a busy day folds behind a stack of faces. */
function FoundersCard({ founders, title }: { founders: ArchiveFounder[]; title: string }) {
  const { ui } = useI18n();
  const [open, setOpen] = useState(false);
  const folds = founders.length > 4;
  return (
    <Panel pad={13}>
      <StatusChip tone="active">{ui('archive.chip_founders')}</StatusChip>
      <h2 style={{ ...headline('var(--text-h3)'), margin: '9px 0 10px' }}>{title}</h2>
      {folds && !open ? (
        <div className="flex items-center" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div className="flex" style={{ paddingLeft: 8 }}>
            {founders.slice(0, 4).map((f) => (
              <span key={f.id} style={{ marginLeft: -8 }}><Avatar initials={f.initials} id={f.id} size={34} /></span>
            ))}
            <span className="rof-label" style={{
              marginLeft: -8, width: 34, height: 34, display: 'grid', placeItems: 'center', boxSizing: 'border-box',
              background: 'var(--color-gold-tint)', color: '#6B5223', border: '2px solid var(--color-navy-900)', letterSpacing: 0,
            }}>+{founders.length - 4}</span>
          </div>
          <span style={{ fontSize: 'var(--text-small)', color: 'var(--color-muted)' }}>
            {fill(ui('archive.arrived_range'), {
              a: String(founders[0].founder_no).padStart(2, '0'),
              b: String(founders[founders.length - 1].founder_no).padStart(2, '0'),
            })}
          </span>
        </div>
      ) : (
        <div style={{ borderTop: '2px solid var(--color-line-soft)' }}>
          {founders.map((f, i) => <FounderRow key={f.id} f={f} last={i === founders.length - 1} />)}
        </div>
      )}
      {folds && (
        <div style={{ marginTop: 14 }}>
          <Button tone="secondary" size="lg" block onClick={() => setOpen((o) => !o)}>
            {open ? ui('archive.show_less') : fill(ui('archive.show_all'), { n: founders.length })}
          </Button>
        </div>
      )}
    </Panel>
  );
}

export function EntryCard({
  entry, author, canManage, onEdit, onRemove, onPhotos,
}: {
  entry: ArchiveEntry;
  /** A note's author, by name, if the reader can see them. */
  author?: string;
  canManage?: boolean;
  onEdit?: () => void;
  onRemove?: () => void;
  onPhotos?: () => void;
}) {
  const { ui, typeWord, describe } = useArchiveWords();
  const w = describe(entry);

  switch (entry.kind) {
    case 'founders':
      return <FoundersCard founders={entry.founders} title={w.title} />;

    case 'meeting':
      return (
        <Panel pad={13}>
          {entry.listing.cover ? <ListingCover path={entry.listing.cover} /> : null}
          <div className="flex" style={{ gap: 6, flexWrap: 'wrap' }}>
            <StatusChip tone="completed">{ui('archive.chip_met')}</StatusChip>
            <StatusChip tone={entry.listing.type}>{typeWord(entry.listing.type)}</StatusChip>
          </div>
          <div className="rof-label" style={{ color: 'var(--color-muted)', marginTop: 12 }}>{ui('archive.met_over')}</div>
          <h2 style={{ ...headline('var(--text-h3)'), marginTop: 6 }}>{w.title}</h2>
        </Panel>
      );

    case 'note':
      return (
        <div style={{
          background: 'var(--color-parchment)', border: '2px solid var(--color-brown)', padding: 14,
          boxShadow: 'var(--shadow-px)',
        }}>
          <div className="flex items-center" style={{ gap: 8 }}>
            <Sprite name="nav-journal" size={18} />
            <span className="rof-label" style={{ color: '#6B4E25' }}>{w.what}</span>
          </div>
          <h2 style={{ ...headline('var(--text-h3)'), marginTop: 10, textTransform: 'none' }}>{w.title}</h2>
          {entry.note.images.length > 0 && onPhotos ? (
            <PhotoCover images={entry.note.images} label={`${ui('archive.view_photos')} — ${w.title}`} onOpen={onPhotos}
              style={{ marginTop: 12, border: '2px solid var(--color-brown)' }} />
          ) : null}
          {w.body ? <p style={{ ...prose, marginTop: 12, lineHeight: 1.65, whiteSpace: 'pre-line' }}>{w.body}</p> : null}
          <p className="rof-label" style={{ margin: '12px 0 0', color: '#6B4E25', fontSize: 11, textTransform: 'none' }}>
            {fill(ui('archive.signature'), { name: author ?? ui('archive.a_curator') })}
          </p>
          {canManage ? (
            <div className="flex" style={{ gap: 10, marginTop: 14, paddingTop: 12, borderTop: '2px dashed #B89A6A' }}>
              <Button tone="secondary" size="sm" onClick={onEdit}>{ui('market.edit')}</Button>
              <Button tone="secondary" size="sm" onClick={onRemove}>{ui('archive.remove')}</Button>
            </div>
          ) : null}
        </div>
      );

    case 'founding':
      return (
        <Panel tone="navy" pad={16}>
          <div className="flex items-center" style={{ gap: 14 }}>
            <Avatar initials={entry.founder.initials} id={entry.founder.id} size={48} featured />
            <div style={{ minWidth: 0 }}>
              <span className="rof-label" style={{ color: 'var(--color-gold)' }}>
                {fill(ui('archive.founder_no'), { no: String(entry.founder.founder_no).padStart(2, '0') })}
              </span>
              <div style={{ fontWeight: 600, marginTop: 5 }}>{entry.founder.full_name}</div>
            </div>
          </div>
          <h2 style={{ ...headline('var(--text-h2)'), color: 'var(--color-on-navy)', marginTop: 16 }}>{w.title}</h2>
          <p style={{ ...prose, color: '#E8DFCB' }}>{w.body}</p>
        </Panel>
      );

    default:
      // Milestones and firsts: the gold plate.
      return (
        <Panel tone="gold" pad={14}>
          <div className="flex items-start" style={{ gap: 14 }}>
            <Sprite name={w.icon} size={36} />
            <div style={{ minWidth: 0 }}>
              <StatusChip tone="matched">{w.what}</StatusChip>
              <h2 style={{ ...headline('var(--text-h2)'), marginTop: 9, lineHeight: 1.3 }}>{w.title}</h2>
              <p style={prose}>{w.body}</p>
            </div>
          </div>
        </Panel>
      );
  }
}
