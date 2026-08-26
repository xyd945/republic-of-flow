/**
 * Two glyphs, whatever the name.
 *
 * The avatar box is sized for exactly two, and the type scale was tuned
 * against that assumption. A third glyph puts the letters back through the
 * frame at every size in the app — which is the bug the sizing change was
 * meant to end.
 *
 * The helper is duplicated here because it lives inside a 'use client' screen
 * module. The guard at the bottom is what stops that copy from drifting.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function initialsOf(fullName: string): string {
  const words = fullName.split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  const raw = words.length === 1 ? words[0] : words[0][0] + words[1][0];
  return [...raw.toUpperCase()].slice(0, 2).join('');
}

const glyphs = (s: string) => [...s].length;

test('a ligature cannot expand past two glyphs', () => {
  // Uppercasing AFTER slicing was the bug: "ﬃ" became "FFI".
  assert.equal(initialsOf('ﬃ'), 'FF');
  assert.equal(glyphs(initialsOf('ﬃ')), 2);
  assert.equal(glyphs(initialsOf('ßa')), 2);
});

test('CJK, Korean and Thai names give two glyphs', () => {
  for (const name of ['迪迦奥特曼', '김지수', 'พิชญ์ สุขสวัสดิ์', '陈思远', '田中ゆき']) {
    assert.ok(glyphs(initialsOf(name)) <= 2, `${name} -> ${initialsOf(name)}`);
  }
});

test('ordinary names still read correctly', () => {
  assert.equal(initialsOf('Mariana Voss'), 'MV');
  assert.equal(initialsOf('Yudi'), 'YU');
  assert.equal(initialsOf('X'), 'X');
  assert.equal(initialsOf(''), '');
  assert.equal(initialsOf('   '), '');
});

test('an emoji is never cut in half', () => {
  // Sliced by UTF-16 unit this would return half a surrogate pair and render
  // as a replacement character.
  const out = initialsOf('🌊ocean');
  assert.equal(glyphs(out), 2);
  assert.ok(!out.includes('�'), 'no broken surrogate');
});

test('Avatar clamps whatever it is handed', () => {
  // profiles.initials is unconstrained text and members can write it directly,
  // so the component cannot rely on initialsOf() having been used at all.
  const src = readFileSync('src/components/pixel/index.tsx', 'utf8');
  assert.match(src, /\[\.\.\.\(initials \?\? ''\)\]\.slice\(0, 2\)/,
    'Avatar must clamp to two code points itself');
  assert.match(src, /overflow: 'hidden'/,
    'and clip as a backstop — clipped is survivable, spilling is not');
});

test('the copy above has not drifted from the screen', () => {
  const src = readFileSync('src/app/(app)/profile/page.tsx', 'utf8');
  assert.match(src, /\[\.\.\.raw\.toUpperCase\(\)\]\.slice\(0, 2\)\.join\(''\)/,
    'profile/page.tsx must still uppercase before slicing, by code point');
});
