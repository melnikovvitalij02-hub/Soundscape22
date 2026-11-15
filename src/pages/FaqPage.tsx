import { useState } from 'react';
import { ChevronDown, Scale } from 'lucide-react';
import { LEGAL_SECTIONS } from '@/lib/legalContent';

export default function FaqPage() {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:py-12">
      <header className="mb-8 flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-theme-primary/15 text-theme-primary">
          <Scale className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-3xl font-semibold leading-[1.2] text-theme-text">Юридический FAQ</h1>
          <p className="mt-2 text-base leading-[1.5] text-theme-muted">
            Правила сервиса, персональные данные, авторские права, покупки и пользовательское соглашение.
          </p>
        </div>
      </header>

      <nav className="mb-10 flex flex-wrap gap-2" aria-label="Разделы FAQ">
        {LEGAL_SECTIONS.map((section) => (
          <a
            key={section.id}
            href={`#${section.id}`}
            className="rounded-full border border-theme-border bg-theme-surface px-3 py-1.5 text-sm text-theme-text transition-colors hover:border-theme-primary hover:text-theme-primary"
          >
            {section.title}
          </a>
        ))}
      </nav>

      <div className="space-y-10">
        {LEGAL_SECTIONS.map((section) => (
          <section key={section.id} id={section.id} className="scroll-mt-6">
            <h2 className="mb-3 text-xl font-semibold leading-[1.2] text-theme-text">{section.title}</h2>
            <div className="divide-y divide-theme-border overflow-hidden rounded-2xl border border-theme-border bg-theme-surface">
              {section.items.map((item) => {
                const itemId = `${section.id}-${item.question}`;
                const isOpen = openId === itemId;
                return (
                  <div key={itemId}>
                    <button
                      type="button"
                      onClick={() => setOpenId(isOpen ? null : itemId)}
                      aria-expanded={isOpen}
                      className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-base font-medium leading-[1.5] text-theme-text transition-colors hover:bg-theme-border/30"
                    >
                      <span>{item.question}</span>
                      <ChevronDown
                        className={`h-5 w-5 shrink-0 text-theme-muted transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                      />
                    </button>
                    {isOpen && (
                      <div className="space-y-3 px-5 pb-5 text-sm leading-[1.5] text-theme-muted">
                        {item.answer.map((paragraph) => (
                          <p key={paragraph}>{paragraph}</p>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
