/**
 * The Republic's cohorts. Stored verbatim in profiles.class_name, so the
 * strings here must match the column's values (and its default in the
 * foundation migration) exactly.
 *
 * The database keeps its own copy of this list in is_known_class(), because a
 * member could otherwise set any string on themselves through the API. Adding
 * a cohort means changing both — this array and that function — or the
 * dropdown offers a class the database refuses to accept.
 */

/** The cohorts currently in the programme. Each gets its own filter tab. */
export const CURRENT_CLASSES = ['Class 26', 'Class 27'] as const;

/**
 * Earlier years, filtered together as "Alumni". They are listed individually
 * when someone sets their own class — a member knows which year they were —
 * but eight tabs across a phone screen pushed the two current cohorts off the
 * edge of the directory, which is the filter almost everyone actually wants.
 */
export const ALUMNI_CLASSES = [
  'Class 20', 'Class 21', 'Class 22', 'Class 23', 'Class 24', 'Class 25',
] as const;

export const CLASSES = [...ALUMNI_CLASSES, ...CURRENT_CLASSES] as const;

export type ClassName = (typeof CLASSES)[number];

export const DEFAULT_CLASS: ClassName = 'Class 26';

/** The directory's filter ids: the current cohorts, plus one for everyone else. */
export const ALUMNI_FILTER = 'alumni';

export function isAlumniClass(className: string): boolean {
  return (ALUMNI_CLASSES as readonly string[]).includes(className);
}
