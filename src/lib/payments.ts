import type { MarketListing, Match, MatchPayment } from '@/types';

/**
 * Putting a paid match's money next to its match, whatever their age (#57).
 *
 * The app reads at most 1,000 rows per query, newest first. That is fine for
 * history, but a payment still ON HOLD is not history: someone has to release
 * or refund it, so it and its match must always be on screen. Payments on hold
 * are read on their own, with their match and listing attached, and merged in
 * here. Kept free of React so it can be tested (tests/payments.test.ts).
 */

/** A payment on hold, read together with its match and that match's listing. */
export type HeldPayment = MatchPayment & {
  match?: (Match & { listing?: MarketListing | null }) | null;
};

/**
 * One row per paid match, from the two reads. Settling only goes one way
 * (held → paid or refunded), so when the reads disagree about a payment, the
 * one that saw it settled is the later truth.
 */
export function mergePayments(held: HeldPayment[], recent: MatchPayment[]): HeldPayment[] {
  const byMatch = new Map<string, HeldPayment>(held.map((p) => [p.match_id, p]));
  for (const p of recent) {
    if (!byMatch.has(p.match_id) || p.status !== 'held') byMatch.set(p.match_id, p);
  }
  return [...byMatch.values()];
}

/**
 * Matches with FLOW still on hold that the newest-first read of matches left
 * out, as read alongside their payment. Never one that is already there.
 */
export function heldMatchesMissing(
  matches: Pick<Match, 'id'>[],
  payments: HeldPayment[],
): (Match & { listing?: MarketListing | null })[] {
  const shown = new Set(matches.map((m) => m.id));
  return payments
    .filter((p) => p.status === 'held' && p.match && !shown.has(p.match_id))
    .map((p) => p.match!);
}
