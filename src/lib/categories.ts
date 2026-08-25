/**
 * The colour each Hidden World category is drawn in.
 *
 * This lived in `lib/seed.ts` — the demo-data module — so every screen that
 * renders a real member's Hidden World was importing from the fixtures. Harmless
 * until someone deletes the seed file, and misleading before then: it reads as
 * though the colours are part of the sample data rather than part of the design.
 *
 * The values are deliberately literal rather than CSS variables: they are passed
 * to inline `style` for chip backgrounds and dots, where a `var()` would work but
 * a `Record<string, string>` of tokens is easier to index by category id.
 */
export const CATEGORY_COLORS: Record<string, string> = {
  craft: '#8f7044',
  nature: '#465a49',
  mind: '#405069',
  build: '#5a4a6a',
  money: '#6f552f',
  art: '#8a3a32',
};

/** What an unknown or missing category falls back to. */
export const CATEGORY_FALLBACK = CATEGORY_COLORS.craft;

export function categoryColor(id: string | null | undefined): string {
  return (id && CATEGORY_COLORS[id]) || CATEGORY_FALLBACK;
}
