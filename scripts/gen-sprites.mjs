/**
 * Draws the icons that cannot be fetched.
 *
 * Four of the design's icons will not survive the trip out of the design
 * project: their pixel data arrives with a CRC mismatch every time, freshly
 * fetched, so the bytes are corrupted in transit rather than in transcription.
 * A file that arrives that way still reports the right size to `sips` and a
 * non-zero naturalWidth to a browser, and Chrome draws whatever unpacks before
 * the damage — so it looks fine while being broken.
 *
 * Rather than ship that, these are drawn here as pixel grids and emitted as
 * SVG. In a bitmap system an icon IS a grid of squares, so nothing is lost by
 * describing it that way, and a great deal is gained: it is text, so git can
 * diff it and nothing can corrupt it in transit; it is resolution-independent,
 * so it stays crisp at 14px in a meta row and at 26px in a stat cell.
 *
 * Replace any of these with the real artwork the moment it can be copied in.
 *
 * Run: node scripts/gen-sprites.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';

const C = {
  '#': '#0F1E34',  // navy — outline
  'G': '#C9A66B',  // gold
  'P': '#F5EDD8',  // parchment
  'B': '#1E3556',  // navy mid
  'R': '#9C3B2E',  // red
  'S': '#8FA98C',  // sage
};

/* 16x16. '.' is transparent. */
const ICONS = {
  // an open book — the tab bar's "You", and the class line on a dossier
  'nav-journal': [
    '................',
    '................',
    '..###......###..',
    '.#PPP##..##PPP#.',
    '.#PPPP#GG#PPPP#.',
    '.#PPPP#GG#PPPP#.',
    '.#PPPP#GG#PPPP#.',
    '.#PPPP#GG#PPPP#.',
    '.#PPPP#GG#PPPP#.',
    '.#PPPP#GG#PPPP#.',
    '.#PPPP#GG#PPPP#.',
    '.#PPPPP##PPPPP#.',
    '..#############.',
    '................',
    '................',
    '................',
  ],
  // a lit bulb — the introduction, the human sentence
  'idea': [
    '................',
    '.......##.......',
    '....#..GG..#....',
    '.....#.GG.#.....',
    '.....GGGGGG.....',
    '....GG####GG....',
    '...GG#PPPP#GG...',
    '...G#PPPPPP#G...',
    '...G#PPPPPP#G...',
    '....#PPPPPP#....',
    '.....#PPPP#.....',
    '.....######.....',
    '......#GG#......',
    '......#GG#......',
    '.......##.......',
    '................',
  ],
  // a rosette — the languages a member speaks
  'stat-badges': [
    '................',
    '.....######.....',
    '...##GGGGGG##...',
    '..#GG######GG#..',
    '..#G#PPPPPP#G#..',
    '.#GG#P#GG#P#GG#.',
    '.#G#PP#GG#PP#G#.',
    '.#G#PPPGGPPP#G#.',
    '..#G#PPPPPP#G#..',
    '..##GG####GG##..',
    '....########....',
    '.....#R##R#.....',
    '.....#R##R#.....',
    '.....#R##R#.....',
    '......####......',
    '................',
  ],
  // a sealed scroll — the curator's desk
  'nav-constitution': [
    '................',
    '..############..',
    '.#GGGGGGGGGGGG#.',
    '.#G##########G#.',
    '.#GPPPPPPPPPPG#.',
    '.#GP########PG#.',
    '.#GPPPPPPPPPPG#.',
    '.#GP########PG#.',
    '.#GPPPPPPPPPPG#.',
    '.#GP######PPPG#.',
    '.#GPPPPPPPPPPG#.',
    '.#G##########G#.',
    '.#GGGGGGGGGGGG#.',
    '..#####RR#####..',
    '.......RR.......',
    '................',
  ],
};

function svg(grid) {
  const n = grid.length;
  // Merge horizontal runs so the file stays small and the rects stay aligned.
  const rects = [];
  grid.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      if (ch === '.') { x++; continue; }
      let w = 1;
      while (x + w < row.length && row[x + w] === ch) w++;
      rects.push(`<rect x="${x}" y="${y}" width="${w}" height="1" fill="${C[ch]}"/>`);
      x += w;
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" `
    + `shape-rendering="crispEdges" role="img">${rects.join('')}</svg>\n`;
}

mkdirSync('public/ds/icons', { recursive: true });
for (const [name, grid] of Object.entries(ICONS)) {
  const out = `public/ds/icons/${name}.svg`;
  const body = svg(grid);
  writeFileSync(out, body);
  console.log(`  ${out.padEnd(38)} ${body.length} bytes`);
}
