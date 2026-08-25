'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { keys } from './client';
import { bounded } from './tables';
import type { CategoryId, Translatable } from '@/types';

/**
 * Every write in the app, in one file.
 *
 * Two rules hold here and are worth stating, because both were learned the
 * hard way:
 *
 *  1. A screen never names a table or a function. That is what makes the
 *     coming redesign a view-layer change instead of a rewrite.
 *
 *  2. Each mutation declares the TABLES it touched, and only those are
 *     invalidated. Previously any write anywhere called refetch() and re-read
 *     all five tables. Accepting a request should not re-read every profile in
 *     the cohort.
 *
 * Note how few direct table writes remain: two inserts. Everything else goes
 * through a SECURITY DEFINER function, because it either spans tables or
 * describes a relationship between two members — see 00006 through 00009.
 */

type Invalidate = readonly (readonly string[])[];

function useRpc<TArgs extends Record<string, unknown>>(fn: string, invalidates: Invalidate) {
  const qc = useQueryClient();
  return useMutation({
    // Same reasoning as the queries: fail loudly rather than pause forever.
    networkMode: 'always',
    // Bounded for the same reason as the reads: a stalled request never
    // rejects, so retry: 0 cannot help and the button stays busy forever.
    mutationFn: (args: TArgs) => bounded(async (signal) => {
      const { data, error } = await createClient().rpc(fn, args).abortSignal(signal);
      if (error) throw error;
      return data;
    }),
    // Returned, not fired and forgotten: react-query then waits for the
    // refetches before the mutation resolves, so a caller that clears its busy
    // state on resolve is not clearing it over stale data.
    onSuccess: () => Promise.all(invalidates.map((key) => qc.invalidateQueries({ queryKey: key }))),
  });
}

// ---------------------------------------------------------------- market

/** Raising a hand. Creates the interest AND notifies the owner, atomically. */
export const useRaiseInterest = () =>
  useRpc<{ p_listing_id: string; p_message: Translatable | null }>(
    'raise_interest',
    [keys.interests, keys.listings, keys.notifications]
  );

/** Accept: moves the interest, closes the listing, creates the match. */
export const useAcceptInterest = () =>
  useRpc<{ p_interest_id: string }>(
    'accept_interest',
    [keys.interests, keys.listings, keys.matches, keys.notifications]
  );

export const useDeclineInterest = () =>
  useRpc<{ p_interest_id: string }>(
    'decline_interest',
    [keys.interests, keys.notifications]
  );

/** Participant-only. Closing a match is curator-only — that is dismatch(). */
export const useMarkMatchMet = () =>
  useRpc<{ p_match_id: string }>(
    'mark_match_met',
    [keys.matches, keys.notifications]
  );

// ---------------------------------------------------------------- curator

/** Undo a pairing: reopens the listing and restores the pending request too. */
export const useDismatch = () =>
  useRpc<{ p_match_id: string }>(
    'dismatch',
    [keys.matches, keys.listings, keys.interests, keys.notifications]
  );

export const useCuratorSuggest = () =>
  useRpc<{ p_listing_id: string; p_profile_id: string | null; p_reason: Translatable | null }>(
    'curator_suggest',
    [keys.listings, keys.notifications]
  );

/** is_featured / is_active / class_name. There is deliberately no path to is_curator. */
export const useCuratorUpdateMember = () =>
  useRpc<{
    p_profile_id: string;
    p_is_featured: boolean | null;
    p_is_active: boolean | null;
    p_class_name: string | null;
  }>('curator_update_member', [keys.profiles]);

// ---------------------------------------------------------------- profile

export const useSaveProfile = () =>
  useRpc<Record<string, unknown>>('save_profile', [keys.profiles, keys.hiddenWorlds]);

// ---------------------------------------------------------------- inbox

export const useMarkNotificationsRead = () =>
  useRpc<{ p_ids: string[] | null }>('mark_notifications_read', [keys.notifications]);

// ---------------------------------------------------------------- inserts
//
// The only two direct table writes left in the app. Both create a row the
// caller owns, guarded by an insert policy, and neither spans tables.

export function usePublishListing() {
  const qc = useQueryClient();
  return useMutation({
    networkMode: 'always',
    mutationFn: (row: {
      creator_profile_id: string;
      type: 'wanted' | 'offer';
      title: Translatable;
      description: Translatable;
      status: 'open';
    }) => bounded(async (signal) => {
      const { error } = await createClient().from('market_listings').insert(row).abortSignal(signal);
      if (error) throw error;
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.listings }),
  });
}

export type { CategoryId };
