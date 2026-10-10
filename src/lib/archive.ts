import type { ArchiveEvent, ArchiveNote, Translatable } from '@/types';

/**
 * The Archive's story, built from facts the app already has (issue #4).
 *
 * Nothing here is stored: arrivals come from profiles.joined_at, meetings and
 * the Market's opening from archive_events(), and only the curators' notes are
 * written by anyone. So the history can never drift from what happened — and
 * a milestone is simply the Nth of something.
 *
 * Kept free of React and of the network so the rules can be tested directly
 * (tests/archive.test.ts).
 */

export type ArchiveFounder = {
  id: string;
  founder_no: number;
  full_name: string;
  native_name: string | null;
  initials: string;
  class_name: string;
  joined_at: string;
};

export type ListingRef = { type: 'wanted' | 'offer'; title: Translatable };

/** `day` is a local calendar day, YYYY-MM-DD. */
export type ArchiveEntry =
  | { kind: 'founding'; day: string; founder: ArchiveFounder }
  | { kind: 'founders'; day: string; founders: ArchiveFounder[] }
  | { kind: 'founder_milestone'; day: string; count: number; founder: ArchiveFounder }
  | { kind: 'meeting_milestone'; day: string; count: number }
  | { kind: 'first_meeting'; day: string; listing: ListingRef }
  | { kind: 'first_listing'; day: string; listing: ListingRef }
  | { kind: 'meeting'; day: string; listing: ListingRef }
  | { kind: 'note'; day: string; note: ArchiveNote };

export type ArchiveChapter = {
  key: string;
  year: number;
  /** 1–12. */
  month: number;
  /** 1 for the founding month; 0 for anything a curator dates before it. */
  number: number;
  entries: ArchiveEntry[];
};

export type Archive = {
  /** The day the Republic opened — the first founder's arrival — or null if nobody has. */
  founding: string | null;
  entries: ArchiveEntry[];
  chapters: ArchiveChapter[];
};

/** Round numbers worth a line of their own. The first meeting is its own entry. */
export const FOUNDER_MILESTONES = [10, 20, 30, 50, 75, 100, 150, 200, 300, 500];
export const MEETING_MILESTONES = [10, 25, 50, 100, 200, 500];

const pad = (n: number) => String(n).padStart(2, '0');

/** The reader's local calendar day for a timestamp. */
export function localDay(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Whole days from one calendar day to another. */
export function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

/** "Day 1" is the founding day. Null for a day before it. */
export function dayNumber(founding: string | null, day: string): number | null {
  if (!founding) return null;
  const n = daysBetween(founding, day) + 1;
  return n >= 1 ? n : null;
}

/*
 * Within one day the newest-first order cannot come from timestamps alone —
 * a note has only a date — so it comes from what kind of thing it is: the
 * curator's story first, then what the day achieved, then the arrivals, and
 * the founding always last because it is where everything starts.
 */
const RANK: Record<ArchiveEntry['kind'], number> = {
  note: 0,
  founder_milestone: 1,
  meeting_milestone: 1,
  first_meeting: 1,
  first_listing: 1,
  meeting: 2,
  founders: 3,
  founding: 4,
};

export function buildArchive({
  founders, events, notes,
}: {
  founders: ArchiveFounder[];
  events: ArchiveEvent[];
  notes: ArchiveNote[];
}): Archive {
  const entries: ArchiveEntry[] = [];

  // ---- arrivals
  const arrived = [...founders].sort((a, b) =>
    a.joined_at === b.joined_at ? a.founder_no - b.founder_no : a.joined_at < b.joined_at ? -1 : 1);
  const founding = arrived.length ? localDay(arrived[0].joined_at) : null;

  if (arrived.length) {
    entries.push({ kind: 'founding', day: founding!, founder: arrived[0] });
    const byDay = new Map<string, ArchiveFounder[]>();
    for (const f of arrived.slice(1)) {
      const day = localDay(f.joined_at);
      byDay.set(day, [...(byDay.get(day) ?? []), f]);
    }
    for (const [day, group] of byDay) entries.push({ kind: 'founders', day, founders: group });
    for (const count of FOUNDER_MILESTONES) {
      if (count > arrived.length) break;
      const founder = arrived[count - 1];
      entries.push({ kind: 'founder_milestone', day: localDay(founder.joined_at), count, founder });
    }
  }

  // ---- meetings: anonymous by construction, archive_events() carries no names
  const meetings = events
    .filter((e) => e.kind === 'meeting')
    .sort((a, b) => (a.happened_at < b.happened_at ? -1 : a.happened_at > b.happened_at ? 1 : 0));
  const ref = (e: ArchiveEvent): ListingRef => ({ type: e.listing_type, title: e.listing_title });
  // Pushed newest first, so the stable sort below keeps a busy day in order.
  for (let i = meetings.length - 1; i >= 0; i--) {
    const day = localDay(meetings[i].happened_at);
    entries.push(i === 0
      ? { kind: 'first_meeting', day, listing: ref(meetings[i]) }
      : { kind: 'meeting', day, listing: ref(meetings[i]) });
  }
  for (const count of MEETING_MILESTONES) {
    if (count > meetings.length) break;
    entries.push({ kind: 'meeting_milestone', day: localDay(meetings[count - 1].happened_at), count });
  }

  // ---- the Market opens
  const first = events.find((e) => e.kind === 'first_listing');
  if (first) entries.push({ kind: 'first_listing', day: localDay(first.happened_at), listing: ref(first) });

  // ---- curators' notes, newest written first within a day
  for (const note of [...notes].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))) {
    entries.push({ kind: 'note', day: note.happened_on, note });
  }

  entries.sort((a, b) => (a.day === b.day ? RANK[a.kind] - RANK[b.kind] : a.day < b.day ? 1 : -1));

  // ---- chapters: one per calendar month, counted from the founding month
  const start = founding ?? entries[entries.length - 1]?.day ?? null;
  const [sy, sm] = start ? start.split('-').map(Number) : [0, 0];
  const chapters: ArchiveChapter[] = [];
  for (const entry of entries) {
    const [year, month] = entry.day.split('-').map(Number);
    const key = `${year}-${pad(month)}`;
    let chapter = chapters[chapters.length - 1];
    if (!chapter || chapter.key !== key) {
      const n = (year - sy) * 12 + (month - sm) + 1;
      chapter = { key, year, month, number: Math.max(0, n), entries: [] };
      chapters.push(chapter);
    }
    chapter.entries.push(entry);
  }

  return { founding, entries, chapters };
}

/** I, II, III … for chapter numbers; a plain number past the twelfth. */
export function roman(n: number): string {
  const R = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
  return R[n] ?? String(n);
}
