type VIPAvatarProps = {
  src: string | null;
  alt: string;
  size?: number;
  isPremium?: boolean;
  className?: string;
};

export default function VIPAvatar({ src, alt, size = 32, isPremium, className = '' }: VIPAvatarProps) {
  const badgeSize = Math.max(14, Math.round(size * 0.42));
  return (
    <div className={`relative shrink-0 ${className}`} style={{ width: size, height: size }}>
      {src ? (
        <img
          src={src}
          alt={alt}
          className="rounded-full object-cover w-full h-full"
        />
      ) : (
        <div
          className="rounded-full bg-gradient-to-br from-theme-primary to-theme-accent flex items-center justify-center text-white font-bold w-full h-full"
          style={{ fontSize: size * 0.4 }}
        >
          {alt?.[0]?.toUpperCase()}
        </div>
      )}
      {isPremium && (
        <span
          className="absolute -bottom-0.5 -right-0.5 rounded-full flex items-center justify-center font-bold text-white leading-none"
          style={{
            width: badgeSize,
            height: badgeSize,
            fontSize: Math.max(7, badgeSize * 0.42),
            background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
            border: '1.5px solid var(--color-surface, #0a0a14)',
            boxShadow: '0 1px 4px rgba(245,158,11,0.5)',
          }}
          title="VIP — Premium подписка активна"
        >
          VIP
        </span>
      )}
    </div>
  );
}
