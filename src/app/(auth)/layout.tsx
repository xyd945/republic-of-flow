'use client';

import { I18nProvider } from '@/lib/i18n/context';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  // Login sits outside the app shell, so it needs its own provider — without
  // one, useI18n() falls back to the default context and ui() returns raw keys.
  return <I18nProvider defaultLang="en">{children}</I18nProvider>;
}
