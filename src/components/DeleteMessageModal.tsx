import { Loader2, Trash2, X } from 'lucide-react';
import { useLocale } from '@/context/LocaleContext';

type Props = {
  isMine: boolean;
  busy: boolean;
  onDeleteForMe: () => void;
  onDeleteForEveryone: () => void;
  onClose: () => void;
};

export default function DeleteMessageModal({ isMine, busy, onDeleteForMe, onDeleteForEveryone, onClose }: Props) {
  const { t } = useLocale();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-theme-surface border border-theme-border rounded-2xl p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 mb-2">
          <h2 className="text-lg font-semibold text-theme-text">{t('Удалить сообщение?')}</h2>
          <button onClick={onClose} aria-label={t('Закрыть')} className="p-2 -m-2 text-theme-muted hover:text-theme-text transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-sm text-theme-muted mb-5">
          {isMine
            ? t('Выберите, где удалить сообщение')
            : t('Сообщение будет скрыто только у вас')}
        </p>

        <div className="space-y-2">
          <button
            type="button"
            onClick={onDeleteForMe}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-theme-surface2 border border-theme-border text-sm font-medium text-theme-text hover:border-theme-primary transition-colors disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            {t('Удалить только у себя')}
          </button>
          {isMine && (
            <button
              type="button"
              onClick={onDeleteForEveryone}
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-theme-danger text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {t('Удалить у всех')}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="w-full px-4 py-2.5 rounded-xl text-sm font-medium text-theme-muted hover:text-theme-text transition-colors"
          >
            {t('Отмена')}
          </button>
        </div>
      </div>
    </div>
  );
}
