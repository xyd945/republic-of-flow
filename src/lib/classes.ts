/**
 * The Republic's cohorts. Stored verbatim in profiles.class_name, so the
 * strings here must match the column's values (and its default in the
 * foundation migration) exactly.
 */
export const CLASSES = ['Class 26', 'Class 27'] as const;

export type ClassName = (typeof CLASSES)[number];

export const DEFAULT_CLASS: ClassName = 'Class 26';
