/**
 * Waiting out a token the API thinks comes from the future.
 *
 * Supabase mints the token on its auth service and validates it at the API
 * gateway, and those are not the same clock. `iat` is stamped to the second,
 * so for the first second or two of a token's life a small negative skew at
 * the gateway makes it look like it was issued in the future and every request
 * is refused. Seconds later the same token passes. That is why signing in
 * landed on an error screen that a manual refresh fixed.
 *
 * NO REACT, NO NEXT, NO PATH ALIASES IN THIS FILE. It is deliberately plain so
 * the test can import the real thing. The first version of this fix kept a
 * copy of the loop in the test instead, and every test passed while a live
 * caller — the notification panel — silently bypassed the retry. A test that
 * cannot drift from the code is worth more than a test that reads well.
 */

/** How long each attempt may take before it is abandoned. */
export const TIMEOUT_MS = 10_000;

/** Waits between attempts. Bounded on purpose: a real outage must still fail. */
export const SETTLE_MS = [300, 700, 1500];

/**
 * The ceiling on the whole operation, retries and waiting included.
 *
 * Without it the bound is four full timeouts plus the settling — 42.5s — which
 * happens if each attempt is refused just before its own timeout expires. That
 * is indistinguishable from a hang.
 */
export const TOTAL_MS = 15_000;

/**
 * A token the gateway considers future-issued.
 *
 * Deliberately requires JWT/token context: "not yet valid" on its own is a
 * phrase that could arrive from something unrelated, and matching it would
 * spend three extra requests waiting out an error that is never going to
 * clear.
 */
export function isFreshTokenRejection(message: string): boolean {
  if (!/\b(jwt|token)\b/i.test(message)) return false;
  return /issued at future|not yet valid|\bnbf\b/i.test(message);
}

/** Turns the failures worth explaining into something a member can act on. */
export function humanise(message: string): string {
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return 'Could not reach the Republic. Check your connection.';
  }
  if (isFreshTokenRejection(message)) {
    return 'Your session is still starting up. Give it a moment and try again.';
  }
  return message;
}

export const TIMED_OUT = 'The Republic took too long to answer. Check your connection.';

/**
 * Run a request, waiting out a token that is briefly from the future.
 *
 * The retry lives here rather than in react-query's `retry` option, and that
 * is deliberate: `retry: 0` on the QueryClient is load-bearing. React-query
 * PAUSES its own retries when it believes the device is offline, and a paused
 * retry never settles, which is what made two screens spin forever. This loop
 * is ours — nothing can pause it.
 *
 * Safe for writes as well as reads: the gateway rejects the token before the
 * request reaches Postgres, so a refused attempt did nothing to retry over.
 */
export async function attempt<T>(
  run: (signal: AbortSignal) => PromiseLike<T>,
  opts: { now?: () => number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<T> {
  const now = opts.now ?? (() => Date.now());
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const deadline = now() + TOTAL_MS;

  for (let i = 0; ; i++) {
    // Never let one attempt run past the overall deadline.
    const budget = Math.max(0, Math.min(TIMEOUT_MS, deadline - now()));
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), budget);
    try {
      return await run(ctrl.signal);
    } catch (e) {
      // Checked first: a request that ran out of time is never retried. Only a
      // fast refusal is, and a refusal is what this failure actually looks
      // like.
      if (ctrl.signal.aborted) throw new Error(TIMED_OUT);

      const message = e instanceof Error
        ? e.message
        : String((e as { message?: unknown })?.message ?? e);

      const worthWaiting = isFreshTokenRejection(message) && i < SETTLE_MS.length;
      if (worthWaiting && now() + SETTLE_MS[i] < deadline) {
        await sleep(SETTLE_MS[i]);
        continue;
      }

      // Only Errors are rewritten. PostgREST hands back a plain object
      // carrying `code`, and callers read it — the market maps 23505 to
      // "you already raised your hand" — so that object is passed through
      // untouched.
      throw e instanceof Error ? new Error(humanise(message)) : e;
    } finally {
      clearTimeout(timer);
    }
  }
}
