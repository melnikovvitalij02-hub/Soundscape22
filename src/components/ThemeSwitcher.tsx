import { useState, useRef, useEffect } from 'react';
import { useTheme, THEMES, type ThemeId } from '@/context/ThemeContext';
import { Palette, Check } from 'lucide-react';

export default function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const current = THEMES.find((t) => t.id === theme);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-theme-muted hover:text-theme-text hover:bg-theme-surface2 transition-colors"
      >
        <Palette className="w-5 h-5 shrink-0" />
        <span className="flex-1 text-left">Тема: {current?.name}</span>
        <span className="w-4 h-4 rounded-full shrink-0 ring-2 ring-theme-border" style={{ background: current?.swatch }} />
      </button>

      {open && (
        <div className="absolute bottom-full mb-2 left-0 right-0 bg-theme-surface border border-theme-border rounded-xl shadow-2xl overflow-hidden z-50 glass-surface">
          <div className="p-2 space-y-1">
            {THEMES.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setTheme(t.id as ThemeId);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                  theme === t.id
                    ? 'bg-theme-primary-bg text-theme-primary-text border border-theme-primary-border'
                    : 'text-theme-muted hover:text-theme-text hover:bg-theme-surface2'
                }`}
              >
                <div
                  className="w-6 h-6 rounded-lg shrink-0 ring-1 ring-white/10"
                  style={{ background: t.swatch }}
                />
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
