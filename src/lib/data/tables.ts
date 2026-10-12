'use client';

import { useInfiniteQuery, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { keys } from './client';
import { attempt, humanise, TIMEOUT_MS } from './settling';

/** The one place a request is actually issued. See ./settling for why. */
const bounded = attempt;
import { mergePayments, type HeldPayment } from '@/lib/payments';
import type { Account, ArchiveEvent, ArchiveNote, HiddenWorld, LedgerAudit, LedgerLine, Match, MatchPayment, Profile, Translatable } from '@/types';

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
    queryFn: () => select<{ id: string; listing_id: string; profile_id: string; message: unknown; status: string; price: number | null }>(
      (c, signal) => c.from('market_interests').select('id,listing_id,profile_id,message,status,price').order('created_at').abortSignal(signal)
    ),
  });
}

export function useMatchesQuery() {
  return useQuery({
    queryKey: keys.matches,
    queryFn: () => select<Match>((c, signal) => c.from('matches').select('*').order('created_at', { ascending: false }).abortSignal(signal)),
  });
}

/** A wallet link may point beyond the recent matches and listings. RLS still applies. */
export function useMatchQuery(id: string | null) {
  type Detail = Match & { listing: import('@/types').MarketListing | null; payment: MatchPayment | null };
  return useQuery({
    queryKey: [...keys.matches, 'detail', id],
    enabled: !!id,
    queryFn: () => select<Detail>((c, signal) => c.from('matches')
      .select('*, listing:market_listings(*), payment:match_payments(*)')
      .eq('id', id!)
      .abortSignal(signal) as unknown as PromiseLike<{ data: Detail[] | null; error: { message: string } | null }>),
  });
}

/** Include settlement learned from an old match's detail page, without refetching it. */
export function useKnownMatchStates() {
  const client = useQueryClient();
  const reads = useQueries({
    queries: client.getQueryCache().findAll({ queryKey: keys.matches })
      .map(({ queryKey }) => ({ queryKey, enabled: false })),
  });
  const states = new Map<string, Match['status']>();
  for (const read of reads) {
    for (const match of (read.data as Match[] | undefined) ?? []) {
      if (match.status === 'closed' || (match.status === 'completed' && states.get(match.id) !== 'closed')) {
        states.set(match.id, match.status);
      }
    }
  }
  return states;
}

export function useArchiveNotesQuery() {
  return useQuery({
    queryKey: keys.archiveNotes,
    queryFn: () => select<ArchiveNote>((c, signal) => c.from('archive_notes').select('*').order('happened_on', { ascending: false }).abortSignal(signal)),
  });
}

/** Meetings and the Market's first listing, with nobody named — see 00015. */
export function useArchiveEventsQuery() {
  return useQuery({
    queryKey: keys.archiveEvents,
    queryFn: () => select<ArchiveEvent>((c, signal) => c.rpc('archive_events').abortSignal(signal)),
  });
}

// ---------------------------------------------------------------- FLOW (00016)

/**
 * Wallets. RLS returns your own to a member, and every account (the
 * Treasury and On hold included) to a curator, so callers pick by profile.
 */
export function useAccountsQuery() {
  return useQuery({
    queryKey: keys.accounts,
    queryFn: () => select<Account>((c, signal) => c.from('accounts').select('id,kind,profile_id,balance').abortSignal(signal)),
  });
}

/** One wallet's lines, newest first, each with the event it belongs to. */
export function useLedgerLinesQuery(accountId: string | null) {
  const pageSize = 20;
  return useInfiniteQuery({
    queryKey: [...keys.ledger, 'pages', accountId],
    enabled: !!accountId,
    initialPageParam: null as number | null,
    getNextPageParam: (lastPage: LedgerLine[]) => lastPage.length === pageSize ? lastPage[lastPage.length - 1].id : undefined,
    // Each line belongs to exactly one transaction, so PostgREST embeds it as
    // an object; untyped, supabase-js cannot know that and calls it an array.
    queryFn: ({ pageParam }) => select<LedgerLine>((c, signal) => {
      let query = c.from('ledger_entries')
        .select('id,amount,created_at,transaction:ledger_transactions(kind,memo,match_id)')
        .eq('account_id', accountId!)
        .order('id', { ascending: false })
        .limit(pageSize);
      // An ID cursor keeps newly arriving entries from shifting older pages.
      if (pageParam !== null) query = query.lt('id', pageParam);
      return query.abortSignal(signal) as unknown as PromiseLike<{ data: LedgerLine[] | null; error: { message: string } | null }>;
    }),
  });
}

/**
 * Paid matches: yours, or all of them for a curator.
 *
 * Two reads, merged. Every payment still on hold, however old — those are
 * the ones money depends on — and the newest of the rest, so past the API's
 * row cap it is only old, settled history that drops off.
 */
export function useMatchPaymentsQuery() {
  return useQuery({
    queryKey: keys.matchPayments,
    queryFn: async () => {
      const [held, recent] = await Promise.all([
        // With its match and listing, which the newest-first reads of those
        // tables may not reach — see lib/payments.
        select<HeldPayment>((c, signal) => c.from('match_payments')
          .select('*, match:matches(*, listing:market_listings(*))')
          .eq('status', 'held')
          .abortSignal(signal) as unknown as PromiseLike<{ data: HeldPayment[] | null; error: { message: string } | null }>),
        select<MatchPayment>((c, signal) => c.from('match_payments').select('*').order('held_at', { ascending: false }).abortSignal(signal)),
      ]);
      return mergePayments(held, recent);
    },
  });
}

/** The Treasury and whether the books balance. Curators only. */
export function useLedgerAuditQuery(enabled: boolean) {
  return useQuery({
    queryKey: keys.audit,
    enabled,
    queryFn: () => bounded(async (signal) => {
      const { data, error } = await createClient().rpc('ledger_audit').abortSignal(signal);
      if (error) throw new Error(error.message);
      return data as LedgerAudit;
    }),
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
