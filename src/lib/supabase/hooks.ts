'use client';

import { useCallback, useMemo } from 'react';
import { createClient } from './client';

export function useSignOut() {
  const supabase = useMemo(() => createClient(), []);
  return useCallback(async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  }, [supabase]);
}
