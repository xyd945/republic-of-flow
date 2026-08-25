'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useHiddenWorldsQuery,
  useInterestsQuery,
  useListingsQuery,
  useMatchesQuery,
  useProfilesQuery,
  useViewerUserIdQuery,
} from './tables';
import type { ListingRow } from './tables';
import type {
  HiddenWorld,
  InterestStatus,
  ListingInterest,
  ListingWithCreator,
  MarketListing,
  MatchWithParties,
  ProfileWithHiddenWorlds,
  Translatable,
} from '@/types';

/**
 * The shapes screens actually render, composed from the per-table queries.
 *
 * The joins are cross-domain — a listing needs profiles for its creator, a
 * match needs profiles AND listings — so a screen cannot always fetch exactly
 * one table. What it CAN do is avoid fetching tables it never shows: the
 * People screen no longer pays for matches, and the Profile screen no longer
 * pays for the whole market. react-query dedupes and caches per table, so two
 * screens asking for profiles share one request.
 *
 * Every hook returns an `error`. That is the whole point of this refactor: the
 * old provider read each result as `?? []`, so an outage rendered as an empty
 * Republic. A screen that cannot tell "nothing here" from "we failed to ask"
 * will lie to the member.
 */

/**
 * First error among the queries a view depends on, or ''.
 *
 * Deliberately only reports a query that has NOTHING to show. react-query keeps
 * the last good data when a refetch fails, and blowing a working screen away
 * because a background refresh timed out would be its own kind of lying — the
 * data on screen is real, just a minute old. Only a query that has never
 * succeeded leaves the screen with nothing to render, and that is the case this
 * refactor exists to stop rendering as "the Republic is empty".
 */
/**
 * A backstop for "loading forever".
 *
 * Twice while building this I watched a query sit unsettled indefinitely: once
 * against a host that would not resolve, and once with react-query parking a
 * rejecting query at fetchStatus 'paused' because it had decided the device was
 * offline — with navigator.onLine reporting true, networkMode 'always' set, and
 * onlineManager forced online. Either way the screen span forever and the error
 * UI never ran.
 *
 * Rather than keep chasing causes, the screens stop depending on the library
 * settling. From a member's side, fifteen seconds of spinner IS a failure worth
 * being told about, whatever produced it. This is deliberately longer than the
 * ten-second per-request timeout, so a request that fails normally reports its
 * own real message and only a genuinely stuck query falls through to here.
 */
const STUCK_MS = 15_000;
const STUCK_MESSAGE = 'The Republic is not answering. Check your connection and try again.';

function useStuck(loading: boolean): boolean {
  const [stuck, setStuck] = useState(false);
  const since = useRef<number | null>(null);
  useEffect(() => {
    if (!loading) { since.current = null; setStuck(false); return; }
    if (since.current === null) since.current = Date.now();
    const id = setTimeout(() => setStuck(true), STUCK_MS);
    return () => clearTimeout(id);
  }, [loading]);
  return stuck;
}

function firstError(...qs: { error: unknown; data: unknown }[]): string {
  for (const q of qs) {
    if (q.error && q.data === undefined) {
      return q.error instanceof Error ? q.error.message : String(q.error);
    }
  }
  return '';
}

export function usePeople() {
  const profiles = useProfilesQuery();
  const worlds = useHiddenWorldsQuery();
  const viewer = useViewerUserIdQuery();

  const byProfile = useMemo(() => {
    const m = new Map<string, HiddenWorld[]>();
    for (const w of worlds.data ?? []) {
      const list = m.get(w.profile_id) ?? [];
      list.push(w);
      m.set(w.profile_id, list);
    }
    return m;
  }, [worlds.data]);

  const people = useMemo<ProfileWithHiddenWorlds[]>(
    () =>
      (profiles.data ?? []).map((p) => ({
        ...p,
        hidden_worlds: byProfile.get(p.id) ?? [],
        ask_topics: (p.ask_topics ?? []) as Translatable[],
        want_topics: (p.want_topics ?? []) as Translatable[],
        languages: p.languages ?? [],
      })),
    [profiles.data, byProfile]
  );

  const viewerProfileId = useMemo(
    () => (viewer.data ? people.find((p) => p.user_id === viewer.data)?.id ?? null : null),
    [people, viewer.data]
  );

  const loading = profiles.isPending || worlds.isPending || viewer.isPending;
  const stuck = useStuck(loading);

  return {
    people,
    viewerProfileId,
    loading: loading && !stuck,
    error: firstError(profiles, worlds, viewer) || (stuck ? STUCK_MESSAGE : ''),
  };
}

export function useViewerProfile() {
  const { people, viewerProfileId, loading, error } = usePeople();
  const profile = useMemo(
    () => people.find((p) => p.id === viewerProfileId) ?? null,
    [people, viewerProfileId]
  );
  return { profile, viewerProfileId, loading, error };
}

export function useListings() {
  const { people, viewerProfileId, loading: peopleLoading, error: peopleError } = usePeople();
  const listings = useListingsQuery();
  const interests = useInterestsQuery();

  const rows = useMemo<ListingWithCreator[]>(() => {
    const byId = new Map(people.map((p) => [p.id, p]));

    const byListing = new Map<string, ListingInterest[]>();
    const mine = new Map<string, InterestStatus>();
    for (const raw of interests.data ?? []) {
      const i = raw as unknown as ListingInterest;
      const list = byListing.get(i.listing_id) ?? [];
      list.push({ ...i, profile: byId.get(i.profile_id) });
      byListing.set(i.listing_id, list);
      if (viewerProfileId && i.profile_id === viewerProfileId) mine.set(i.listing_id, i.status);
    }

    return ((listings.data ?? []) as ListingRow[]).map((l) => ({
      ...l,
      creator: byId.get(l.creator_profile_id),
      interests: byListing.get(l.id) ?? [],
      viewer_interest_status: mine.get(l.id) ?? null,
      suggested_profile: l.suggested_profile_id ? byId.get(l.suggested_profile_id) : undefined,
    })) as ListingWithCreator[];
  }, [listings.data, interests.data, people, viewerProfileId]);

  return {
    listings: rows,
    viewerProfileId,
    loading: peopleLoading || listings.isPending || interests.isPending,
    error: peopleError || firstError(listings, interests),
  };
}

export function useMatches() {
  const { people, viewerProfileId, loading: peopleLoading, error: peopleError } = usePeople();
  const listings = useListingsQuery();
  const matches = useMatchesQuery();

  const rows = useMemo<MatchWithParties[]>(() => {
    const byId = new Map(people.map((p) => [p.id, p]));
    const listingById = new Map<string, MarketListing>((listings.data ?? []).map((l) => [l.id, l as MarketListing]));
    return (matches.data ?? []).map((m) => ({
      ...m,
      initiator: byId.get(m.initiator_profile_id),
      matched: byId.get(m.matched_profile_id),
      listing: m.listing_id ? listingById.get(m.listing_id) : undefined,
    }));
  }, [matches.data, listings.data, people]);

  return {
    matches: rows,
    viewerProfileId,
    loading: peopleLoading || listings.isPending || matches.isPending,
    error: peopleError || firstError(listings, matches),
  };
}

/** The Curator Desk needs everything at once, so it gets its own composite. */
export function useCuratorView() {
  const people = usePeople();
  const listings = useListings();
  const matches = useMatches();
  return {
    people: people.people,
    listings: listings.listings,
    matches: matches.matches,
    viewerProfileId: people.viewerProfileId,
    loading: people.loading || listings.loading || matches.loading,
    error: people.error || listings.error || matches.error,
  };
}
