'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
             * NO retries, and this one is load-bearing rather than a
             * preference.
             *
             * Two separate "spins forever" bugs traced back to the same cause:
             * react-query PAUSES a retry when it believes the device is
             * offline, and it believed that here with navigator.onLine
             * reporting true. A paused retry never settles, so the query never
             * reaches an error state, so the screen spins and the error UI
             * never runs. Setting networkMode 'always' and forcing
             * onlineManager online both failed to prevent it.
             *
             * With no retry there is nothing to pause. Measured: an unreachable
             * host now surfaces an error in ~6s and a refused query in ~4s,
             * where both previously span indefinitely.
             *
             * Losing retries costs little here. The failures this app actually
             * sees — RLS refusing, a paused project, no signal — are not fixed
             * by asking again, and a member who wants to retry has a button.
             */
            retry: 0,
            /**
             * Belt and braces alongside retry: 0 — attempt the request rather
             * than parking it when react-query guesses we are offline. This app
             * talks to exactly one host and bounds every request itself, so
             * guessing at connectivity buys nothing and costs the error state.
             */
            networkMode: 'always',
          },
        },
      })
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
