import { FileText, MapPin } from "lucide-react";

interface CaseBannerProps {
  caseReference: string;
  propertyAddress: string;
}

const CaseBanner = ({ caseReference, propertyAddress }: CaseBannerProps) => {
  if (!caseReference && !propertyAddress) return null;

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-muted/50 border border-border/60 mb-4">
      <div className="flex items-center gap-2 text-sm">
        <FileText size={14} className="text-accent shrink-0" />
        <span className="font-mono font-semibold text-foreground">{caseReference || "—"}</span>
      </div>
      <span className="text-border">|</span>
      <div className="flex items-center gap-2 text-sm min-w-0">
        <MapPin size={14} className="text-muted-foreground shrink-0" />
        <span className="text-muted-foreground truncate">{propertyAddress || "—"}</span>
      </div>
    </div>
  );
};

export default CaseBanner;
