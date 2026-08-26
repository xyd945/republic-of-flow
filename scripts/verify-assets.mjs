/**
 * Proves every design asset actually decodes.
 *
 * Necessary because the usual checks lie: `sips` reports a size from IHDR
 * alone, and a browser reports naturalWidth > 0 and renders whatever inflates
 * before the corruption — so a PNG with a bad IDAT looks fine in both while
 * being quietly broken. Only inflating the pixel data and checking the chunk
 * CRCs catches it.
 *
 * Run: node scripts/verify-assets.mjs
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { inflateSync, crc32 } from 'node:zlib';
import { join } from 'node:path';

const roots = ['public/ds/icons', 'public/ds/sprites', 'public/ds/logo', 'public/icons', 'src/app'];
let bad = 0, seen = 0;

for (const dir of roots) {
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.png'))) {
    const p = join(dir, f);
    const d = readFileSync(p);
    seen++;
    const problems = [];
    if (d.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') problems.push('bad signature');
    if (d.subarray(-8).toString('hex') !== '49454e44ae426082') problems.push('no IEND (truncated)');
    let pos = 8, idat = [];
    while (pos < d.length - 8) {
      const len = d.readUInt32BE(pos);
      const type = d.subarray(pos + 4, pos + 8);
      const body = d.subarray(pos + 8, pos + 8 + len);
      const stored = d.readUInt32BE(pos + 8 + len);
      if (crc32(Buffer.concat([type, body])) >>> 0 !== stored) {
        problems.push(`${type.toString()} CRC mismatch`);
      }
      if (type.toString() === 'IDAT') idat.push(body);
      pos += 12 + len;
      if (type.toString() === 'IEND') break;
    }
    try { inflateSync(Buffer.concat(idat)); }
    catch (e) { problems.push(`IDAT will not inflate (${e.message})`); }
    if (problems.length) { bad++; console.log(`  BAD  ${p}\n         ${problems.join('; ')}`); }
  }
}
console.log(`\n${seen - bad}/${seen} assets verified${bad ? ` — ${bad} BROKEN` : ''}`);
process.exit(bad ? 1 : 0);
