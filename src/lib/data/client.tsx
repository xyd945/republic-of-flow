'use client';

import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { useState } from 'react';

/**
 * Query keys, in one place so an invalidation cannot quietly miss a consumer
 * by spelling a key differently.
 *
 * They are namespaced by table rather than by screen: a screen composes
 * several of these, and a mutation knows which TABLES it touched, not which
 * screens happen to be mounted.
 */
export const keys = {
  profiles: ['profiles'] as const,
  hiddenWorlds: ['hidden_worlds'] as const,
  listings: ['listings'] as const,
  interests: ['interests'] as const,
  matches: ['matches'] as const,
  notifications: ['notifications'] as const,
  session: ['session'] as const,
};

/**
 * react-query decides "offline" from browser events and refuses to run a query
 * when it thinks we are — it parks it at fetchStatus 'paused', which never
 * settles, so the screen spins forever and the error UI never appears.
 * Measured that directly: a query rejecting immediately still went
 * fetching -> paused, with navigator.onLine reporting true throughout.
 *
 * This app talks to exactly one host and already bounds every request with a
 * timeout, so guessing at connectivity buys nothing and costs the error state.
 * Trust the request itself: try, fail, and say so.
 */
onlineManager.setOnline(true);

export function DataProvider({ children }: { children: React.ReactNode }) {
  // Created in state so it survives re-renders but is never shared between
  // users on the server.
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            /**
             * The Republic is a small, slow-moving place: nobody edits their
             * profile twice a minute. Round trips are what cost here — the
             * database answers in ~3ms, but each request to Supabase is ~300ms
             * of network transit — so navigating between tabs should serve
             * from cache and refresh in the background.
             */
            staleTime: 30_000,
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: true,
            refetchOnMount: 'always',
            /**
             * One retry, not three. A failure here is almost always RLS
             * refusing or the project being paused, and neither is fixed by
             * asking again — retrying just delays the error the screen now
             * knows how to show.
             */
            retry: 1,
            /**
             * Attempt the request even when react-query believes the device is
             * offline. Its default ('online') PAUSES a query instead of running
             * it, so the query never settles, the error path never runs, and the
             * screen spins forever — observed exactly that against an
             * unreachable host, with navigator.onLine still reporting true.
             *
             * An eternal spinner is the same lie as an empty Republic, just
             * quieter. We would rather try, fail, and say so: there is a
             * ten-second timeout on every query and a real error screen waiting
             * behind it.
             */
            networkMode: 'always',
          },
        },
      })
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
