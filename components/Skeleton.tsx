/** Shimmering placeholder block shown while a panel's data is loading. */
export function Skeleton({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`animate-pulse rounded-lg bg-panel2 ${className}`} style={style} />;
}

/** A stack of skeleton bars filling a fixed-height loading area, replacing plain "Načítám…" text. */
export function SkeletonBlock({ height = 240, lines = 4 }: { height?: number; lines?: number }) {
  return (
    <div className="flex flex-col gap-3 justify-center" style={{ height }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="h-4" style={{ width: `${85 - i * 12}%` }} />
      ))}
    </div>
  );
}
