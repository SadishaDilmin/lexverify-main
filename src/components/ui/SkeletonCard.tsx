interface Props {
  lines?: number;
  className?: string;
}

/** Renders skeleton placeholder lines for loading states */
export default function SkeletonCard({ lines = 3, className = "" }: Props) {
  return (
    <div className={`rounded-xl border border-border/40 bg-card p-5 space-y-3 ${className}`}>
      <div className="skeleton-pulse h-4 w-2/5 rounded" />
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="skeleton-pulse h-3 rounded"
          style={{ width: `${85 - i * 12}%` }}
        />
      ))}
    </div>
  );
}
