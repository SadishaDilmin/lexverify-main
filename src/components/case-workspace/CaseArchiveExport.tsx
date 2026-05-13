import { useState } from "react";
import { Archive, Download, Loader2, FileDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface CaseArchiveExportProps {
  caseId: string;
  caseReference: string;
  caseData: any;
}

export default function CaseArchiveExport({ caseId, caseReference, caseData }: CaseArchiveExportProps) {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    if (!user) return;
    setExporting(true);
    try {
      // Fetch all related data
      const [docsRes, partiesRes, reportsRes, auditRes, notesRes, feedbackRes] = await Promise.all([
        supabase.from("documents").select("*").eq("case_id", caseId),
        supabase.from("case_parties").select("*").eq("case_id", caseId),
        supabase.from("ai_reports").select("*").eq("case_id", caseId).order("created_at", { ascending: false }),
        supabase.from("audit_log").select("*").eq("case_reference", caseReference).order("created_at", { ascending: false }),
        supabase.from("case_notes").select("*").eq("case_id", caseId).order("created_at", { ascending: true }),
        supabase.from("agent_feedback").select("*").eq("case_id", caseId).order("created_at", { ascending: false }),
      ]);

      const archiveBundle = {
        exported_at: new Date().toISOString(),
        exported_by: profile?.full_name || user.email,
        case: {
          ...caseData,
          id: caseId,
          reference: caseReference,
        },
        documents: docsRes.data || [],
        parties: partiesRes.data || [],
        ai_reports: reportsRes.data || [],
        audit_log: auditRes.data || [],
        notes: notesRes.data || [],
        feedback: feedbackRes.data || [],
        summary: {
          document_count: (docsRes.data || []).length,
          party_count: (partiesRes.data || []).length,
          report_count: (reportsRes.data || []).length,
          audit_entries: (auditRes.data || []).length,
        },
      };

      const blob = new Blob([JSON.stringify(archiveBundle, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `case-archive-${caseReference}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);

      // Log
      await supabase.from("audit_log" as any).insert({
        case_reference: caseReference,
        user_id: user.id,
        user_name: profile?.full_name || "",
        user_email: profile?.email || "",
        user_position: profile?.position || "",
        event_type: "case_archive_exported",
        metadata: { document_count: archiveBundle.summary.document_count },
      });

      toast({ title: "Case archived", description: `Full case bundle exported with ${archiveBundle.summary.document_count} documents and ${archiveBundle.summary.audit_entries} audit entries.` });
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
          <Archive size={14} className="text-accent" />
          Case Archive & Export
          {caseData.status === "completed" && (
            <Badge className="text-[9px] h-4 bg-[hsl(var(--risk-green))]/10 text-[hsl(var(--risk-green))] border-[hsl(var(--risk-green))]/20">
              Completed
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-muted-foreground">
          Export the complete case bundle including all reports, audit logs, parties, and document metadata for offline archiving or regulatory compliance.
        </p>
        <Button
          size="sm"
          className="w-full gap-1.5"
          variant="outline"
          onClick={handleExport}
          disabled={exporting}
        >
          {exporting ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
          Export Full Case Bundle
        </Button>
      </CardContent>
    </Card>
  );
}
