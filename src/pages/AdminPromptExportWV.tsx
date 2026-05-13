import { useState, useRef } from "react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Download, Upload, FileJson, CheckCircle2, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const AGENT_IDS = ["source-of-wealth"] as const;

const AGENT_LABELS: Record<string, string> = {
  "source-of-wealth": "Olimey AI",
};

const STRIP_FIELDS_VERSIONS = [
  "id", "created_by", "approved_by", "created_at", "deployed_at", "approved_at", "patch_ids", "regression_results",
];
const STRIP_FIELDS_DEFAULTS = ["id", "created_at", "updated_at"];

interface ExportPayload {
  exportedAt: string;
  sourceProject: string;
  agents: string[];
  prompt_defaults: Record<string, unknown>[];
  prompt_versions: Record<string, unknown>[];
}

export default function AdminPromptExportWV() {
  const { user } = useAuth();
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState<ExportPayload | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    setExporting(true);
    try {
      const [defaultsRes, versionsRes] = await Promise.all([
        supabase.from("prompt_defaults").select("*").in("agent_id", [...AGENT_IDS]),
        supabase.from("prompt_versions").select("*").in("agent_id", [...AGENT_IDS]),
      ]);

      if (defaultsRes.error) throw defaultsRes.error;
      if (versionsRes.error) throw versionsRes.error;

      const payload: ExportPayload = {
        exportedAt: new Date().toISOString(),
        sourceProject: "Olimey AI",
        agents: [...AGENT_IDS],
        prompt_defaults: defaultsRes.data ?? [],
        prompt_versions: versionsRes.data ?? [],
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `wealthverify-prompts-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);

      toast({
        title: "Export complete",
        description: `${defaultsRes.data?.length ?? 0} defaults and ${versionsRes.data?.length ?? 0} versions exported.`,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Export failed";
      toast({ title: "Export error", description: message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string) as ExportPayload;
        if (!data.prompt_defaults || !data.prompt_versions) {
          throw new Error("Invalid export file — missing prompt_defaults or prompt_versions");
        }
        setPreview(data);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Invalid JSON";
        toast({ title: "Parse error", description: message, variant: "destructive" });
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleImport = async () => {
    if (!preview || !user) return;
    setImporting(true);
    try {
      const defaults = preview.prompt_defaults.map((row) => {
        const clean = { ...row };
        STRIP_FIELDS_DEFAULTS.forEach((f) => delete clean[f]);
        return clean;
      });

      const versions = preview.prompt_versions.map((row) => {
        const clean = { ...row };
        STRIP_FIELDS_VERSIONS.forEach((f) => delete clean[f]);
        clean.created_by = user.id;
        return clean;
      });

      const [dRes, vRes] = await Promise.all([
        defaults.length > 0
          ? supabase.from("prompt_defaults").upsert(defaults as never[], { onConflict: "agent_id" })
          : Promise.resolve({ error: null }),
        versions.length > 0
          ? supabase.from("prompt_versions").insert(versions as never[])
          : Promise.resolve({ error: null }),
      ]);

      if (dRes.error) throw dRes.error;
      if (vRes.error) throw vRes.error;

      toast({
        title: "Import complete",
        description: `${defaults.length} defaults and ${versions.length} versions imported.`,
      });
      setPreview(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Import failed";
      toast({ title: "Import error", description: message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  const agentCounts = preview
    ? [...new Set(preview.prompt_versions.map((v) => v.agent_id as string))]
    : [];

  return (
    <AppLayout>
      <div className="container mx-auto py-8 max-w-3xl space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Olimey AI Prompt Export / Import</h1>
        <p className="text-muted-foreground text-sm">
          Transfer Olimey AI (Source of Wealth) prompts between projects.
        </p>

        {/* Export */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Download className="h-5 w-5 text-primary" />
              Export Prompts
            </CardTitle>
            <CardDescription>
              Downloads all prompt defaults and versions for Olimey AI as a JSON file.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2 mb-4">
              {AGENT_IDS.map((id) => (
                <Badge key={id} variant="secondary">{AGENT_LABELS[id]}</Badge>
              ))}
            </div>
            <Button onClick={handleExport} disabled={exporting}>
              <FileJson className="mr-2 h-4 w-4" />
              {exporting ? "Exporting…" : "Export JSON"}
            </Button>
          </CardContent>
        </Card>

        {/* Import */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Upload className="h-5 w-5 text-primary" />
              Import Prompts
            </CardTitle>
            <CardDescription>
              Upload a previously exported JSON file to import Olimey AI prompts into this project.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <input
              ref={fileRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleFileSelect}
            />
            <Button variant="outline" onClick={() => fileRef.current?.click()}>
              Choose JSON file
            </Button>

            {preview && (
              <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  File parsed successfully
                </div>
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>Source: <span className="font-medium text-foreground">{preview.sourceProject}</span></p>
                  <p>Exported: {new Date(preview.exportedAt).toLocaleString()}</p>
                  <p>Defaults: {preview.prompt_defaults.length}</p>
                  <p>Versions: {preview.prompt_versions.length}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {agentCounts.map((id) => (
                    <Badge key={id} variant="outline">
                      {AGENT_LABELS[id] ?? id} — {preview.prompt_versions.filter((v) => v.agent_id === id).length} versions
                    </Badge>
                  ))}
                </div>

                {agentCounts.some((id) => !AGENT_IDS.includes(id as typeof AGENT_IDS[number])) && (
                  <div className="flex items-center gap-2 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4" />
                    File contains agents outside the Olimey AI scope — they will still be imported.
                  </div>
                )}

                <Button onClick={handleImport} disabled={importing}>
                  {importing ? "Importing…" : "Import into this project"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
