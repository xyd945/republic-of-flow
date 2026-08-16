'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { createClient } from './client';
import type {
  ListingWithCreator,
  MarketListing,
  MatchWithParties,
  ProfileWithHiddenWorlds,
} from '@/types';

interface Directory {
  profiles: ProfileWithHiddenWorlds[];
  listings: ListingWithCreator[];
  matches: MatchWithParties[];
  viewerProfileId: string | null;
  loading: boolean;
  refetch: () => void;
}

const DirectoryContext = createContext<Directory | null>(null);

/**
 * Loads the whole directory once and shares it across every screen.
 *
 * Round trips are the cost that matters here: the database itself answers in
 * ~3ms, but each request to Supabase costs ~300ms of network transit. So this
 * makes exactly ONE request for all five tables, reads the user id from the
 * session cookie instead of calling getUser() (which is a further round trip),
 * and holds the result in context so navigating between tabs refetches nothing.
 */
export function DirectoryProvider({ children }: { children: React.ReactNode }) {
  const [profiles, setProfiles] = useState<ProfileWithHiddenWorlds[]>([]);
  const [listings, setListings] = useState<ListingWithCreator[]>([]);
  const [matches, setMatches] = useState<MatchWithParties[]>([]);
  const [viewerProfileId, setViewerProfileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [key, setKey] = useState(0);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // Reads the cookie locally — no network. Authorization still comes from
      // RLS server-side; this id only decides which row is "mine".
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      const userId = session?.user?.id ?? null;

      const [profileRes, worldRes, listingRes, interestRes, matchRes] = await Promise.all([
        supabase.from('profiles').select('*').order('founder_no'),
        supabase.from('profile_hidden_worlds').select('*').order('sort_order'),
        supabase.from('market_listings').select('*').order('created_at', { ascending: false }),
        supabase.from('market_interests').select('listing_id,profile_id,status'),
        supabase.from('matches').select('*').order('created_at', { ascending: false }),
      ]);
      if (cancelled) return;

      const worldsByProfile = new Map<string, ProfileWithHiddenWorlds['hidden_worlds']>();
      for (const w of worldRes.data ?? []) {
        const list = worldsByProfile.get(w.profile_id) ?? [];
        list.push(w);
        worldsByProfile.set(w.profile_id, list);
      }

      const people: ProfileWithHiddenWorlds[] = (profileRes.data ?? []).map((p) => ({
        ...p,
        hidden_worlds: worldsByProfile.get(p.id) ?? [],
        ask_topics: p.ask_topics ?? [],
        want_topics: p.want_topics ?? [],
        languages: p.languages ?? [],
      }));
      const byId = new Map(people.map((p) => [p.id, p]));

      const me = userId ? people.find((p) => p.user_id === userId) ?? null : null;

      const countByListing = new Map<string, number>();
      const mineByListing = new Set<string>();
      for (const i of interestRes.data ?? []) {
        if (i.status === 'withdrawn' || i.status === 'declined') continue;
        countByListing.set(i.listing_id, (countByListing.get(i.listing_id) ?? 0) + 1);
        if (me && i.profile_id === me.id) mineByListing.add(i.listing_id);
      }

      const listingRows: ListingWithCreator[] = (listingRes.data ?? []).map((l) => ({
        ...l,
        creator: byId.get(l.creator_profile_id),
        interests_count: countByListing.get(l.id) ?? 0,
        viewer_interested: mineByListing.has(l.id),
        suggested_profile: l.suggested_profile_id ? byId.get(l.suggested_profile_id) : undefined,
      }));
      const listingById = new Map<string, MarketListing>(listingRows.map((l) => [l.id, l]));

      const matchRows: MatchWithParties[] = (matchRes.data ?? []).map((m) => ({
        ...m,
        initiator: byId.get(m.initiator_profile_id),
        matched: byId.get(m.matched_profile_id),
        listing: m.listing_id ? listingById.get(m.listing_id) : undefined,
      }));

      setProfiles(people);
      setListings(listingRows);
      setMatches(matchRows);
      setViewerProfileId(me?.id ?? null);
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [key, supabase]);

  const refetch = useCallback(() => setKey((k) => k + 1), []);

  const value = useMemo(
    () => ({ profiles, listings, matches, viewerProfileId, loading, refetch }),
    [profiles, listings, matches, viewerProfileId, loading, refetch]
  );

  return <DirectoryContext.Provider value={value}>{children}</DirectoryContext.Provider>;
}

export function useDirectory(): Directory {
  const ctx = useContext(DirectoryContext);
  if (!ctx) throw new Error('useDirectory must be used inside <DirectoryProvider>');
  return ctx;
}
