import { useState, useMemo, useCallback } from "react";
import { Layers, Play, Loader2, CheckCircle2, AlertTriangle, Coins } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";

interface CaseInfo {
  id: string;
  case_reference: string;
  property_address: string;
  status: string;
  risk_level: string | null;
}

interface BatchAnalysisPanelProps {
  cases: CaseInfo[];
  creditsPerCase: number;
  userBalance: number;
  onRunBatch: (caseIds: string[]) => Promise<void>;
}

const BATCH_DISCOUNT = 0.85; // 15% discount for batch

export default function BatchAnalysisPanel({ cases, creditsPerCase, userBalance, onRunBatch }: BatchAnalysisPanelProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  const { toast } = useToast();

  const eligibleCases = useMemo(() =>
    cases.filter((c) => c.status !== "completed"),
  [cases]);

  const toggleCase = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(eligibleCases.map((c) => c.id)));
  };

  const totalCredits = selectedIds.size * creditsPerCase;
  const discountedCredits = Math.ceil(totalCredits * BATCH_DISCOUNT);
  const savings = totalCredits - discountedCredits;
  const hasEnough = userBalance >= discountedCredits;

  const handleRun = useCallback(async () => {
    if (selectedIds.size === 0 || !hasEnough) return;
    setRunning(true);
    try {
      await onRunBatch(Array.from(selectedIds));
      toast({ title: "Batch analysis queued", description: `${selectedIds.size} cases queued for processing.` });
      setSelectedIds(new Set());
    } catch (e: any) {
      toast({ title: "Batch failed", description: e.message, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  }, [selectedIds, hasEnough, onRunBatch, toast]);

  if (eligibleCases.length < 2) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Layers size={14} className="text-accent" />
            Batch Analysis
            <Badge className="text-[9px] h-4 bg-[hsl(var(--risk-green))]/10 text-[hsl(var(--risk-green))] border-[hsl(var(--risk-green))]/20">
              15% discount
            </Badge>
          </CardTitle>
          <Button variant="ghost" size="sm" className="text-[10px] h-6" onClick={selectAll}>
            Select All ({eligibleCases.length})
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="max-h-[200px] overflow-y-auto space-y-1 pr-1">
          {eligibleCases.map((c) => (
            <label key={c.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-border hover:bg-muted/30 cursor-pointer text-[11px]">
              <Checkbox
                checked={selectedIds.has(c.id)}
                onCheckedChange={() => toggleCase(c.id)}
              />
              <div className="flex-1 min-w-0">
                <span className="font-medium text-foreground">{c.case_reference}</span>
                <p className="text-[9px] text-muted-foreground truncate">{c.property_address}</p>
              </div>
              {c.risk_level && (
                <Badge variant="secondary" className="text-[8px] h-3.5">{c.risk_level}</Badge>
              )}
            </label>
          ))}
        </div>

        {/* Cost summary */}
        {selectedIds.size > 0 && (
          <div className="space-y-1 pt-2 border-t border-border">
            <div className="flex justify-between text-[10px]">
              <span className="text-muted-foreground">{selectedIds.size} cases × {creditsPerCase} credits</span>
              <span className="text-muted-foreground line-through">{totalCredits}</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="font-medium text-foreground">Batch price (15% off)</span>
              <span className="font-bold text-accent">{discountedCredits} credits</span>
            </div>
            <div className="flex justify-between text-[10px] text-[hsl(var(--risk-green))]">
              <span>You save</span>
              <span className="font-medium">{savings} credits</span>
            </div>
            {!hasEnough && (
              <div className="flex items-center gap-1 text-[10px] text-destructive">
                <AlertTriangle size={10} />
                <span>Insufficient credits ({userBalance} available)</span>
              </div>
            )}
          </div>
        )}

        <Button
          className="w-full gap-1.5 bg-accent text-accent-foreground hover:bg-accent/90"
          size="sm"
          disabled={selectedIds.size === 0 || running || !hasEnough}
          onClick={handleRun}
        >
          {running ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
          Run Batch Analysis ({selectedIds.size} case{selectedIds.size !== 1 ? "s" : ""})
        </Button>
      </CardContent>
    </Card>
  );
}
