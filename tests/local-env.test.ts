/**
 * The catch between `npm run test:authz` and the real members' accounts.
 *
 * Six cases, each a way the writing commands could end up pointed somewhere
 * they should not be. The loader is imported directly rather than mocked —
 * choosing the wrong file IS the failure being prevented.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadLocalSupabaseEnv } from '../scripts/local-env.ts';

const KEYS = 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=pub\nSUPABASE_SECRET_KEY=sec\n';
const HOSTED = 'NEXT_PUBLIC_SUPABASE_URL=https://abcdefgh.supabase.co\n';
const LOCAL = 'NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55321\n';

/** A throwaway directory holding the given files. */
function dirWith(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'rof-env-'));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  test.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('no .env.development.local is an error, never a fall back to .env.local', () => {
  // .env.local is production. Falling back to it is the original bug.
  const dir = dirWith({ '.env.local': HOSTED + KEYS });
  assert.throws(() => loadLocalSupabaseEnv(dir), /not found/);
});

test('a key missing from the file is an error, not filled in from .env.local', () => {
  const dir = dirWith({ '.env.development.local': LOCAL, '.env.local': HOSTED + KEYS });
  assert.throws(() => loadLocalSupabaseEnv(dir), /does not set .*PUBLISHABLE_KEY/);
});

test('an empty value counts as missing', () => {
  const dir = dirWith({
    '.env.development.local': LOCAL + 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=\nSUPABASE_SECRET_KEY=   \n',
  });
  assert.throws(() => loadLocalSupabaseEnv(dir), /does not set/);
});

test('a remote host is refused, with no way to say otherwise', () => {
  const dir = dirWith({ '.env.development.local': HOSTED + KEYS });
  assert.throws(() => loadLocalSupabaseEnv(dir), /Refusing to run against/);
});

test('the file wins over shell variables, and NODE_ENV is irrelevant', () => {
  // Next's loader let an exported value override the file, and skipped this
  // file entirely under NODE_ENV=test. Reading the file directly does neither.
  const dir = dirWith({ '.env.development.local': LOCAL + KEYS });
  const saved = { ...process.env };
  try {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://elsewhere.supabase.co';
    process.env.SUPABASE_SECRET_KEY = 'shell-secret';
    (process.env as Record<string, string>).NODE_ENV = 'test';
    const env = loadLocalSupabaseEnv(dir);
    assert.equal(env.url, 'http://127.0.0.1:55321');
    assert.equal(env.secretKey, 'sec');
  } finally {
    process.env = saved;
  }
});

test('only loopback counts as local', () => {
  for (const host of ['localhost', '127.0.0.1', '[::1]']) {
    const dir = dirWith({ '.env.development.local': `NEXT_PUBLIC_SUPABASE_URL=http://${host}:55321\n${KEYS}` });
    assert.equal(loadLocalSupabaseEnv(dir).url, `http://${host}:55321`, host);
  }
  for (const host of ['127.0.0.1.nip.io', '127.0.0.1@evil.example', 'localhost.evil.example']) {
    const dir = dirWith({ '.env.development.local': `NEXT_PUBLIC_SUPABASE_URL=http://${host}\n${KEYS}` });
    assert.throws(() => loadLocalSupabaseEnv(dir), /Refusing to run against/, host);
  }
});
