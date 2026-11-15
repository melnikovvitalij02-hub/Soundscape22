import { useEffect } from 'react';
import { X } from 'lucide-react';
import { LEGAL_SECTIONS } from '@/lib/legalContent';

export default function LegalRulesModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="legal-rules-title"
        className="relative flex max-h-[85vh] w-full max-w-2xl flex-col rounded-3xl border border-[rgba(255,255,255,0.08)] bg-[#151F3C] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 border-b border-[rgba(255,255,255,0.06)] px-6 py-5">
          <h2 id="legal-rules-title" className="text-lg font-bold text-white">
            Правила сервиса Soundscape Pro
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="rounded-lg p-2 text-[#94A3B8] transition-colors hover:bg-white/5 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-8 overflow-y-auto px-6 py-6">
          {LEGAL_SECTIONS.map((section) => (
            <section key={section.id}>
              <h3 className="mb-3 text-base font-semibold text-[#60A5FA]">{section.title}</h3>
              <div className="space-y-4">
                {section.items.map((item) => (
                  <div key={item.question}>
                    <p className="mb-1.5 text-sm font-semibold text-white">{item.question}</p>
                    {item.answer.map((paragraph) => (
                      <p key={paragraph} className="text-sm leading-[1.5] text-[#CBD5E1]">
                        {paragraph}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
