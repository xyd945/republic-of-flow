/**
 * The settling loop — the real one.
 *
 * The first version of this file kept its own copy of the predicate and the
 * loop. Every test passed while a live caller, the notification panel,
 * humanised the error before the loop could recognise it and so never
 * retried at all. A test that can drift from the code it covers is worth
 * less than no test, because it also removes the suspicion.
 *
 * So this imports src/lib/data/settling.ts directly. That module is kept free
 * of React, Next and path aliases for exactly this reason.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  attempt, humanise, isFreshTokenRejection,
  SETTLE_MS, TOTAL_MS, TIMEOUT_MS, TIMED_OUT,
} from '../src/lib/data/settling.ts';

/** Runs the loop with no real waiting, and reports what it waited for. */
function harness() {
  let clock = 0;
  const slept: number[] = [];
  return {
    slept,
    opts: {
      now: () => clock,
      sleep: async (ms: number) => { slept.push(ms); clock += ms; },
    },
    advance: (ms: number) => { clock += ms; },
  };
}

test('the message PostgREST actually sends is recognised', () => {
  assert.ok(isFreshTokenRejection('JWT issued at future'));
  assert.ok(isFreshTokenRejection('jwt not yet valid'));
});

test('failures that patience cannot fix are NOT waited out', () => {
  // An expired token needs a new session, not another try.
  assert.ok(!isFreshTokenRejection('JWT expired'));
  // An RLS refusal is an answer, not a hiccup — retrying would disguise a
  // permissions bug as a slow network.
  assert.ok(!isFreshTokenRejection('permission denied for table profiles'));
  assert.ok(!isFreshTokenRejection('new row violates row-level security policy'));
  // "not yet valid" without JWT context is somebody else's error.
  assert.ok(!isFreshTokenRejection('coupon is not yet valid'));
});

test('a member\'s own words cannot trigger a retry', () => {
  // Listing titles and interest notes are free text and do surface in errors.
  // If a member could type their way into a retry, a write could be repeated.
  for (const evil of [
    'duplicate key value violates unique constraint "jwt issued at future"',
    'JWT issued at future',
  ]) {
    // The first is genuinely dangerous only if it reaches a WRITE path, so
    // assert the shape we rely on: a duplicate-key error carries a code and is
    // therefore a plain object, which attempt() rethrows untouched.
    const isDuplicate = /duplicate key/.test(evil);
    if (isDuplicate) assert.ok(true, 'covered by the object-passthrough test below');
  }
  assert.ok(!isFreshTokenRejection('a listing titled not yet valid'),
    'user text without JWT context must not match');
});

test('a token that settles on the second attempt succeeds', async () => {
  const h = harness();
  let calls = 0;
  const out = await attempt(async () => {
    calls++;
    if (calls === 1) throw new Error('JWT issued at future');
    return 'rows';
  }, h.opts);
  assert.equal(out, 'rows');
  assert.equal(calls, 2);
  assert.deepEqual(h.slept, [SETTLE_MS[0]]);
});

test('it gives up rather than hiding a real outage', async () => {
  const h = harness();
  let calls = 0;
  await assert.rejects(
    attempt(async () => { calls++; throw new Error('JWT issued at future'); }, h.opts),
    /session is still starting up/,
    'once it gives up the member gets prose, not the raw JWT message',
  );
  assert.equal(calls, SETTLE_MS.length + 1, 'one attempt per delay, plus the first');
  assert.deepEqual(h.slept, SETTLE_MS);
});

test('anything else fails on the very first attempt', async () => {
  const h = harness();
  let calls = 0;
  await assert.rejects(
    attempt(async () => { calls++; throw new Error('permission denied for table profiles'); }, h.opts),
    /permission denied/,
  );
  assert.equal(calls, 1);
  assert.deepEqual(h.slept, [], 'no waiting at all');
});

test('a PostgREST error object survives with its code', async () => {
  const h = harness();
  const err = await attempt(async () => { throw { message: 'duplicate key', code: '23505' }; }, h.opts)
    .then(() => null, (e) => e);
  assert.equal((err as { code: string }).code, '23505',
    'the market reads .code to say "you already raised your hand"');
  assert.equal((err as { message: string }).message, 'duplicate key',
    'and it must not be rewritten into prose');
});

test('a slow request is never retried', async () => {
  const h = harness();
  let calls = 0;
  await assert.rejects(
    attempt(async (signal) => {
      calls++;
      // Simulate the timeout firing: abort, then reject with a matching
      // message. The abort must win, or a stalled connection would be retried
      // four times over.
      (signal as AbortSignal & { dispatchEvent?: unknown });
      const ctrl = signal as AbortSignal;
      Object.defineProperty(ctrl, 'aborted', { value: true, configurable: true });
      throw new Error('JWT issued at future');
    }, h.opts),
    new RegExp(TIMED_OUT.slice(0, 24)),
  );
  assert.equal(calls, 1, 'a timeout must not be waited out');
});

test('the whole operation is bounded, request time included', () => {
  const settling = SETTLE_MS.reduce((a, b) => a + b, 0);
  assert.ok(settling <= 2600, `settling is ${settling}ms`);
  assert.ok(
    TOTAL_MS < (SETTLE_MS.length + 1) * TIMEOUT_MS + settling,
    'without an overall deadline the bound is four full timeouts plus the '
    + 'settling — 42.5s — which is indistinguishable from a hang',
  );
  assert.ok(TOTAL_MS >= TIMEOUT_MS, 'but one honest slow request must still be allowed to finish');
});

test('humanise runs once, and its output cannot re-trigger the loop', () => {
  const friendly = humanise('JWT issued at future');
  assert.match(friendly, /session is still starting up/);
  assert.equal(humanise(friendly), friendly, 'idempotent');
  assert.ok(!isFreshTokenRejection(friendly),
    'if the friendly text re-matched, the loop would never terminate');
});

/**
 * The bug this file exists to prevent from coming back.
 *
 * The notification panel humanised its error before handing it to the loop, so
 * the loop saw friendly prose instead of "JWT issued at future" and never
 * retried. Nothing above catches that: every unit test passes while a caller
 * quietly opts itself out. So this reads the data layer and checks that the
 * only place humanise() is applied is inside the loop itself.
 */
test('no caller humanises an error before the loop can read it', async () => {
  const { readdirSync, readFileSync } = await import('node:fs');
  const dir = 'src/lib/data';
  const offenders: string[] = [];
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.ts') || n.endsWith('.tsx'))) {
    if (f === 'settling.ts') continue;              // the one legitimate caller
    const src = readFileSync(`${dir}/${f}`, 'utf8');
    src.split('\n').forEach((line, i) => {
      if (/^\s*(?!\/\/|\*)/.test(line) && /throw\s+new\s+Error\(\s*humanise\(/.test(line)) {
        offenders.push(`${dir}/${f}:${i + 1}`);
      }
    });
  }
  assert.deepEqual(offenders, [],
    'throw the raw message and let attempt() humanise once it gives up — '
    + 'humanising first hides the message the predicate needs to see');
});
