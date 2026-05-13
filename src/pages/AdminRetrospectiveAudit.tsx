import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Scale, Search, Loader2, AlertTriangle, CheckCircle2, FileText,
  Download, ExternalLink, Shield, Clock, FileJson,
} from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

export default function AdminRetrospectiveAudit() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<any>(null);
  const [bulkPreparing, setBulkPreparing] = useState(false);

  // Fetch findings
  const { data: findings = [], isLoading } = useQuery({
    queryKey: ["regulatory-audit-findings"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("regulatory_audit_findings")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const unfiledFindings = findings.filter((f: any) => !f.hmlr_filed);
  const filedFindings = findings.filter((f: any) => f.hmlr_filed);

  // Run audit scan
  const runScan = useCallback(async () => {
    setScanning(true);
    setScanResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("regulatory-audit-worker");
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setScanResult(data);
      queryClient.invalidateQueries({ queryKey: ["regulatory-audit-findings"] });
      toast({ title: "Audit complete", description: `Found ${data.findings} documents matching HMLR criteria.` });
    } catch (e: any) {
      toast({ title: "Audit failed", description: e.message, variant: "destructive" });
    } finally {
      setScanning(false);
    }
  }, [queryClient, toast]);

  // Bulk prepare disclosure
  const bulkPrepare = useCallback(async () => {
    if (unfiledFindings.length === 0) return;
    setBulkPreparing(true);
    try {
      const disclosures = unfiledFindings.map((f: any) => ({
        file_path: f.file_path,
        bucket: f.bucket,
        agreement_type: f.agreement_type,
        detected_date: f.detected_date,
        case_reference: f.case_reference,
        disclosure_data: {
          grantee_id: "TO_BE_CONFIRMED",
          agreement_type: f.agreement_type?.replace(/_/g, " "),
          start_date: f.detected_date || "UNKNOWN",
          end_date: null,
          title_number: "TO_BE_CONFIRMED",
          land_extent: "See attached document",
          extension_rights: "TO_BE_CONFIRMED",
          sra_clc_number: "SRA_NUMBER_PLACEHOLDER",
          generated_at: new Date().toISOString(),
        },
      }));

      // Update all unfiled findings with disclosure data
      for (const d of disclosures) {
        await (supabase as any)
          .from("regulatory_audit_findings")
          .update({
            hmlr_filed: false, // Still not filed, just prepared
            disclosure_data: d.disclosure_data,
            updated_at: new Date().toISOString(),
          })
          .eq("file_path", d.file_path)
          .eq("bucket", d.bucket);
      }

      queryClient.invalidateQueries({ queryKey: ["regulatory-audit-findings"] });
      toast({
        title: "Disclosure data prepared",
        description: `${disclosures.length} HMLR disclosure packages generated. Review and confirm before filing.`,
      });
    } catch (e: any) {
      toast({ title: "Preparation failed", description: e.message, variant: "destructive" });
    } finally {
      setBulkPreparing(false);
    }
  }, [unfiledFindings, queryClient, toast]);

  // Export findings as JSON
  const exportFindings = useCallback(() => {
    const exportData = {
      exported_at: new Date().toISOString(),
      regulation: "HMLR March 2026 Contractual Control Regulations",
      total_findings: findings.length,
      unfiled: unfiledFindings.length,
      filed: filedFindings.length,
      findings: findings.map((f: any) => ({
        file_name: f.file_name,
        agreement_type: f.agreement_type,
        detected_date: f.detected_date,
        case_reference: f.case_reference,
        hmlr_filed: f.hmlr_filed,
        disclosure_data: f.disclosure_data,
        snippet: f.snippet?.slice(0, 200),
      })),
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hmlr-retrospective-audit-${format(new Date(), "yyyy-MM-dd")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [findings, unfiledFindings, filedFindings]);

  const agreementLabel = (type: string) => {
    const map: Record<string, string> = {
      option_agreement: "Option Agreement",
      pre_emption: "Pre-emption Right",
      promotion_agreement: "Promotion Agreement",
      overage_agreement: "Overage Agreement",
      clawback_agreement: "Clawback Agreement",
      semantic_match: "Semantic Match",
      unknown: "Unclassified",
    };
    return map[type] || type;
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Scale className="h-7 w-7 text-primary" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Retrospective Regulatory Audit</h1>
              <p className="text-sm text-muted-foreground">
                HMLR March 2026 Contractual Control Regulations — Back-Catalog Compliance Scan
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={exportFindings} disabled={findings.length === 0}>
              <FileJson className="h-4 w-4 mr-2" /> Export Findings
            </Button>
            <Button onClick={runScan} disabled={scanning}>
              {scanning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
              {scanning ? "Scanning…" : "Run Audit Scan"}
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid sm:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <FileText className="h-8 w-8 text-primary" />
                <div>
                  <p className="text-2xl font-bold">{findings.length}</p>
                  <p className="text-xs text-muted-foreground">Total Findings</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-8 w-8 text-destructive" />
                <div>
                  <p className="text-2xl font-bold">{unfiledFindings.length}</p>
                  <p className="text-xs text-muted-foreground">Unfiled with HMLR</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-8 w-8 text-primary" />
                <div>
                  <p className="text-2xl font-bold">{filedFindings.length}</p>
                  <p className="text-xs text-muted-foreground">Filed / Disclosed</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Shield className="h-8 w-8 text-accent" />
                <div>
                  <p className="text-2xl font-bold">
                    {findings.length > 0 ? `${Math.round((filedFindings.length / findings.length) * 100)}%` : "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">Coverage Rate</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Scan result feedback */}
        {scanResult && (
          <Card className="border-accent/30 bg-accent/5">
            <CardContent className="pt-6">
              <p className="text-sm font-medium">Last Scan Results</p>
              <p className="text-xs text-muted-foreground mt-1">
                Scanned {scanResult.total_scanned} documents · Found {scanResult.findings} matches
              </p>
              <div className="flex flex-wrap gap-2 mt-2">
                {Object.entries(scanResult.agreement_types || {}).map(([type, count]) => (
                  <Badge key={type} variant="outline" className="text-xs">
                    {agreementLabel(type)}: {count as number}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Bulk Prepare */}
        {unfiledFindings.length > 0 && (
          <Card className="border-destructive/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Action Required: {unfiledFindings.length} Document(s) May Require HMLR Disclosure
              </CardTitle>
              <CardDescription>
                These historical documents contain contractual control provisions that may need to be disclosed under the March 2026 HMLR regulations.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={bulkPrepare} disabled={bulkPreparing} variant="destructive">
                {bulkPreparing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                {bulkPreparing ? "Preparing…" : `Bulk Prepare Disclosure (${unfiledFindings.length} documents)`}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Findings Table */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Audit Findings</CardTitle>
            <CardDescription>All documents matching HMLR Contractual Control criteria</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="animate-spin text-muted-foreground" />
              </div>
            ) : findings.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No findings yet. Run an audit scan to identify historical contractual control documents.
              </p>
            ) : (
              <ScrollArea className="max-h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Document</TableHead>
                      <TableHead>Agreement Type</TableHead>
                      <TableHead>Case Ref</TableHead>
                      <TableHead>Detected Date</TableHead>
                      <TableHead className="text-center">Filed</TableHead>
                      <TableHead className="text-center">Disclosure</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {findings.map((f: any) => (
                      <TableRow key={f.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="text-xs font-medium truncate max-w-[200px]">{f.file_name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs capitalize">
                            {agreementLabel(f.agreement_type)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs font-mono">
                          {f.case_reference || "—"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {f.detected_date ? format(new Date(f.detected_date), "dd MMM yyyy") : (
                            <span className="text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" /> Unknown
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {f.hmlr_filed ? (
                            <CheckCircle2 className="h-4 w-4 text-primary mx-auto" />
                          ) : (
                            <AlertTriangle className="h-4 w-4 text-destructive mx-auto" />
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {f.disclosure_data ? (
                            <Badge variant="secondary" className="text-[10px]">Prepared</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
