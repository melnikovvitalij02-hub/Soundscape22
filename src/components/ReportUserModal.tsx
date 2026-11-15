import { useState } from 'react';
import { CheckCircle2, Loader2, X } from 'lucide-react';
import { useLocale } from '@/context/LocaleContext';
import { supabase } from '@/lib/supabase';

const REASONS = [
  { value: 'spam', label: 'Спам или реклама' },
  { value: 'harassment', label: 'Оскорбления и травля' },
  { value: 'hate', label: 'Разжигание ненависти' },
  { value: 'sexual', label: 'Сексуальный контент' },
  { value: 'threats', label: 'Угрозы' },
  { value: 'fraud', label: 'Мошенничество' },
  { value: 'other', label: 'Другое' },
] as const;

type Reason = (typeof REASONS)[number]['value'];

type Props = {
  reporterId: string;
  reportedId: string;
  reportedName: string;
  onClose: () => void;
};

export default function ReportUserModal({ reporterId, reportedId, reportedName, onClose }: Props) {
  const { t } = useLocale();
  const [reason, setReason] = useState<Reason | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (!reason) return;
    setBusy(true);
    setError(null);
    const { error: insertError } = await supabase.from('user_reports').insert({
      reporter_id: reporterId,
      reported_id: reportedId,
      reason,
      details: details.trim() || null,
    });
    setBusy(false);
    if (insertError) {
      setError(
        insertError.code === '23505'
          ? t('Вы уже отправляли жалобу на этого пользователя')
          : t('Не удалось отправить жалобу')
      );
      return;
    }
    setDone(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-theme-surface border border-theme-border rounded-2xl p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 mb-2">
          <h2 className="text-lg font-semibold text-theme-text">
            {t('Пожаловаться на пользователя')} {reportedName}
          </h2>
          <button onClick={onClose} aria-label={t('Закрыть')} className="p-2 -m-2 text-theme-muted hover:text-theme-text transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {done ? (
          <div className="flex flex-col items-center text-center py-6 gap-3">
            <CheckCircle2 className="w-10 h-10 text-theme-success" />
            <p className="text-sm text-theme-text">{t('Спасибо! Жалоба отправлена на проверку.')}</p>
            <button
              type="button"
              onClick={onClose}
              className="mt-2 px-4 py-2 rounded-xl bg-theme-primary text-white text-sm font-medium hover:bg-theme-primary-hover transition-colors"
            >
              {t('Закрыть')}
            </button>
          </div>
        ) : (
          <>
            <p className="text-sm text-theme-muted mb-4">{t('Выберите причину жалобы')}</p>
            <div className="space-y-2 mb-4">
              {REASONS.map((r) => (
                <label
                  key={r.value}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border cursor-pointer text-sm transition-colors ${
                    reason === r.value
                      ? 'border-theme-primary bg-theme-primary/10 text-theme-text'
                      : 'border-theme-border bg-theme-surface2 text-theme-text hover:border-theme-primary/60'
                  }`}
                >
                  <input
                    type="radio"
                    name="report-reason"
                    value={r.value}
                    checked={reason === r.value}
                    onChange={() => setReason(r.value)}
                    className="accent-[var(--theme-primary,#3b82f6)]"
                  />
                  {t(r.label)}
                </label>
              ))}
            </div>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              maxLength={1000}
              rows={3}
              placeholder={t('Комментарий (необязательно)')}
              className="w-full px-4 py-2.5 mb-4 bg-theme-surface2 border border-theme-border rounded-xl text-theme-text text-sm resize-none focus:outline-none focus:border-theme-primary transition-colors"
            />
            {error && <p className="text-sm text-theme-danger mb-3">{error}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-theme-muted hover:text-theme-text transition-colors"
              >
                {t('Отмена')}
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={!reason || busy}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-theme-danger text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                {t('Отправить жалобу')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
