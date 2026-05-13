import { Paperclip } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { EvidenceReference } from "./types";

interface EvidenceChipProps {
  references: EvidenceReference[];
  onClick: () => void;
}

export default function EvidenceChip({ references, onClick }: EvidenceChipProps) {
  if (references.length === 0) return null;

  const hasDiscrepancy = references.some(r => r.relationship_type === "cross_document_discrepancy");

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="inline-flex items-center gap-1 ml-2 group"
      title={`${references.length} source${references.length !== 1 ? "s" : ""} — click to verify`}
    >
      <Badge
        variant="outline"
        className={`text-[10px] px-1.5 py-0 h-5 gap-1 cursor-pointer transition-colors group-hover:bg-accent/20 ${
          hasDiscrepancy
            ? "border-destructive/40 text-destructive bg-destructive/5"
            : "border-accent/40 text-accent bg-accent/5"
        }`}
      >
        <Paperclip size={10} />
        {references.length} source{references.length !== 1 ? "s" : ""}
      </Badge>
    </button>
  );
}
