'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { keys } from './client';
import { attempt, humanise, TIMEOUT_MS } from './settling';

/** The one place a request is actually issued. See ./settling for why. */
const bounded = attempt;
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

/**
 * supabase-js catches a network failure and hands it back as
 * `{ error: { message: 'TypeError: Failed to fetch' } }` rather than throwing,
 * so it never reaches a `catch (e instanceof TypeError)`. True, and useless to
 * a classmate on a train — the error screen shows this text verbatim.
 */
export { humanise, bounded, TIMEOUT_MS };

async function select<T>(
  build: (
    c: ReturnType<typeof createClient>,
    signal: AbortSignal,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  return bounded(async (signal) => {
    const { data, error } = await build(createClient(), signal);
    // Thrown RAW. attempt() decides whether this is worth waiting out, and
    // humanises it only once it has given up — humanising here would hide the
    // message the predicate needs to see.
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
