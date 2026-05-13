import { useState, useMemo } from "react";
import { RefreshCw, Zap, FileUp, Loader2, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface DocumentInfo {
  id: string;
  file_name: string;
  doc_type: string;
  created_at: string;
}

interface IncrementalReAnalysisProps {
  documents: DocumentInfo[];
  lastAnalysisDate: string | null;
  onFullReRun: () => void;
  onIncrementalRun?: (newDocIds: string[]) => void;
  isRunning: boolean;
  agentLabel: string;
}

export default function IncrementalReAnalysis({
  documents,
  lastAnalysisDate,
  onFullReRun,
  onIncrementalRun,
  isRunning,
  agentLabel,
}: IncrementalReAnalysisProps) {
  const newDocs = useMemo(() => {
    if (!lastAnalysisDate) return [];
    const cutoff = new Date(lastAnalysisDate).getTime();
    return documents.filter((d) => new Date(d.created_at).getTime() > cutoff);
  }, [documents, lastAnalysisDate]);

  if (!lastAnalysisDate) return null;
  if (newDocs.length === 0) return null;

  const handleIncremental = () => {
    onIncrementalRun?.(newDocs.map((d) => d.id));
  };

  return (
    <Card className="border-accent/20 bg-accent/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Zap size={14} className="text-accent" />
          New Documents Detected
          <Badge variant="secondary" className="text-[10px] h-5 bg-accent/10 text-accent">
            {newDocs.length} new
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-[11px] text-muted-foreground">
          {newDocs.length} document{newDocs.length !== 1 ? "s were" : " was"} uploaded after the last {agentLabel} analysis.
          You can run a targeted delta analysis to save credits or a full re-run.
        </p>

        {/* New doc list */}
        <div className="space-y-1">
          {newDocs.slice(0, 5).map((doc) => (
            <div key={doc.id} className="flex items-center gap-2 text-[10px] px-2 py-1 rounded bg-background border border-border">
              <FileUp size={10} className="text-accent shrink-0" />
              <span className="truncate text-foreground">{doc.file_name}</span>
              <Badge variant="secondary" className="text-[8px] h-3.5 ml-auto">{doc.doc_type}</Badge>
            </div>
          ))}
          {newDocs.length > 5 && (
            <p className="text-[9px] text-muted-foreground pl-2">+ {newDocs.length - 5} more</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          {onIncrementalRun && (
            <Button
              size="sm"
              className="text-[10px] h-7 gap-1.5 bg-accent text-accent-foreground hover:bg-accent/90"
              onClick={handleIncremental}
              disabled={isRunning}
            >
              {isRunning ? <Loader2 size={10} className="animate-spin" /> : <Zap size={10} />}
              Delta Analysis ({newDocs.length} doc{newDocs.length !== 1 ? "s" : ""})
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="text-[10px] h-7 gap-1.5"
            onClick={onFullReRun}
            disabled={isRunning}
          >
            <RefreshCw size={10} />
            Full Re-Run
          </Button>
        </div>

        <div className="flex items-start gap-1.5 text-[9px] text-muted-foreground pt-1">
          <AlertTriangle size={10} className="shrink-0 mt-0.5 text-[hsl(var(--risk-amber))]" />
          <span>Delta analysis only processes new documents against the existing report. A full re-run reprocesses everything for complete accuracy.</span>
        </div>
      </CardContent>
    </Card>
  );
}
