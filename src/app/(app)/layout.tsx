'use client';

import { usePathname, useRouter } from 'next/navigation';
import { I18nProvider, useI18n } from '@/lib/i18n/context';
import { DataProvider } from '@/lib/data/client';
import { useNotifications } from '@/lib/data/notifications';
import { useViewerProfile } from '@/lib/data/views';
import { useClaimMembership } from '@/lib/data/mutations';
import { NotificationPanel } from '@/components/notification-panel';
import { StatusStrip, TabBar, TopBar, LangSwitch, BellButton, TABS } from '@/components/pixel/shell';
import { useEffect, useRef, useState } from 'react';

/**
 * Titles per route. The Home screen carries its own headline, so it gets the
 * wordmark rather than a page title — matching the design, where Home is the
 * only screen without a titled bar.
 */
const TITLES: Record<string, { title: string; cn: string; back?: boolean }> = {
  '/people': { title: 'Founder Directory', cn: '创始人名录' },
  '/market': { title: 'Flow Market', cn: '市场' },
  '/profile': { title: 'Your Dossier', cn: '我的档案' },
  '/admin': { title: 'Curator Desk', cn: '策展人事务台', back: true },
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider defaultLang="en">
      <DataProvider>
        <AppShell>{children}</AppShell>
      </DataProvider>
    </I18nProvider>
  );
}

function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { lang, setLang } = useI18n();
  const notifications = useNotifications();
  const [showNotifications, setShowNotifications] = useState(false);

  /* The claim normally happens on the login screen. If that call was lost —
     tab closed, connection dropped — the member is signed in with no founder
     number and is missing from the directory, which they cannot fix from any
     screen. So try again here. Idempotent, and a no-op for everyone who
     already has a number, which after the first login is everyone. */
  const { profile } = useViewerProfile();
  /* mutate is referentially stable; the mutation object is not, and depending
     on it would re-run this effect on every state change it makes. */
  const { mutate: claim } = useClaimMembership();
  const claimed = useRef(false);
  useEffect(() => {
    if (profile && profile.founder_no === null && !claimed.current) {
      // Once per mount, and deliberately not reset on failure: a claim that
      // keeps failing would otherwise re-fire on its own error render, in a
      // loop with no backoff. The next page load is soon enough.
      claimed.current = true;
      claim({});
    }
  }, [profile, claim]);

  // A dossier is a detail view of People, so the tab stays lit and the bar
  // offers a way back rather than stranding the reader.
  const isDossier = pathname.startsWith('/people/');
  const head = isDossier
    ? { title: 'Dossier', cn: '创始人档案', back: true }
    : TITLES[pathname];

  const activeTab =
    TABS.find((t) => (t.id === '/' ? pathname === '/' : pathname.startsWith(t.id)))?.id
    ?? (pathname === '/admin' ? '/profile' : '/');

  const openNotifications = async () => {
    setShowNotifications(true);
    if (await notifications.refetch()) notifications.markRead();
  };

  return (
    <div className="rof-frame">
      <div className="rof-phone">
        <div className="rof-screen">
          <StatusStrip />
          <TopBar
            title={head?.title}
            cn={head?.cn}
            onBack={head?.back ? () => router.back() : undefined}
            right={
              <>
                <BellButton count={notifications.unreadCount} onClick={openNotifications} />
                <LangSwitch lang={lang} onChange={setLang} />
              </>
            }
          />
          <main data-scroll-region className="flex-1 overflow-y-auto no-scrollbar">{children}</main>
          <TabBar active={activeTab} onChange={(id) => router.push(id)} />
        </div>
      </div>

      {showNotifications && (
        <NotificationPanel
          items={notifications.items}
          loading={notifications.loading}
          error={notifications.error}
          onClose={() => setShowNotifications(false)}
        />
      )}
    </div>
  );
}
