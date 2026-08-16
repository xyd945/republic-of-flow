'use client';

import { useCallback, useMemo } from 'react';
import { createClient } from './client';
import { useDirectory } from './directory';

/**
 * The viewer's own profile, taken from the already-loaded directory.
 * Fetching it separately would cost extra ~300ms round trips for data the
 * directory has already pulled down.
 */
export function useProfile() {
  const { profiles, viewerProfileId, loading, refetch } = useDirectory();
  const profile = useMemo(
    () => profiles.find((p) => p.id === viewerProfileId) ?? null,
    [profiles, viewerProfileId]
  );
  return { profile, loading, refetch };
}

export function useSignOut() {
  const supabase = useMemo(() => createClient(), []);
  return useCallback(async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  }, [supabase]);
}
