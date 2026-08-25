'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { AppNotification } from '@/types';

const PAGE = 50;

/**
 * Notifications live outside DirectoryProvider on purpose.
 *
 * The directory loads five tables that every screen shares, and refetches only
 * when something is written. An inbox is the opposite: it belongs to one
 * viewer, changes because of what OTHER people do, and wants refreshing at
 * moments the directory has no opinion about — opening the panel, returning to
 * the tab. Folding it in would mean re-reading the whole cohort to discover
 * that one row arrived.
 *
 * Errors are surfaced, not swallowed. The directory reads every result as
 * `?? []`, so a failed query there renders as an empty Republic; the same
 * mistake here would quietly show an empty inbox and hide real messages.
 * See issue #21.
 */
export function useNotifications() {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // A cancelled effect that still writes state is what produced the
  // "Profile not found" flash on the profile screen. Never write after unmount.
  const alive = useRef(true);
  // Requests can overtake each other: a refresh started before the panel was
  // opened could return AFTER the optimistic mark-read and undo it, leaving a
  // badge that says unread for mail already read. Only the newest request may
  // write.
  const seq = useRef(0);

  /** Resolves true only if this load actually refreshed the list. */
  const load = useCallback(async (): Promise<boolean> => {
    const ticket = ++seq.current;
    const { data, error: err } = await createClient()
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(PAGE);

    if (!alive.current || ticket !== seq.current) return false;
    if (err) { setError(err.message); setLoading(false); return false; }
    setError('');
    setItems((data ?? []) as AppNotification[]);
    setLoading(false);
    return true;
  }, []);

  useEffect(() => {
    alive.current = true;
    load();

    // Coming back to the tab is the cheapest honest moment to re-check.
    // Deliberately no realtime subscription: for a hundred classmates it is a
    // socket to reason about for very little gain. Revisit if the lag annoys.
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive.current = false;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  /**
   * Marking read is a function call, not an update: `grant update (read_at)`
   * would be role-wide and would let any member mark another member's inbox
   * read — see 00008.
   *
   * No argument means "everything of mine". Marking only the ids on screen
   * would strand anything past the newest PAGE — with 51 unread the oldest
   * could never be displayed, counted down, or marked, and the badge would sit
   * at 1 for good. The cost is that a notification arriving in the moment
   * between the refresh and this call is marked read without being bolded; it
   * is still in the list, which is much the lesser of the two.
   *
   * Only call this after a refresh that actually succeeded — see
   * openNotifications. Marking an inbox read that the panel failed to load
   * would hide mail nobody ever saw.
   */
  const markRead = useCallback(async (ids?: string[]) => {
    if (!alive.current) return;

    const stamp = new Date().toISOString();
    setItems((prev) => prev.map((n) => (
      (!ids || ids.includes(n.id)) ? { ...n, read_at: n.read_at ?? stamp } : n
    )));
    // Bump the ticket so an older in-flight load cannot restore what we just
    // marked read.
    seq.current++;

    const { error: err } = await createClient().rpc('mark_notifications_read', {
      p_ids: ids ?? null,
    });
    if (!alive.current) return;
    if (err) setError(err.message);
    // Reconcile either way. On failure this restores the true unread state; on
    // success it picks up anything that landed while the RPC was in flight,
    // which the optimistic update above could not know about.
    load();
  }, [load]);

  const unreadCount = items.reduce((n, item) => (item.read_at ? n : n + 1), 0);

  return { items, unreadCount, loading, error, refetch: load, markRead };
}
