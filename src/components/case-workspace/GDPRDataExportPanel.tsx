import { useState } from "react";
import { Download, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

export default function GDPRDataExportPanel() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleExport = async () => {
    if (!user) return;
    setExporting(true);
    try {
      // Gather all user data
      const [profileRes, casesRes, auditRes, creditsRes, feedbackRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("user_id", user.id).single(),
        supabase.from("cases").select("*").eq("conveyancer_id", user.id),
        supabase.from("audit_log").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(500),
        supabase.from("credit_transactions").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(500),
        supabase.from("agent_feedback").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(200),
      ]);

      const exportData = {
        exported_at: new Date().toISOString(),
        subject: "Personal Data Export (GDPR Article 15)",
        profile: profileRes.data,
        cases: casesRes.data || [],
        audit_log: auditRes.data || [],
        credit_transactions: creditsRes.data || [],
        feedback: feedbackRes.data || [],
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `olimey-data-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);

      // Log the export
      await supabase.from("audit_log" as any).insert({
        user_id: user.id,
        user_name: profile?.full_name || "",
        user_email: profile?.email || user.email || "",
        user_position: profile?.position || "",
        event_type: "gdpr_data_export",
        metadata: { tables_exported: ["profiles", "cases", "audit_log", "credit_transactions", "agent_feedback"] },
      });

      toast({ title: "Data exported", description: "Your personal data has been downloaded as JSON." });
    } catch (e: any) {
      toast({ title: "Export failed", description: e.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const handleDeletionRequest = async () => {
    if (!user || !profile) return;
    setDeleting(true);
    try {
      // Log the deletion request (actual deletion handled by admin)
      await supabase.from("audit_log" as any).insert({
        user_id: user.id,
        user_name: profile.full_name || "",
        user_email: profile.email || user.email || "",
        user_position: profile.position || "",
        event_type: "gdpr_deletion_request",
        metadata: { requested_at: new Date().toISOString() },
      });

      // Create admin notification
      await supabase.from("admin_notifications").insert({
        user_id: user.id,
        event_type: "gdpr_deletion_request",
        title: "GDPR Deletion Request",
        message: `${profile.full_name} (${profile.email}) has requested deletion of their personal data under GDPR Article 17.`,
        metadata: { user_email: profile.email, user_name: profile.full_name },
      });

      toast({ title: "Deletion request submitted", description: "Your request has been logged. An administrator will process it within 30 days as required by GDPR." });
      setShowDeleteConfirm(false);
    } catch (e: any) {
      toast({ title: "Request failed", description: e.message, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck size={16} className="text-accent" />
          Data Privacy (GDPR)
          <Badge variant="secondary" className="text-[9px] h-4">Art. 15 & 17</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Export all your personal data or request account deletion in compliance with the UK GDPR and Data Protection Act 2018.
        </p>

        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 flex-1"
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Export My Data
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 flex-1 text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/5"
            onClick={() => setShowDeleteConfirm(true)}
          >
            <Trash2 size={14} />
            Request Deletion
          </Button>
        </div>

        <p className="text-[10px] text-muted-foreground">
          Audit trails are retained for 15 years per SRA requirements. Deletion requests exclude legally mandated retention.
        </p>
      </CardContent>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 size={16} />
              Request Account Deletion
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>This will submit a formal deletion request under GDPR Article 17 ("Right to Erasure").</p>
                <p className="font-medium text-foreground">What will be deleted:</p>
                <ul className="list-disc list-inside text-xs space-y-1">
                  <li>Your profile and personal information</li>
                  <li>Case data you created (after legal retention period)</li>
                  <li>Credit balance and transaction history</li>
                </ul>
                <p className="font-medium text-foreground">What will be retained (legal obligation):</p>
                <ul className="list-disc list-inside text-xs space-y-1">
                  <li>Audit logs (SRA: 15 years)</li>
                  <li>Compliance records and AI oversight decisions</li>
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeletionRequest}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Submitting…" : "Submit Deletion Request"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
