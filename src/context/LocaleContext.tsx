import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { type Locale, LOCALES, translate } from '@/i18n';

type LocaleContextType = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
};

const LocaleContext = createContext<LocaleContextType | undefined>(undefined);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const saved = localStorage.getItem('soundscape-locale');
    return saved === 'en' || saved === 'ru' ? (saved as Locale) : 'ru';
  });

  const setLocale = (next: Locale) => {
    setLocaleState(next);
    localStorage.setItem('soundscape-locale', next);
  };

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = 'ltr';
  }, [locale]);

  const t = (key: string) => translate(locale, key);

  return (
    <LocaleContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale must be used within LocaleProvider');
  return ctx;
}

export { LOCALES };
