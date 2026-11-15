import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

export type ThemeId = 'night' | 'light' | 'aurora' | 'mars' | 'nebula';

export type ThemeIconName = 'moon' | 'sun' | 'leaf' | 'fire' | 'star';

export type ThemeInfo = {
  id: ThemeId;
  name: string;
  group: 'base' | 'color';
  isDark: boolean;
  icon: ThemeIconName;
};

export const THEMES: ThemeInfo[] = [
  { id: 'night', name: 'Ночь', group: 'base', isDark: true, icon: 'moon' },
  { id: 'light', name: 'День', group: 'base', isDark: false, icon: 'sun' },
  { id: 'aurora', name: 'Аврора', group: 'color', isDark: true, icon: 'leaf' },
  { id: 'mars', name: 'Марс', group: 'color', isDark: true, icon: 'fire' },
  { id: 'nebula', name: 'Туманность', group: 'color', isDark: true, icon: 'star' },
];

type ThemeContextType = {
  theme: ThemeId;
  setTheme: (t: ThemeId) => void;
  isDark: boolean;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(() => {
    const saved = localStorage.getItem('soundscape-theme') as ThemeId | null;
    return saved || 'night';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('soundscape-theme', theme);
  }, [theme]);

  const setTheme = (t: ThemeId) => setThemeState(t);
  const info = THEMES.find((t) => t.id === theme);
  const isDark = info ? info.isDark : true;

  return <ThemeContext.Provider value={{ theme, setTheme, isDark }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
