'use client';

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type { Language, Translatable } from '@/types';
import { t as translate, ui as uiString } from './translations';

const STORAGE_KEY = 'rof.lang';

interface I18nContextValue {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (obj: Translatable | string | null | undefined) => string;
  ui: (key: string) => string;
}

const I18nContext = createContext<I18nContextValue>({
  lang: 'en',
  setLang: () => {},
  t: () => '',
  ui: (k) => k,
});

export function I18nProvider({ children, defaultLang = 'en' }: { children: ReactNode; defaultLang?: Language }) {
  const [lang, setLangState] = useState<Language>(defaultLang);

  // Restored after mount rather than during render: reading localStorage on the
  // server is impossible, and seeding state from it would mismatch hydration.
  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'zh') setLangState(saved);
  }, []);

  const setLang = useCallback((next: Language) => {
    setLangState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private mode / storage disabled — the choice just won't persist.
    }
  }, []);

  const t = useCallback((obj: Translatable | string | null | undefined) => translate(obj, lang), [lang]);
  const ui = useCallback((key: string) => uiString(key, lang), [lang]);

  return (
    <I18nContext.Provider value={{ lang, setLang, t, ui }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
