import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { heldMatchesMissing, mergePayments, type HeldPayment } from '../src/lib/payments.ts';
import type { Match, MatchPayment } from '../src/types/index.ts';

const match = (id: string): Match => ({
  id, listing_id: `l-${id}`, initiator_profile_id: 'a', matched_profile_id: 'b',
  status: 'connected', source: 'self', next_step: null, created_at: '2026-01-01T00:00:00Z', completed_at: null,
});
const payment = (id: string, status: MatchPayment['status'], withMatch = false): HeldPayment => ({
  match_id: id, payer_profile_id: 'b', payee_profile_id: 'a', amount: 10, status,
  held_at: '2026-01-01T00:00:00Z', settled_at: null, settled_by: null,
  ...(withMatch ? { match: { ...match(id), listing: null } } : {}),
});

describe('mergePayments', () => {
  it('keeps every hold and every recent payment, once each', () => {
    const merged = mergePayments([payment('old', 'held', true)], [payment('new', 'paid'), payment('old', 'held')]);
    assert.deepEqual(merged.map((p) => [p.match_id, p.status]).sort(), [['new', 'paid'], ['old', 'held']]);
    assert.ok(merged.find((p) => p.match_id === 'old')?.match, 'the hold lost the match read with it');
  });

  it('when the two reads disagree, the settled one wins', () => {
    const merged = mergePayments([payment('m', 'held', true)], [payment('m', 'paid')]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].status, 'paid');
  });
});

describe('heldMatchesMissing', () => {
  it('brings back a match with FLOW on hold that the newest 1,000 left out', () => {
    // 1,000 newer matches on screen; the old one with money on hold is not.
    const shown = Array.from({ length: 1000 }, (_, i) => match(`new-${i}`));
    const missing = heldMatchesMissing(shown, [payment('old', 'held', true)]);
    assert.deepEqual(missing.map((m) => m.id), ['old']);
  });

  it('never duplicates a match already shown, and ignores settled payments', () => {
    const shown = [match('here')];
    assert.deepEqual(heldMatchesMissing(shown, [payment('here', 'held', true)]), []);
    assert.deepEqual(heldMatchesMissing(shown, [payment('gone', 'paid', true)]), []);
  });
});
