'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { keys } from './client';
import type { HiddenWorld, Match, Profile, Translatable } from '@/types';

/**
 * The rows as the database returns them, which is not quite the app types:
 * `Profile` omits the jsonb array columns and `MarketListing` omits the
 * curator-suggestion columns, because both are only ever read through the
 * derived views in ./views. Modelling them here keeps the casts in one place
 * instead of scattered through the join code.
 */
type ProfileRow = Profile & {
  ask_topics: Translatable[] | null;
  want_topics: Translatable[] | null;
  languages: string[] | null;
};

type ListingRow = import('@/types').MarketListing & {
  suggested_profile_id: string | null;
  suggested_reason: Translatable | null;
};

export type { ProfileRow, ListingRow };

/**
 * One query per table. Nothing here joins anything — the shapes screens
 * actually want are composed in ./views, so a mutation can invalidate the
 * TABLE it wrote without having to know which derived view depends on it.
 *
 * THE POINT OF THIS FILE
 *
 * The previous DirectoryProvider read every result as `res.data ?? []` and
 * never checked `.error` once. So a dropped network, a paused project, or an
 * RLS refusal all rendered as a calm, confident empty state: "no people yet",
 * "nothing in the market". The Republic looked empty rather than broken.
 *
 * `select()` below throws on error, which is what lets react-query surface it.
 * Never swallow it back into an empty array.
 */
/**
 * Ten seconds, then give up.
 *
 * Without this a request that never answers — a dead host, a captive portal, a
 * phone that lost signal mid-flight — leaves the query permanently pending, so
 * the screen spins forever and the error path never runs. An eternal spinner
 * is a quieter version of the same lie this refactor is about: the member is
 * told nothing rather than told what happened. Verified by pointing the app at
 * an unreachable host: before this, /people span indefinitely.
 */
export const TIMEOUT_MS = 10_000;

/**
 * supabase-js catches a network failure and hands it back as
 * `{ error: { message: 'TypeError: Failed to fetch' } }` rather than throwing,
 * so it never reaches a `catch (e instanceof TypeError)`. True, and useless to
 * a classmate on a train — the error screen shows this text verbatim.
 */
export function humanise(message: string): string {
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return 'Could not reach the Republic. Check your connection.';
  }
  if (isFreshTokenRejection(message)) {
    return 'Your session is still starting up. Give it a moment and try again.';
  }
  return message;
}

/**
 * A token that the API thinks was issued in the future.
 *
 * Supabase mints the token on its auth service and validates it at the API
 * gateway, and those two clocks are not the same clock. A token is stamped
 * `iat` to the second, so for the first second or two of its life a small
 * negative skew at the gateway makes it look like it comes from the future,
 * and every request is refused. Seconds later the same token is fine.
 *
 * In practice this only ever bit the first page load after signing in, when
 * the token is milliseconds old — the member saw "could not load this" and a
 * manual refresh fixed it, which is the tell.
 */
function isFreshTokenRejection(message: string): boolean {
  return /issued at future|not yet valid|jwt.*\bnbf\b/i.test(message);
}

/** Waits between attempts. Bounded on purpose: a real outage must still fail. */
const SETTLE_MS = [300, 700, 1500];

/**
 * Run a request, and wait out a token that is briefly from the future.
 *
 * The retry lives here rather than in react-query's `retry` option, and that
 * is deliberate: `retry: 0` on the QueryClient is load-bearing. React-query
 * PAUSES its own retries when it believes the device is offline, and a paused
 * retry never settles, which is what made two screens spin forever. This loop
 * is ours — nothing can pause it, every attempt carries its own timeout, and
 * the total wait is bounded at 2.5s before the error surfaces as normal.
 *
 * Safe for writes as well as reads: the gateway rejects the token before the
 * request reaches Postgres, so a refused attempt did nothing to retry over.
 */
async function attempt<T>(run: (signal: AbortSignal) => PromiseLike<T>): Promise<T> {
  for (let i = 0; ; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      return await run(ctrl.signal);
    } catch (e) {
      if (ctrl.signal.aborted) {
        throw new Error('The Republic took too long to answer. Check your connection.');
      }
      const message = e instanceof Error ? e.message : String((e as { message?: unknown })?.message ?? e);
      if (isFreshTokenRejection(message) && i < SETTLE_MS.length) {
        await new Promise((r) => setTimeout(r, SETTLE_MS[i]));
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

export function bounded<T>(work: (signal: AbortSignal) => PromiseLike<T>): Promise<T> {
  return attempt(work);
}

async function select<T>(
  build: (
    c: ReturnType<typeof createClient>,
    signal: AbortSignal,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  return attempt(async (signal) => {
    const { data, error } = await build(createClient(), signal);
    // Thrown raw; attempt() decides whether this is worth waiting out and
    // humanises it only once it has given up.
    if (error) throw new Error(error.message);
    return data ?? [];
  });
}

export function useProfilesQuery() {
  return useQuery({
    queryKey: keys.profiles,
    queryFn: () => select<ProfileRow>((c, signal) => c.from('profiles').select('*').order('founder_no').abortSignal(signal)),
  });
}

export function useHiddenWorldsQuery() {
  return useQuery({
    queryKey: keys.hiddenWorlds,
    queryFn: () => select<HiddenWorld>((c, signal) => c.from('profile_hidden_worlds').select('*').order('sort_order').abortSignal(signal)),
  });
}

export function useListingsQuery() {
  return useQuery({
    queryKey: keys.listings,
    queryFn: () => select<ListingRow>((c, signal) => c.from('market_listings').select('*').order('created_at', { ascending: false }).abortSignal(signal)),
  });
}

/**
 * RLS returns every interest on listings you own (and everything, to a
 * curator), but only your own row on anyone else's listing. So this is not
 * "all interests" — it is "the interests I am allowed to see", and the views
 * are written on that basis.
 */
export function useInterestsQuery() {
  return useQuery({
    queryKey: keys.interests,
    queryFn: () => select<{ id: string; listing_id: string; profile_id: string; message: unknown; status: string }>(
      (c, signal) => c.from('market_interests').select('id,listing_id,profile_id,message,status').order('created_at').abortSignal(signal)
    ),
  });
}

export function useMatchesQuery() {
  return useQuery({
    queryKey: keys.matches,
    queryFn: () => select<Match>((c, signal) => c.from('matches').select('*').order('created_at', { ascending: false }).abortSignal(signal)),
  });
}

/**
 * Which profile is mine.
 *
 * Reads the session cookie locally rather than calling getUser(), which would
 * be another ~300ms round trip on every screen. Authorization still comes from
 * RLS server-side; this id only decides which row the UI treats as "mine".
 */
export function useViewerUserIdQuery() {
  return useQuery({
    queryKey: keys.session,
    queryFn: async () => {
      /**
       * Bounded, because getSession() is not a plain read: if the access token
       * needs refreshing it goes to the network, and supabase-js retries that
       * internally with its own backoff. Against an unreachable host it can
       * stay pending far longer than the queries around it — and since every
       * view waits on this to know which profile is "mine", an unsettled
       * session query means a spinner that never resolves on EVERY screen.
       * Observed exactly that against a bad host before this was added.
       */
      const session = await Promise.race([
        createClient().auth.getSession().then((r) => r.data.session),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS)),
      ]);
      return session?.user?.id ?? null;
    },
    staleTime: 5 * 60_000,
  });
}
