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
export const CLASSES = [
  'Class 20', 'Class 21', 'Class 22', 'Class 23',
  'Class 24', 'Class 25', 'Class 26', 'Class 27',
] as const;

export type ClassName = (typeof CLASSES)[number];

export const DEFAULT_CLASS: ClassName = 'Class 26';
