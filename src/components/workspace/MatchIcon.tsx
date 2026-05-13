import { CheckCircle2, MinusCircle, XCircle } from "lucide-react";

export default function MatchIcon({ match }: { match: string | null }) {
  if (match === "Match") return <CheckCircle2 size={14} className="text-risk-green" />;
  if (match === "Partial") return <MinusCircle size={14} className="text-risk-amber" />;
  return <XCircle size={14} className="text-muted-foreground" />;
}
