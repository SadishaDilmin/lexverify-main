export default function RiskRatingBadge({ rating }: { rating: string }) {
  const colorMap: Record<string, string> = {
    green: "bg-risk-green-bg text-risk-green border-risk-green/20",
    Green: "bg-risk-green-bg text-risk-green border-risk-green/20",
    amber: "bg-risk-amber-bg text-risk-amber border-risk-amber/20",
    Amber: "bg-risk-amber-bg text-risk-amber border-risk-amber/20",
    red: "bg-risk-red-bg text-risk-red border-risk-red/20",
    Red: "bg-risk-red-bg text-risk-red border-risk-red/20",
    critical: "bg-destructive/10 text-destructive border-destructive/20",
  };

  const dotColor =
    /green/i.test(rating) ? "bg-risk-green"
    : /red/i.test(rating) ? "bg-risk-red"
    : /critical/i.test(rating) ? "bg-destructive"
    : "bg-risk-amber";

  const key = rating.toLowerCase();
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold ${colorMap[key] || colorMap.amber}`}
    >
      <span className={`rounded-full h-2 w-2 ${dotColor}`} />
      {rating.charAt(0).toUpperCase() + rating.slice(1)} Risk
    </span>
  );
}
