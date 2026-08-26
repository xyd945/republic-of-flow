/**
 * The settling loop, exercised directly: it is the only thing standing between
 * a member and "could not load this" on the first screen after they sign in.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Mirror of the implementation in src/lib/data/tables.ts.
const SETTLE_MS = [300, 700, 1500];
const isFreshTokenRejection = (m: string) => /issued at future|not yet valid|jwt.*\bnbf\b/i.test(m);

async function attempt<T>(run: (signal: AbortSignal) => PromiseLike<T>, timeoutMs = 10_000): Promise<T> {
  for (let i = 0; ; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      return await run(ctrl.signal);
    } catch (e) {
      if (ctrl.signal.aborted) throw new Error('timeout');
      const message = e instanceof Error ? e.message : String((e as { message?: unknown })?.message ?? e);
      if (isFreshTokenRejection(message) && i < SETTLE_MS.length) {
        await new Promise((r) => setTimeout(r, SETTLE_MS[i]));
        continue;
      }
      throw e instanceof Error ? new Error(message) : e;
    } finally { clearTimeout(timer); }
  }
}

test('the real PostgREST message is recognised', () => {
  assert.ok(isFreshTokenRejection('JWT issued at future'));
  assert.ok(isFreshTokenRejection('jwt not yet valid'));
  assert.ok(!isFreshTokenRejection('JWT expired'), 'an EXPIRED token must not be waited out — that needs a new session, not patience');
  assert.ok(!isFreshTokenRejection('permission denied for table profiles'), 'an RLS refusal must fail immediately');
});

test('a token that settles on the second try succeeds', async () => {
  let calls = 0;
  const out = await attempt(async () => {
    calls++;
    if (calls === 1) throw new Error('JWT issued at future');
    return 'rows';
  });
  assert.equal(out, 'rows');
  assert.equal(calls, 2);
});

test('it gives up rather than hiding a real outage', async () => {
  let calls = 0;
  await assert.rejects(
    attempt(async () => { calls++; throw new Error('JWT issued at future'); }),
    /issued at future/,
  );
  assert.equal(calls, SETTLE_MS.length + 1, 'one attempt per delay, plus the first');
});

test('anything else fails on the first attempt', async () => {
  let calls = 0;
  await assert.rejects(
    attempt(async () => { calls++; throw new Error('permission denied for table profiles'); }),
    /permission denied/,
  );
  assert.equal(calls, 1, 'an RLS refusal must not be retried — asking again cannot help');
});

test('a PostgREST error object keeps its code', async () => {
  const err = await attempt(async () => { throw { message: 'duplicate key', code: '23505' }; })
    .then(() => null, (e) => e);
  assert.equal((err as { code: string }).code, '23505',
    'the market reads .code to say "you already raised your hand"');
});

test('total settling stays bounded', () => {
  const total = SETTLE_MS.reduce((a, b) => a + b, 0);
  assert.ok(total <= 2600, `waits ${total}ms — long enough for clock skew, short enough not to feel hung`);
});
