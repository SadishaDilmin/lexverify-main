import { useState } from "react";
import { History, FileUp, ChevronDown, ChevronRight, RefreshCw, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface DocumentVersionHistoryProps {
  documentId: string;
  documentName: string;
  caseId: string;
}

export default function DocumentVersionHistory({ documentId, documentName, caseId }: DocumentVersionHistoryProps) {
  const [expanded, setExpanded] = useState(false);

  const { data: versions = [] } = useQuery({
    queryKey: ["document_versions", documentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_versions")
        .select("*")
        .eq("document_id", documentId)
        .order("version_number", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!documentId && expanded,
  });

  if (!documentId) return null;

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-[11px] font-medium text-foreground hover:bg-muted/30 transition-colors"
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <History size={12} className="text-accent" />
        Version History
        {versions.length > 0 && (
          <Badge variant="secondary" className="text-[8px] h-3.5 ml-auto">{versions.length} version{versions.length !== 1 ? "s" : ""}</Badge>
        )}
      </button>
      {expanded && (
        <div className="border-t border-border px-3 py-2 space-y-1.5 bg-muted/10">
          {versions.length === 0 ? (
            <p className="text-[10px] text-muted-foreground py-1">No previous versions recorded.</p>
          ) : (
            versions.map((v: any) => (
              <div key={v.id} className="flex items-center gap-2 text-[10px] px-2 py-1.5 rounded bg-background border border-border">
                <Badge variant="secondary" className="text-[8px] h-3.5 shrink-0">v{v.version_number}</Badge>
                <span className="truncate text-foreground flex-1">{v.file_name}</span>
                <span className="text-muted-foreground shrink-0">
                  {new Date(v.uploaded_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))
          )}
          {versions.length > 1 && (
            <div className="flex items-center gap-1 text-[9px] text-accent pt-1">
              <RefreshCw size={9} />
              <span>Document was updated {versions.length - 1} time{versions.length > 2 ? "s" : ""} — consider re-running analysis</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
