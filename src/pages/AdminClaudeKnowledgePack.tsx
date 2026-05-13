import { useEffect, useMemo, useState } from "react";
import JSZip from "jszip";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, Package, Clock, FileText, Database, FolderArchive, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

// Eagerly import every doc file as raw text so the pack ships with the bundle.
const docModules = import.meta.glob("/src/docs/claude-pack/**/*.{md,json}", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

interface PackFile {
  path: string;          // path inside the zip
  source: "Static" | "Live (DB)" | "Generated";
  sizeBytes: number;     // best-effort estimate before zipping
  liveSize?: boolean;    // true when actual size is only known at generation
  contentResolver: () => Promise<string>;
}

interface LastGenerationRow {
  id: string;
  generated_at: string;
  generated_by: string;
  file_count: number;
  total_bytes: number;
  generator_name?: string | null;
}

const STATIC_DOC_FILES: PackFile[] = Object.entries(docModules).map(([absPath, content]) => {
  const rel = absPath.replace("/src/docs/claude-pack/", "");
  return {
    path: `docs/${rel}`,
    source: "Static" as const,
    sizeBytes: new Blob([content]).size,
    contentResolver: async () => content,
  };
});

const README_CONTENT = `# Olimey AI Claude Knowledge Pack

This bundle is intended to be dragged into a Claude Project so Claude can help
maintain Olimey AI (the Olimey AI agent for UK conveyancing compliance).

## Contents

- **docs/** — AI-optimised documentation pack (architecture, workflows, schemas, prompts, business rules, state models, runbooks, known issues).
- **rules/** — Project memory rules and core engineering standards.
- **prompts/** — Snapshot of active prompt defaults from the live database.
- **README.md** — this file.
- **manifest.json** — machine-readable index of every file in the pack with sizes.

## How to use

1. Create or open a Claude Project.
2. Drag the entire unzipped folder into the project's "Project knowledge" area.
3. Reference files by their path (e.g. \`docs/02-architecture/ARCHITECTURE_OVERVIEW.md\`).

## Important

- All content is a snapshot at the time of export. Re-generate the pack when
  significant code, rules, or prompts change.
- This pack contains NO secrets, NO client data, and NO PII.
- Olimey AI rules apply: UK English, MLR 2017 / LSAG 2025 alignment, evidence-proportional language.
`;

const RULES_CONTENT = `# Olimey AI Rules & Standards

## Core project rules
- Olimey AI (Olimey AI): UK conveyancing compliance per MLR 2017 / LSAG 2025.
- Stack: React 18, Vite, Supabase (Auth/RLS/Edge), Deno, Vertex AI.
- Strict UK English only. TS strict mode. Commercially serious UI (no gimmicks).
- Auth: Use \`serviceClient.auth.getClaims(token)\`, NOT \`getUser(token)\`.
- Use n8n for non-core workflows; Supabase for core/RLS/Edge.

## Engineering discipline
- Build production-safe and anti-regression. Prefer the smallest safe fix.
- Compile success is not proof of working behaviour.
- Runtime-test user-facing, persistence, workflow, and integration changes.
- Be explicit about what was tested vs only code-inspected.
- Never weaken types, controls, auditability, or workflow integrity for speed.

## High-risk areas (extra caution)
authentication, permissions, tenant scoping, DB writes, audit logs, document
ingestion, OCR/extraction, SoF/SoW logic, lender consideration, MLRO escalation,
contradiction handling, evidence sufficiency, finalisation/consolidation,
background jobs, retries, task lifecycle, review workflow, governance/calibration,
explainability/provenance, resilience/rebuild, read models, shared layout,
admin tooling.

## Domain terms
- **source of funds** — where the transaction money comes from.
- **source of wealth** — how the client accumulated underlying wealth.
- **evidence sufficiency** — whether evidence proportionately supports a conclusion.
- **contradiction** — factual inconsistency between declaration / document / transaction / external signal.
- **lender consideration** — funding pattern may require lender notification.
- **MLRO consideration** — matter may require MLRO escalation.
- **decision log** — structured record of compliance conclusions and evidence relied on.
- **provenance** — explanation of why an output was reached.
- **readiness** — whether matter is ready for next operational step.
- **finalisation** — assembly of analysis outputs into final report bundle.

## Wording proportionality
- Avoid prosecutorial terms ("evasion", "concealment") unless evidence is direct and specific.
- Use evidence-proportional language: "unverified", "not yet evidenced", "requires clarification".
- Distinguish: confirmed fact / likely fact / missing evidence / issue to review / draft enquiry / supervisor review required.

## Output discipline
- All legal outputs are draft-only until approved by an authorised human.
- Honest degradation: explicit pending / running / blocked / partial / degraded / failed states.
- Never present blocked or partial output as successful.
- Demo data must be clearly labelled and never resemble live client data.
`;

const STATIC_EXTRA_FILES: PackFile[] = [
  {
    path: "README.md",
    source: "Static",
    sizeBytes: new Blob([README_CONTENT]).size,
    contentResolver: async () => README_CONTENT,
  },
  {
    path: "rules/lexverify-rules.md",
    source: "Static",
    sizeBytes: new Blob([RULES_CONTENT]).size,
    contentResolver: async () => RULES_CONTENT,
  },
];

// Live file: snapshot of prompt_defaults (resolved at generation time)
const LIVE_PROMPT_FILE: PackFile = {
  path: "prompts/active-prompts.json",
  source: "Live (DB)",
  sizeBytes: 0,
  liveSize: true,
  contentResolver: async () => {
    const { data, error } = await supabase
      .from("prompt_defaults")
      .select("agent_id, base_prompt_text, updated_at")
      .order("agent_id", { ascending: true });
    if (error) throw new Error(`prompt_defaults query failed: ${error.message}`);
    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        note: "Snapshot of public.prompt_defaults at export time. Live versions/overrides are stored separately in prompt_versions.",
        defaults: data ?? [],
      },
      null,
      2,
    );
  },
};

const ALL_FILES: PackFile[] = [
  ...STATIC_EXTRA_FILES,
  LIVE_PROMPT_FILE,
  ...STATIC_DOC_FILES.sort((a, b) => a.path.localeCompare(b.path)),
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function groupFiles(files: PackFile[]): Record<string, PackFile[]> {
  const groups: Record<string, PackFile[]> = {};
  for (const f of files) {
    const parts = f.path.split("/");
    const folder = parts.length > 1 ? parts.slice(0, -1).join("/") + "/" : "(root)";
    if (!groups[folder]) groups[folder] = [];
    groups[folder].push(f);
  }
  return groups;
}

export default function AdminClaudeKnowledgePack() {
  const { user } = useAuth();
  const [generating, setGenerating] = useState(false);
  const [lastGen, setLastGen] = useState<LastGenerationRow | null>(null);
  const [loadingLast, setLoadingLast] = useState(true);

  const totalKnownBytes = useMemo(
    () => ALL_FILES.reduce((sum, f) => sum + (f.liveSize ? 0 : f.sizeBytes), 0),
    [],
  );
  const grouped = useMemo(() => groupFiles(ALL_FILES), []);

  const fetchLast = async () => {
    setLoadingLast(true);
    const { data, error } = await supabase
      .from("claude_pack_generations")
      .select("id, generated_at, generated_by, file_count, total_bytes")
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn("Failed to load last generation", error);
      setLastGen(null);
    } else if (data) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("user_id", data.generated_by)
        .maybeSingle();
      setLastGen({
        ...data,
        generator_name: profile?.full_name || profile?.email || "Unknown",
      });
    } else {
      setLastGen(null);
    }
    setLoadingLast(false);
  };

  useEffect(() => {
    fetchLast();
  }, []);

  const handleGenerate = async () => {
    if (!user) return;
    setGenerating(true);
    try {
      const zip = new JSZip();
      const manifestEntries: Array<{ path: string; bytes: number; source: string }> = [];

      for (const file of ALL_FILES) {
        const content = await file.contentResolver();
        zip.file(file.path, content);
        manifestEntries.push({
          path: file.path,
          bytes: new Blob([content]).size,
          source: file.source,
        });
      }

      const manifest = {
        generatedAt: new Date().toISOString(),
        project: "Olimey AI",
        fileCount: manifestEntries.length,
        totalBytes: manifestEntries.reduce((s, e) => s + e.bytes, 0),
        files: manifestEntries,
      };
      zip.file("manifest.json", JSON.stringify(manifest, null, 2));

      const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `lexverify-claude-pack-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);

      // Audit row
      const { error: insErr } = await supabase.from("claude_pack_generations").insert({
        generated_by: user.id,
        file_count: manifest.fileCount + 1, // +1 for manifest.json
        total_bytes: blob.size,
        manifest: manifest as never,
      });
      if (insErr) console.warn("Audit insert failed", insErr);

      toast({
        title: "Pack generated",
        description: `${manifest.fileCount + 1} files, ${formatBytes(blob.size)} downloaded.`,
      });

      fetchLast();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Claude pack generation failed", err);
      toast({ title: "Generation error", description: message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <AppLayout>
      <div className="container mx-auto py-8 max-w-4xl space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-foreground">Claude Knowledge Pack</h1>
          <p className="text-sm text-muted-foreground">
            One-click export of project documentation, rules, prompts, and architecture notes for use in a Claude Project.
          </p>
        </div>

        {/* Action card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Package className="h-5 w-5 text-primary" />
              Generate &amp; Download
            </CardTitle>
            <CardDescription>
              Bundles the latest static docs and a live snapshot of active prompts into a single zip.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleGenerate} disabled={generating}>
              <Download className="mr-2 h-4 w-4" />
              {generating ? "Generating…" : "Generate & Download zip"}
            </Button>
          </CardContent>
        </Card>

        {/* Last generated card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Clock className="h-5 w-5 text-primary" />
              Last generated
            </CardTitle>
            <CardDescription>Most recent successful pack download by any admin.</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingLast ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : lastGen ? (
              <div className="space-y-1 text-sm">
                <p className="text-foreground font-medium">
                  {new Date(lastGen.generated_at).toLocaleString("en-GB", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                  <span className="text-muted-foreground font-normal"> · {lastGen.generator_name}</span>
                </p>
                <p className="text-muted-foreground">
                  {lastGen.file_count} files · {formatBytes(lastGen.total_bytes)}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={fetchLast}
                  className="h-7 px-2 text-xs mt-1"
                >
                  <RefreshCw className="h-3 w-3 mr-1" /> Refresh
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No pack has been generated yet. Click <span className="font-medium text-foreground">Generate &amp; Download</span> to create the first one.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Pack contents preview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <FolderArchive className="h-5 w-5 text-primary" />
              Pack contents preview
            </CardTitle>
            <CardDescription>
              Exact list of files that will be included in the next download.
            </CardDescription>
            <div className="flex flex-wrap gap-2 pt-2">
              <Badge variant="secondary">
                <FileText className="h-3 w-3 mr-1" /> {ALL_FILES.length + 1} files
              </Badge>
              <Badge variant="secondary">
                ~{formatBytes(totalKnownBytes)} (pre-zip, excluding live data)
              </Badge>
              <Badge variant="outline">
                <Database className="h-3 w-3 mr-1" /> 1 live snapshot
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[55%]">File</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-right">Size</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(grouped).flatMap(([folder, files]) => [
                    <TableRow key={`folder-${folder}`} className="bg-muted/40 hover:bg-muted/40">
                      <TableCell colSpan={3} className="font-mono text-xs text-muted-foreground py-1.5">
                        {folder}
                      </TableCell>
                    </TableRow>,
                    ...files.map((f) => {
                      const fileName = f.path.split("/").pop();
                      return (
                        <TableRow key={f.path}>
                          <TableCell className="font-mono text-xs">{fileName}</TableCell>
                          <TableCell>
                            <Badge
                              variant={f.source === "Live (DB)" ? "default" : "secondary"}
                              className="text-[10px] font-normal"
                            >
                              {f.source}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground">
                            {f.liveSize ? "computed at generation" : formatBytes(f.sizeBytes)}
                          </TableCell>
                        </TableRow>
                      );
                    }),
                  ])}
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableCell colSpan={3} className="font-mono text-xs text-muted-foreground py-1.5">
                      (root)
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-mono text-xs">manifest.json</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] font-normal">Generated</Badge>
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      computed at generation
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
