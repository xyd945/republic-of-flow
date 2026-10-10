import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildArchive, dayNumber, type ArchiveFounder } from '../src/lib/archive.ts';
import type { ArchiveEvent, ArchiveNote } from '../src/types/index.ts';

/*
 * Timestamps sit at noon UTC so the local calendar day is the same in every
 * timezone a developer is likely to run this in.
 */
const at = (day: string) => `${day}T12:00:00Z`;

/** A few minutes apart within the same noon hour, for ordering inside one day. */
const atMinute = (day: string, m: number) => `${day}T11:${String(30 + m).padStart(2, '0')}:00Z`;

let n = 0;
const founder = (day: string, no = ++n): ArchiveFounder => ({
  id: `p${no}`, founder_no: no, full_name: `Founder ${no}`, native_name: null,
  initials: 'FF', class_name: 'Class 26', joined_at: at(day),
});
const meeting = (day: string, title = 'A listing'): ArchiveEvent => ({
  kind: 'meeting', happened_at: at(day), listing_type: 'offer', listing_title: { en: title },
});
const note = (day: string, title: string, created = at(day)): ArchiveNote => ({
  id: title, author_profile_id: 'c1', happened_on: day, title, body: '', images: [], created_at: created, updated_at: created,
});

describe('buildArchive', () => {
  it('is empty when nobody has arrived', () => {
    const a = buildArchive({ founders: [], events: [], notes: [] });
    assert.equal(a.founding, null);
    assert.deepEqual(a.entries, []);
  });

  it('opens with the first founder and groups later arrivals by day, newest first', () => {
    n = 0;
    const a = buildArchive({
      founders: [founder('2026-09-12'), founder('2026-09-01'), founder('2026-09-12'), founder('2026-10-06')],
      events: [], notes: [],
    });
    assert.equal(a.founding, '2026-09-01');
    assert.deepEqual(a.entries.map((e) => [e.kind, e.day]), [
      ['founders', '2026-10-06'],
      ['founders', '2026-09-12'],
      ['founding', '2026-09-01'],
    ]);
    const founding = a.entries.at(-1)!;
    assert.equal(founding.kind === 'founding' && founding.founder.founder_no, 2, 'the earliest arrival opens it, whatever their number');
    assert.equal(dayNumber(a.founding, '2026-09-12'), 12);
    assert.equal(dayNumber(a.founding, '2026-08-31'), null);
  });

  it('marks the tenth founder, on the day they arrived, by name', () => {
    n = 0;
    const founders = Array.from({ length: 11 }, (_, i) => founder(`2026-09-${String(i + 1).padStart(2, '0')}`));
    const a = buildArchive({ founders, events: [], notes: [] });
    const milestone = a.entries.find((e) => e.kind === 'founder_milestone');
    assert.ok(milestone && milestone.kind === 'founder_milestone');
    assert.equal(milestone.count, 10);
    assert.equal(milestone.day, '2026-09-10');
    assert.equal(milestone.founder.full_name, 'Founder 10');
    // A milestone leads its day, above that day's arrivals.
    const tenth = a.entries.filter((e) => e.day === '2026-09-10').map((e) => e.kind);
    assert.deepEqual(tenth, ['founder_milestone', 'founders']);
  });

  it('tells the first meeting once, as a first, and marks the tenth', () => {
    n = 0;
    const meetings = Array.from({ length: 10 }, (_, i) => meeting(`2026-09-${String(i + 10).padStart(2, '0')}`, `L${i + 1}`));
    const a = buildArchive({ founders: [founder('2026-09-01')], events: meetings, notes: [] });
    const kinds = a.entries.map((e) => e.kind);
    assert.equal(kinds.filter((k) => k === 'first_meeting').length, 1);
    assert.equal(kinds.filter((k) => k === 'meeting').length, 9, 'the first meeting is not also told as an ordinary one');
    const ten = a.entries.find((e) => e.kind === 'meeting_milestone');
    assert.ok(ten && ten.kind === 'meeting_milestone' && ten.count === 10 && ten.day === '2026-09-19');
    const firstMeeting = a.entries.find((e) => e.kind === 'first_meeting');
    assert.deepEqual(firstMeeting && 'listing' in firstMeeting && firstMeeting.listing.title, { en: 'L1' });
  });

  it("puts a curator's note first on its day, and a note before Day 1 in a prologue", () => {
    n = 0;
    const a = buildArchive({
      founders: [founder('2026-09-01'), founder('2026-10-04')],
      events: [{ kind: 'first_listing', happened_at: at('2026-10-04'), listing_type: 'wanted', listing_title: { en: 'Alps' } }],
      notes: [note('2026-10-04', 'Dinner'), note('2026-08-20', 'Before it all')],
    });
    assert.deepEqual(a.entries.filter((e) => e.day === '2026-10-04').map((e) => e.kind), ['note', 'first_listing', 'founders']);
    assert.deepEqual(a.chapters.map((c) => [c.key, c.number]), [['2026-10', 2], ['2026-09', 1], ['2026-08', 0]]);
  });

  it('folds a busy day\'s round numbers into one card, the highest, above that day\'s arrivals', () => {
    n = 0;
    const founders = [founder('2026-08-27')];
    // 21 more on one day: the 10th and the 20th to arrive are both among them.
    for (let i = 0; i < 21; i++) founders.push({ ...founder('2026-08-29'), joined_at: atMinute('2026-08-29', i) });
    const a = buildArchive({ founders, events: [], notes: [] });
    const day = a.entries.filter((e) => e.day === '2026-08-29');
    assert.deepEqual(day.map((e) => e.kind), ['founder_milestone', 'founders']);
    const m = day[0];
    assert.ok(m.kind === 'founder_milestone');
    assert.equal(m.count, 20);
    assert.deepEqual(m.passed, [10, 20]);
    assert.equal(m.founder.founder_no, 20);
  });

  it('orders a single day by when things happened, newest first', () => {
    n = 0;
    const day = '2026-09-10';
    const events: ArchiveEvent[] = [
      { kind: 'first_listing', happened_at: atMinute(day, 0), listing_type: 'wanted', listing_title: { en: 'Alps' } },
      ...Array.from({ length: 12 }, (_, i) => ({ ...meeting(day, `M${i + 1}`), happened_at: atMinute(day, i + 1) })),
    ];
    const a = buildArchive({ founders: [founder('2026-09-01')], events, notes: [] });
    const label = (e: (typeof a.entries)[number]) =>
      e.kind === 'meeting_milestone' ? `milestone ${e.count}`
      : 'listing' in e ? `${e.kind} ${e.listing.title.en}` : e.kind;
    assert.deepEqual(a.entries.filter((e) => e.day === day).map(label), [
      'meeting M12', 'meeting M11',
      'milestone 10', 'meeting M10',
      'meeting M9', 'meeting M8', 'meeting M7', 'meeting M6', 'meeting M5', 'meeting M4', 'meeting M3', 'meeting M2',
      'first_meeting M1',
      'first_listing Alps',
    ]);
  });
});
