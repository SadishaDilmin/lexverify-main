import { useMemo } from "react";
import { FileText, Calendar, DollarSign, User, CheckCircle2, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface DocumentInfo {
  id: string;
  file_name: string;
  doc_type: string;
  created_at: string;
  appears_complete: boolean;
  completeness_notes: string | null;
}

interface SmartDocPreReadProps {
  documents: DocumentInfo[];
  purchasePrice?: number | null;
  propertyAddress?: string;
}

interface ExtractedMeta {
  docName: string;
  docType: string;
  complete: boolean;
  notes: string | null;
  uploadDate: string;
  insights: string[];
}

const DOC_TYPE_INSIGHTS: Record<string, string[]> = {
  aml_sow: ["Identity and source of funds evidence", "Review for AML compliance"],
  title: ["Check title register for restrictions", "Verify ownership matches seller"],
  searches: ["Check completion dates are recent", "Review for adverse entries"],
  environmental: ["Check flood risk zone", "Contaminated land indicators"],
  epc: ["Verify EPC rating and expiry", "Energy efficiency recommendations"],
  contracts: ["Review special conditions", "Check completion timeline"],
  management_pack: ["Service charge arrears", "Major works planned"],
  local_authority: ["Planning applications nearby", "Conservation area status"],
  drainage_water: ["Shared drainage connections", "Surface water drainage"],
};

export default function SmartDocPreRead({ documents, purchasePrice, propertyAddress }: SmartDocPreReadProps) {
  const extracted = useMemo<ExtractedMeta[]>(() => {
    return documents.map((doc) => ({
      docName: doc.file_name,
      docType: doc.doc_type,
      complete: doc.appears_complete,
      notes: doc.completeness_notes,
      uploadDate: doc.created_at,
      insights: DOC_TYPE_INSIGHTS[doc.doc_type] || ["Standard document — review during analysis"],
    }));
  }, [documents]);

  if (documents.length === 0) return null;

  const completeCount = extracted.filter((e) => e.complete).length;
  const incompleteCount = extracted.filter((e) => !e.complete).length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <FileText size={14} className="text-accent" />
          Document Pre-Read Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {/* Summary bar */}
        <div className="flex items-center gap-3 text-[11px]">
          <div className="flex items-center gap-1 text-[hsl(var(--risk-green))]">
            <CheckCircle2 size={12} />
            <span className="font-medium">{completeCount} complete</span>
          </div>
          {incompleteCount > 0 && (
            <div className="flex items-center gap-1 text-[hsl(var(--risk-amber))]">
              <AlertTriangle size={12} />
              <span className="font-medium">{incompleteCount} need attention</span>
            </div>
          )}
          {purchasePrice && (
            <div className="flex items-center gap-1 text-muted-foreground ml-auto">
              <DollarSign size={12} />
              <span>£{Number(purchasePrice).toLocaleString()}</span>
            </div>
          )}
        </div>

        {/* Document cards */}
        <div className="space-y-1.5 max-h-[250px] overflow-y-auto pr-1">
          {extracted.map((doc, i) => (
            <div key={i} className={`px-3 py-2 rounded-lg border text-[11px] ${doc.complete ? "border-border bg-background" : "border-[hsl(var(--risk-amber))]/20 bg-[hsl(var(--risk-amber))]/5"}`}>
              <div className="flex items-center gap-2">
                {doc.complete ? (
                  <CheckCircle2 size={12} className="text-[hsl(var(--risk-green))] shrink-0" />
                ) : (
                  <AlertTriangle size={12} className="text-[hsl(var(--risk-amber))] shrink-0" />
                )}
                <span className="font-semibold text-foreground truncate flex-1">{doc.docName}</span>
                <Badge variant="secondary" className="text-[8px] h-3.5">{doc.docType}</Badge>
              </div>
              {doc.notes && (
                <p className="text-muted-foreground mt-1 ml-5">{doc.notes}</p>
              )}
              <div className="flex flex-wrap gap-1 mt-1 ml-5">
                {doc.insights.map((insight, j) => (
                  <span key={j} className="text-[9px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
                    {insight}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
