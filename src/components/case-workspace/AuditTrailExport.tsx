import { useState } from "react";
import { Download, FileSpreadsheet, Loader2, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface AuditTrailExportProps {
  caseId?: string;
  caseReference?: string;
}

export default function AuditTrailExport({ caseId, caseReference }: AuditTrailExportProps) {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [format, setFormat] = useState<"csv" | "json">("csv");
  const [scope, setScope] = useState<"case" | "user" | "firm">(caseId ? "case" : "user");
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    if (!user) return;
    setExporting(true);
    try {
      let query = supabase.from("audit_log").select("*").order("created_at", { ascending: false });

      if (scope === "case" && caseReference) {
        query = query.eq("case_reference", caseReference);
      } else if (scope === "user") {
        query = query.eq("user_id", user.id);
      }
      // "firm" = no additional filter, gets all accessible rows (RLS-limited)

      const { data, error } = await query.limit(1000);
      if (error) throw error;
      if (!data?.length) {
        toast({ title: "No records", description: "No audit log entries found for the selected scope." });
        setExporting(false);
        return;
      }

      let blob: Blob;
      let filename: string;
      const dateStr = new Date().toISOString().slice(0, 10);

      if (format === "csv") {
        const headers = ["Timestamp", "Event Type", "User", "Email", "Position", "Case Reference", "Details"];
        const rows = data.map((row: any) => [
          row.created_at,
          row.event_type,
          row.user_name,
          row.user_email,
          row.user_position,
          row.case_reference || "",
          JSON.stringify(row.metadata || {}),
        ]);
        const csvContent = [headers.join(","), ...rows.map((r: string[]) => r.map((c) => `"${(c || "").replace(/"/g, '""')}"`).join(","))].join("\n");
        blob = new Blob([csvContent], { type: "text/csv" });
        filename = `audit-trail-${scope}-${dateStr}.csv`;
      } else {
        blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        filename = `audit-trail-${scope}-${dateStr}.json`;
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      // Log export to audit
      await supabase.from("audit_log" as any).insert({
        user_id: user.id,
        user_name: profile?.full_name || "",
        user_email: profile?.email || "",
        user_position: profile?.position || "",
        event_type: "audit_trail_exported",
        case_reference: caseReference || null,
        metadata: { scope, format, record_count: data.length },
      });

      toast({ title: "Audit trail exported", description: `${data.length} records exported as ${format.toUpperCase()}.` });
    } catch (e: any) {
      toast({ title: "Export failed", description: e.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <FileSpreadsheet size={14} className="text-accent" />
          Audit Trail Export
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-medium text-muted-foreground mb-1 block">Scope</label>
            <Select value={scope} onValueChange={(v) => setScope(v as any)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {caseId && <SelectItem value="case">This case</SelectItem>}
                <SelectItem value="user">My activity</SelectItem>
                <SelectItem value="firm">Firm-wide</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] font-medium text-muted-foreground mb-1 block">Format</label>
            <Select value={format} onValueChange={(v) => setFormat(v as any)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="csv">
                  <span className="flex items-center gap-1.5"><FileSpreadsheet size={12} /> CSV</span>
                </SelectItem>
                <SelectItem value="json">
                  <span className="flex items-center gap-1.5"><FileText size={12} /> JSON</span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button
          size="sm"
          className="w-full gap-1.5"
          onClick={handleExport}
          disabled={exporting}
        >
          {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          Export Audit Trail
        </Button>
      </CardContent>
    </Card>
  );
}
