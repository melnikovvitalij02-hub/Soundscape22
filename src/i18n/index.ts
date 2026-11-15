import en from './en';
import ru from './ru';

export type Locale = 'ru' | 'en';

export const LOCALES: { id: Locale; name: string; nativeName: string; flag: string }[] = [
  { id: 'ru', name: 'Russian', nativeName: 'Русский', flag: '🇷🇺' },
  { id: 'en', name: 'English', nativeName: 'English', flag: '🇬🇧' },
];

const dictionaries: Record<Locale, Record<string, string>> = { ru, en };

export function translate(locale: Locale, key: string): string {
  if (locale === 'ru') return key; // Russian is the source language
  return dictionaries[locale]?.[key] ?? en[key] ?? key;
}
