import { FileText, MapPin, Pencil, Users, Gift, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface SoWCaseHeaderProps {
  caseReference: string;
  propertyAddress: string;
  purchasePrice: string;
  tenure: string;
  totalFiles: number;
  isLoading: boolean;
  purchaserCount: number;
  giftorCount: number;
  onEditTransaction: () => void;
}

export default function SoWCaseHeader({
  caseReference,
  propertyAddress,
  purchasePrice,
  tenure,
  totalFiles,
  isLoading,
  purchaserCount,
  giftorCount,
  onEditTransaction,
}: SoWCaseHeaderProps) {
  if (!caseReference && !propertyAddress) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-3 shadow-sm">
      {/* Top row: case ref + address + edit */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-accent shrink-0" />
            <span className="font-mono text-base font-bold text-foreground tracking-tight">
              {caseReference || "No Reference"}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin size={14} className="shrink-0" />
            <span className="truncate">{propertyAddress || "No address"}</span>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 h-8 w-8 text-muted-foreground hover:text-foreground"
          onClick={onEditTransaction}
        >
          <Pencil size={14} />
        </Button>
      </div>

      {/* Info chips row */}
      <div className="flex flex-wrap items-center gap-2">
        {purchasePrice && (
          <Badge variant="secondary" className="rounded-full text-xs font-medium gap-1 px-3 py-1 bg-muted border border-border text-foreground">
            £{Number(purchasePrice).toLocaleString()}
          </Badge>
        )}
        {tenure && (
          <Badge variant="secondary" className="rounded-full text-xs font-medium gap-1 px-3 py-1 bg-muted border border-border text-foreground capitalize">
            {tenure}
          </Badge>
        )}
        <Badge variant="secondary" className="rounded-full text-xs font-medium gap-1 px-3 py-1 bg-muted border border-border text-foreground">
          {totalFiles} Document{totalFiles !== 1 ? "s" : ""}
        </Badge>
        <Badge variant="secondary" className="rounded-full text-xs font-medium gap-1 px-3 py-1 bg-muted border border-border text-muted-foreground">
          <Users size={11} />
          {purchaserCount} purchaser{purchaserCount !== 1 ? "s" : ""}
        </Badge>
        {giftorCount > 0 && (
          <Badge variant="secondary" className="rounded-full text-xs font-medium gap-1 px-3 py-1 bg-muted border border-border text-muted-foreground">
            <Gift size={11} />
            {giftorCount} giftor{giftorCount !== 1 ? "s" : ""}
          </Badge>
        )}
        {isLoading && (
          <Badge className="rounded-full text-xs font-medium gap-1.5 px-3 py-1 bg-accent/10 border border-accent/20 text-accent">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-accent" />
            </span>
            AI Analysis Running
          </Badge>
        )}
      </div>
    </div>
  );
}
