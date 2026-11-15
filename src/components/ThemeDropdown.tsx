import { useState, useRef, useEffect } from 'react';
import { useTheme, THEMES, type ThemeId } from '@/context/ThemeContext';
import { Moon, Sun, Check, ChevronDown } from 'lucide-react';

export default function ThemeDropdown({ dropUp = false, dropRight = false }: { dropUp?: boolean; dropRight?: boolean }) {
  const { theme, setTheme, isDark } = useTheme();
  const [open, setOpen] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const animationTimer = useRef<number | null>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', escHandler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', escHandler);
      if (animationTimer.current !== null) window.clearTimeout(animationTimer.current);
    };
  }, []);

  const baseThemes = THEMES.filter((t) => t.group === 'base');
  const colorThemes = THEMES.filter((t) => t.group === 'color');

  const toggleTheme = () => {
    setIsRotating(true);
    setTheme(isDark ? 'light' : 'night');
    if (animationTimer.current !== null) window.clearTimeout(animationTimer.current);
    animationTimer.current = window.setTimeout(() => setIsRotating(false), 360);
  };

  const handleSelect = (id: ThemeId) => {
    setTheme(id);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative z-[100] flex items-center gap-1.5">
      <button
        type="button"
        onClick={toggleTheme}
        className={`theme-toggle-button ${isRotating ? 'clicked' : ''}`}
        aria-label={isDark ? 'Включить дневную тему' : 'Включить ночную тему'}
        title={isDark ? 'Переключить на день' : 'Переключить на ночь'}
      >
        {isDark ? <Moon className="w-5 h-5" strokeWidth={2.2} /> : <Sun className="w-5 h-5" strokeWidth={2.2} />}
      </button>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="theme-menu-button"
        aria-label="Выбрать цветовую тему"
        aria-expanded={open}
      >
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className={`${dropRight ? 'absolute left-full top-0 ml-2' : dropUp ? 'absolute bottom-full right-0 mb-2' : 'absolute right-0 top-full mt-2'} theme-menu-panel w-52 rounded-xl overflow-hidden z-[1000] isolate`}>
          <div className="p-2">
            <p className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-theme-muted/60">Базовые темы</p>
            {baseThemes.map((t) => (
              <button
                type="button"
                key={t.id}
                onClick={() => handleSelect(t.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${theme === t.id ? 'bg-theme-primary-bg text-theme-primary-text border border-theme-primary-border' : 'text-theme-muted hover:text-theme-text hover:bg-theme-surface2'}`}
              >
                <span className="flex-1 text-left">{t.name}</span>
                {theme === t.id && <Check className="w-4 h-4 text-theme-primary" />}
              </button>
            ))}
            <div className="my-2 h-px bg-theme-border/50" />
            <p className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-theme-muted/60">Цветовые вариации</p>
            {colorThemes.map((t) => (
              <button
                type="button"
                key={t.id}
                onClick={() => handleSelect(t.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${theme === t.id ? 'bg-theme-primary-bg text-theme-primary-text border border-theme-primary-border' : 'text-theme-muted hover:text-theme-text hover:bg-theme-surface2'}`}
              >
                <span className="flex-1 text-left">{t.name}</span>
                {theme === t.id && <Check className="w-4 h-4 text-theme-primary" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
