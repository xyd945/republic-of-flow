'use client';

import { usePathname, useRouter } from 'next/navigation';
import { I18nProvider, useI18n } from '@/lib/i18n/context';
import { DataProvider } from '@/lib/data/client';
import { BottomNav } from '@/components/ui';

const NAV_ITEMS = [
  { id: '/', icon: 'home', key: 'nav.home' },
  { id: '/people', icon: 'users', key: 'nav.people' },
  { id: '/market', icon: 'landmark', key: 'nav.market' },
  { id: '/profile', icon: 'user', key: 'nav.you' },
];

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
  const { ui } = useI18n();

  const active = NAV_ITEMS.find(
    (n) => n.id === '/' ? pathname === '/' : pathname.startsWith(n.id)
  )?.id ?? '/';

  return (
    <div className="flex justify-center min-h-screen">
      <div className="w-full max-w-[430px] min-h-screen flex flex-col relative" style={{ background: 'rgba(255,253,248,0.78)' }}>
        <main className="flex-1 overflow-y-auto pb-[72px]">{children}</main>
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white/90 backdrop-blur-md border-t border-line z-50">
          <BottomNav items={NAV_ITEMS.map((n) => ({ ...n, label: ui(n.key) }))} active={active} onChange={(id) => router.push(id)} />
        </div>
      </div>
    </div>
  );
}
