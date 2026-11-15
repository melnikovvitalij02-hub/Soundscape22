import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

type DPadProps = {
  onUp: () => void;
  onDown: () => void;
  onLeft: () => void;
  onRight: () => void;
  onUpRelease?: () => void;
  onDownRelease?: () => void;
  onLeftRelease?: () => void;
  onRightRelease?: () => void;
  onAction?: () => void;
  actionLabel?: string;
  showAction?: boolean;
  size?: 'sm' | 'md';
};

export default function DPad({
  onUp,
  onDown,
  onLeft,
  onRight,
  onUpRelease,
  onDownRelease,
  onLeftRelease,
  onRightRelease,
  onAction,
  actionLabel = 'Огонь',
  showAction = false,
  size = 'md',
}: DPadProps) {
  const btn = size === 'sm' ? 'w-12 h-12' : 'w-16 h-16';
  const icon = size === 'sm' ? 'w-5 h-5' : 'w-7 h-7';
  const iconLg = size === 'sm' ? 'w-6 h-6' : 'w-8 h-8';

  const handleDown = (fn: () => void) => (e: React.PointerEvent) => {
    e.preventDefault();
    fn();
  };
  const handleUp = (fn?: () => void) => (e: React.PointerEvent) => {
    e.preventDefault();
    fn?.();
  };

  const btnClass = `${btn} flex items-center justify-center rounded-2xl bg-theme-surface2 border border-theme-border text-theme-text active:bg-theme-primary active:text-white active:scale-95 transition-all select-none touch-none shadow-sm`;

  return (
    <div className="flex items-end justify-between gap-6 px-2 select-none">
      {/* D-pad */}
      <div className="grid grid-cols-3 grid-rows-3 gap-1.5">
        <div />
        <button
          onPointerDown={handleDown(onUp)}
          onPointerUp={handleUp(onUpRelease)}
          onPointerLeave={handleUp(onUpRelease)}
          className={btnClass}
          aria-label="Вверх"
        >
          <ChevronUp className={icon} />
        </button>
        <div />
        <button
          onPointerDown={handleDown(onLeft)}
          onPointerUp={handleUp(onLeftRelease)}
          onPointerLeave={handleUp(onLeftRelease)}
          className={btnClass}
          aria-label="Влево"
        >
          <ChevronLeft className={icon} />
        </button>
        <div />
        <button
          onPointerDown={handleDown(onRight)}
          onPointerUp={handleUp(onRightRelease)}
          onPointerLeave={handleUp(onRightRelease)}
          className={btnClass}
          aria-label="Вправо"
        >
          <ChevronRight className={icon} />
        </button>
        <div />
        <button
          onPointerDown={handleDown(onDown)}
          onPointerUp={handleUp(onDownRelease)}
          onPointerLeave={handleUp(onDownRelease)}
          className={btnClass}
          aria-label="Вниз"
        >
          <ChevronDown className={icon} />
        </button>
        <div />
      </div>

      {/* Action button */}
      {showAction && (
        <button
          onPointerDown={handleDown(() => onAction?.())}
          className={`${btn} rounded-full bg-gradient-to-br from-theme-primary to-theme-accent border-theme-primary text-white active:scale-90 transition-all font-bold text-xs shadow-lg`}
          aria-label={actionLabel}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
