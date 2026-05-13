import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, CheckCircle2, Route, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface FailureLog {
  id: string;
  failure_type: string;
  detected_issue: string;
  is_resolved: boolean;
  created_at: string;
  document_id: string;
  case_id: string;
}

const FAILURE_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  low_confidence: { label: "Low Confidence", color: "hsl(var(--risk-amber))" },
  engine_mismatch: { label: "Engine Mismatch", color: "hsl(var(--risk-red))" },
  layout_break: { label: "Layout Break", color: "hsl(var(--destructive))" },
};

const FailureTriageView = () => {
  const queryClient = useQueryClient();
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [forceRouteEngine, setForceRouteEngine] = useState<Record<string, string>>({});

  const { data: failures = [], isLoading } = useQuery({
    queryKey: ["extraction_failure_logs_unresolved"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("extraction_failure_logs")
        .select("*")
        .eq("is_resolved", false)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as FailureLog[];
    },
  });

  const handleResolve = async (id: string) => {
    setResolvingId(id);
    try {
      const { error } = await supabase
        .from("extraction_failure_logs")
        .update({ is_resolved: true, resolved_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["extraction_failure_logs_unresolved"] });
      toast.success("Failure marked as resolved");
    } catch (err) {
      toast.error("Failed to resolve", { description: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setResolvingId(null);
    }
  };

  const handleForceRoute = async (failureType: string) => {
    const engine = forceRouteEngine[failureType];
    if (!engine) {
      toast.error("Select an engine first");
      return;
    }
    try {
      const { error } = await supabase
        .from("confidence_suppressions")
        .upsert(
          {
            document_type: failureType,
            ocr_engine: engine,
            suppression_factor: 0.50,
            reason: `Force-routed by admin to engine: ${engine}`,
            is_active: true,
          },
          { onConflict: "document_type,ocr_engine" }
        );
      if (error) throw error;
      toast.success(`Force-routed '${failureType}' → ${engine}`);
    } catch (err) {
      toast.error("Failed to force route", { description: err instanceof Error ? err.message : "Unknown error" });
    }
  };

  const failuresByType = failures.reduce<Record<string, number>>((acc, f) => {
    acc[f.failure_type] = (acc[f.failure_type] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Object.entries(FAILURE_TYPE_LABELS).map(([type, { label, color }]) => (
          <Card key={type} className="border-l-4" style={{ borderLeftColor: color }}>
            <CardContent className="flex items-center justify-between py-4">
              <div>
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="text-2xl font-bold text-foreground">{failuresByType[type] || 0}</p>
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={forceRouteEngine[type] || ""}
                  onValueChange={(v) => setForceRouteEngine((prev) => ({ ...prev, [type]: v }))}
                >
                  <SelectTrigger className="w-32 h-8 text-xs">
                    <SelectValue placeholder="Engine…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gemini-vision">Gemini Vision</SelectItem>
                    <SelectItem value="gpt-vision">GPT Vision</SelectItem>
                    <SelectItem value="tesseract">Tesseract</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  onClick={() => handleForceRoute(type)}
                  disabled={!forceRouteEngine[type]}
                >
                  <Route className="h-3 w-3 mr-1" />
                  Force
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-[hsl(var(--risk-amber))]" />
            Unresolved Extraction Failures
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : failures.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-[hsl(var(--risk-green))]" />
              <p className="font-medium">All failures resolved</p>
              <p className="text-xs">No unresolved extraction issues detected.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-40">Type</TableHead>
                    <TableHead>Detected Issue</TableHead>
                    <TableHead className="w-44">Date</TableHead>
                    <TableHead className="w-28 text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {failures.map((f) => {
                    const meta = FAILURE_TYPE_LABELS[f.failure_type] || { label: f.failure_type, color: "hsl(var(--muted-foreground))" };
                    return (
                      <TableRow key={f.id}>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className="text-xs"
                            style={{ borderColor: meta.color, color: meta.color }}
                          >
                            {meta.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm max-w-md truncate">
                          {f.detected_issue || "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(f.created_at).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs"
                            onClick={() => handleResolve(f.id)}
                            disabled={resolvingId === f.id}
                          >
                            {resolvingId === f.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <>
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Resolve
                              </>
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default FailureTriageView;
