import { FileText, Hash, Star, ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { EvidenceReference } from "./types";
import { RELATIONSHIP_LABELS, RELATIONSHIP_STYLES } from "./types";
import EvidenceSourceNavigator from "./EvidenceSourceNavigator";

interface EvidenceMetadataPanelProps {
  references: EvidenceReference[];
  currentIndex: number;
  onNavigate: (index: number) => void;
  onClose: () => void;
  sectionHeading: string;
  itemLabel: string;
}

export default function EvidenceMetadataPanel({
  references,
  currentIndex,
  onNavigate,
  onClose,
  sectionHeading,
  itemLabel,
}: EvidenceMetadataPanelProps) {
  const current = references[currentIndex];
  if (!current) return null;

  const relStyle = RELATIONSHIP_STYLES[current.relationship_type] || RELATIONSHIP_STYLES.direct_extraction;
  const confPercent = current.confidence_score != null ? Math.round(current.confidence_score * 100) : null;

  return (
    <div className="flex flex-col h-full">
      {/* Back button */}
      <div className="p-3 border-b border-border">
        <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={onClose}>
          <ArrowLeft size={14} /> Back to Report
        </Button>
      </div>

      {/* Report context */}
      <div className="p-4 space-y-3 border-b border-border">
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Report Section</p>
          <p className="text-xs font-medium text-foreground mt-0.5">{sectionHeading}</p>
        </div>
        {itemLabel && (
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Selected Item</p>
            <p className="text-xs text-foreground mt-0.5 leading-relaxed">{itemLabel}</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="p-4 border-b border-border">
        <EvidenceSourceNavigator references={references} currentIndex={currentIndex} onNavigate={onNavigate} />
        {references.length > 1 && (
          <p className="text-[10px] text-muted-foreground mt-2">
            This finding is supported by {references.length} sources
          </p>
        )}
      </div>

      {/* Source metadata */}
      <div className="p-4 space-y-3 flex-1 overflow-y-auto">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <FileText size={13} className="text-muted-foreground shrink-0" />
            <span className="text-xs font-medium text-foreground truncate">{current.document_name}</span>
          </div>

          {current.page_number != null && (
            <div className="flex items-center gap-2">
              <Hash size={13} className="text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground">Page {current.page_number}</span>
            </div>
          )}

          <Badge
            variant="outline"
            className={`text-[10px] ${relStyle.bg} ${relStyle.text} border-transparent`}
          >
            {RELATIONSHIP_LABELS[current.relationship_type]}
          </Badge>

          {confPercent != null && (
            <div className="flex items-center gap-2">
              <Star size={13} className="text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground">
                Confidence: <span className="font-medium text-foreground">{confPercent}%</span>
              </span>
            </div>
          )}

          {current.is_primary && references.length > 1 && (
            <Badge variant="outline" className="text-[10px] bg-accent/10 text-accent border-transparent">
              Primary source
            </Badge>
          )}
        </div>

        {current.source_snippet && (
          <>
            <Separator />
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Source Snippet
              </p>
              <div className="rounded-md bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800/40 p-3">
                <p className="text-xs text-foreground leading-relaxed italic">"{current.source_snippet}"</p>
              </div>
            </div>
          </>
        )}

        {!current.anchor_text && !current.page_number && (
          <div className="rounded-md bg-muted p-2.5">
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Precise source anchor unavailable for this file type. Nearest matched section shown. Source snippet available above.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
