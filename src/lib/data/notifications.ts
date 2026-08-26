'use client';

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { keys } from './client';
import { bounded } from './tables';
import { useMarkNotificationsRead } from './mutations';
import type { AppNotification } from '@/types';

const PAGE = 50;

/**
 * The inbox.
 *
 * This used to hand-roll what react-query does: an `alive` ref so a cancelled
 * effect could not write state, and a `seq` ticket so an older in-flight load
 * could not resurrect notifications that had just been marked read. Codex
 * found bugs in the first version of both. They are gone — the library orders
 * and cancels requests, and this file is now about what the inbox MEANS.
 */
export function useNotifications() {
  const qc = useQueryClient();
  const markReadRpc = useMarkNotificationsRead();

  const query = useQuery({
    queryKey: keys.notifications,
    // Bounded like every other read: retry: 0 only helps once a promise
    // rejects, and a stalled connection never rejects at all. Without this the
    // panel spins forever behind a captive portal.
    queryFn: () => bounded(async (signal) => {
      const { data, error } = await createClient()
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(PAGE)
        .abortSignal(signal);
      // RAW, not humanised. Humanising here rewrote "JWT issued at future"
      // into friendly prose before bounded() could recognise it, so the
      // notification panel was the one caller that never got the retry — and
      // every test still passed.
      if (error) throw new Error(error.message);
      return (data ?? []) as AppNotification[];
    }),
  });

  const items = query.data ?? [];
  const unreadCount = items.reduce((n, item) => (item.read_at ? n : n + 1), 0);

  /**
   * No argument means "everything of mine". Marking only the ids on screen
   * would strand anything past the newest PAGE — with 51 unread, the oldest
   * could never be displayed, counted down, or marked, and the badge would sit
   * at 1 for good. The cost is that a notification arriving in the instant
   * between the refresh and this call is marked read without being bolded; it
   * is still in the list, which is much the lesser of the two.
   *
   * Marking read is an RPC, not an update: `grant update (read_at)` would be
   * role-wide and would let any member mark another member's inbox read. See
   * 00008.
   */
  const markRead = useCallback(
    async (ids?: string[]) => {
      const stamp = new Date().toISOString();
      // Optimistic, so the badge clears the moment the panel opens.
      qc.setQueryData<AppNotification[]>(keys.notifications, (prev) =>
        (prev ?? []).map((n) => ((!ids || ids.includes(n.id)) ? { ...n, read_at: n.read_at ?? stamp } : n))
      );
      try {
        await markReadRpc.mutateAsync({ p_ids: ids ?? null });
      } catch {
        // The mutation invalidates on success; on failure put the true state
        // back rather than leaving an optimistic lie on screen.
        qc.invalidateQueries({ queryKey: keys.notifications });
      }
    },
    [qc, markReadRpc]
  );

  return {
    items,
    unreadCount,
    loading: query.isPending,
    // Same rule as the views: only report a failure that leaves nothing to
    // show. A refetch that fails while we hold a good list should not blank
    // the panel.
    error: query.error && query.data === undefined ? (query.error as Error).message : '',
    /** Resolves true only if the refresh actually succeeded. */
    refetch: useCallback(async () => {
      const res = await query.refetch();
      return !res.error;
    }, [query]),
    markRead,
  };
}
