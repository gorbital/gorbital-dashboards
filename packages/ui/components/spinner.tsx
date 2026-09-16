/** A ring that turns; `size` is the box in px. Inherits `currentColor`. */
export function Spinner({ size = 14, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={`shrink-0 animate-spin ${className}`} aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** A shimmering placeholder the size of what it stands in for. */
export function Skeleton({ className = "h-3 w-24", rounded = "rounded-md" }: { className?: string; rounded?: string }) {
  return <span className={`shimmer inline-block ${rounded} ${className}`} aria-hidden="true" />;
}

/** Text-shaped skeleton lines, for panels waiting on their first data. */
export function SkeletonLines({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  const widths = ["w-3/4", "w-1/2", "w-2/3", "w-5/6", "w-2/5"];
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={`h-3 ${widths[i % widths.length]}`} />
      ))}
    </div>
  );
}
