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
  /** `count` is the highest round number reached that day; `passed` is every
      one reached that day, in order — a busy day can pass 10 and 20 at once. */
  | { kind: 'founder_milestone'; day: string; count: number; passed: number[]; founder: ArchiveFounder }
  | { kind: 'meeting_milestone'; day: string; count: number; passed: number[] }
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
 * Newest first, and within one day by the moment each thing happened. A
 * note has only a date, so a curator's story leads its day. A day's arrivals
 * sit where they began, so a milestone reached during the day reads above
 * them. When two things share a moment — the tenth meeting and the
 * "10 meetings" it earns — the milestone goes first, and the founding last,
 * because it is where everything starts.
 */
const TIE: Record<ArchiveEntry['kind'], number> = {
  note: 0,
  founder_milestone: 1,
  meeting_milestone: 1,
  first_meeting: 2,
  first_listing: 2,
  meeting: 3,
  founders: 4,
  founding: 5,
};

/**
 * Earlier first, to the microsecond. Compared as numbers, since timestamps
 * from the database and from JS differ in shape; but a number keeps only
 * milliseconds, so within one the database's own digits decide. Those all
 * come from the database in one shape, and the instant up to the millisecond
 * is the same, so comparing them as text compares what is left.
 */
function chrono(a: string, b: string): number {
  return Date.parse(a) - Date.parse(b) || (a < b ? -1 : a > b ? 1 : 0);
}

/** Round numbers reached, one entry per day: the highest, and all it passed. */
function milestonesByDay(thresholds: number[], reached: number, dayOf: (count: number) => string) {
  const byDay = new Map<string, number[]>();
  for (const count of thresholds) {
    if (count > reached) break;
    const day = dayOf(count);
    byDay.set(day, [...(byDay.get(day) ?? []), count]);
  }
  return [...byDay].map(([day, passed]) => ({ day, passed, count: passed[passed.length - 1] }));
}

export function buildArchive({
  founders, events, notes,
}: {
  founders: ArchiveFounder[];
  events: ArchiveEvent[];
  notes: ArchiveNote[];
}): Archive {
  const placed: { entry: ArchiveEntry; at: string }[] = [];
  const put = (entry: ArchiveEntry, at: string) => placed.push({ entry, at });

  // ---- arrivals
  const arrived = [...founders].sort((a, b) => chrono(a.joined_at, b.joined_at) || a.founder_no - b.founder_no);
  const founding = arrived.length ? localDay(arrived[0].joined_at) : null;

  if (arrived.length) {
    put({ kind: 'founding', day: founding!, founder: arrived[0] }, arrived[0].joined_at);
    const byDay = new Map<string, ArchiveFounder[]>();
    for (const f of arrived.slice(1)) {
      const day = localDay(f.joined_at);
      byDay.set(day, [...(byDay.get(day) ?? []), f]);
    }
    for (const [day, group] of byDay) put({ kind: 'founders', day, founders: group }, group[0].joined_at);
    for (const m of milestonesByDay(FOUNDER_MILESTONES, arrived.length, (n) => localDay(arrived[n - 1].joined_at))) {
      const founder = arrived[m.count - 1];
      put({ kind: 'founder_milestone', ...m, founder }, founder.joined_at);
    }
  }

  // ---- meetings: anonymous by construction, archive_events() carries no names
  const meetings = events
    .filter((e) => e.kind === 'meeting')
    .sort((a, b) => chrono(a.happened_at, b.happened_at));
  const ref = (e: ArchiveEvent): ListingRef => ({ type: e.listing_type, title: e.listing_title });
  meetings.forEach((m, i) => {
    const day = localDay(m.happened_at);
    put(i === 0
      ? { kind: 'first_meeting', day, listing: ref(m) }
      : { kind: 'meeting', day, listing: ref(m) }, m.happened_at);
  });
  for (const m of milestonesByDay(MEETING_MILESTONES, meetings.length, (n) => localDay(meetings[n - 1].happened_at))) {
    put({ kind: 'meeting_milestone', ...m }, meetings[m.count - 1].happened_at);
  }

  // ---- the Market opens
  const first = events.find((e) => e.kind === 'first_listing');
  if (first) put({ kind: 'first_listing', day: localDay(first.happened_at), listing: ref(first) }, first.happened_at);

  // ---- curators' notes: newest written first, when several share a day
  for (const note of notes) put({ kind: 'note', day: note.happened_on, note }, note.created_at);

  placed.sort((a, b) => {
    if (a.entry.day !== b.entry.day) return a.entry.day < b.entry.day ? 1 : -1;
    const an = a.entry.kind === 'note', bn = b.entry.kind === 'note';
    if (an !== bn) return an ? -1 : 1;
    // The kind decides only between entries at exactly the same instant.
    return chrono(b.at, a.at) || TIE[a.entry.kind] - TIE[b.entry.kind];
  });
  const entries = placed.map((p) => p.entry);

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
