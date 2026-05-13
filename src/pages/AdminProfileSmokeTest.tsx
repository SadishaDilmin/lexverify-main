/**
 * Admin: Personal Profile (Section 5C) — Smoke Test
 *
 * Runs the full Section 5C pipeline against a chosen existing case without
 * re-running the full SoW analysis. Surfaces three artefacts side-by-side
 * so spec parity can be confirmed in one click:
 *
 *   1. Deterministic 8-row table (buildPersonalProfileSection)
 *   2. Persisted enrichment rows  (external_profile_checks / _signals)
 *   3. Validator finding          (sow-section-validator)
 *
 * Read-only with respect to the case's saved report. Diagnostic rows are
 * written under a namespaced ai_run_id ("smoke-<ts>") so they never
 * collide with live SoW run rows, and a one-click cleanup is provided.
 */

import { useEffect, useMemo, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  Play, Trash2, CheckCircle2, AlertTriangle, Copy, Loader2,
  FileText, Database, Shield, ListChecks,
} from "lucide-react";
import {
  buildPersonalProfileSection,
  type CompaniesHouseResultPerson,
  type FcaResultFirm,
  type OfsiResultParty,
  type ProfileResultPerson,
  type FatfData,
  type PersonInputForProfile,
} from "@/lib/sow/personalProfileBuilder";
import { persistEnrichmentForCase } from "@/lib/sow/persistEnrichment";
import { validateMandatorySections, type SectionFinding } from "@/lib/sowSectionValidator";
import { evaluatePersonalProfileCoverage } from "../../supabase/functions/_shared/personalProfileCoverage";

// ── Types ────────────────────────────────────────────────────────────────

interface CaseOption {
  id: string;
  case_reference: string;
  property_address: string;
}

interface PartyRow {
  id: string;
  full_name: string;
  role: "purchaser" | "seller" | "giftor";
}

interface DocumentRow {
  id: string;
  file_name: string;
}

interface PersistedCheckRow {
  id: string;
  party_name: string;
  overall_outcome: string;
  overall_summary: string;
  requires_review: boolean;
  has_discrepancy: boolean;
  no_signal_ratio: number;
  checks: unknown;
  signals?: PersistedSignalRow[];
}

interface PersistedSignalRow {
  id: string;
  source_type: string;
  source_name: string;
  source_url: string | null;
  summary: string;
  requires_review: boolean;
}

interface RunArtefacts {
  aiRunId: string;
  expectedPersons: string[];
  builderMarkdown: string;
  builderInputs: {
    persons: PersonInputForProfile[];
    profileHits: number;
    chHits: number;
    ofsiHits: number;
    fcaHits: number;
    fatfAvailable: boolean;
  };
  persisted: PersistedCheckRow[];
  validatorFindings: SectionFinding[];
  validatorPassed: boolean;
  coverageLocal: ReturnType<typeof evaluatePersonalProfileCoverage>;
}

// ── ID-document heuristic (mirrors useSoWSubmit.ts) ─────────────────────

const ID_DOC_PATTERN = /passport|driving[_\s-]*licen|photo[_\s-]*id|national[_\s-]*id|biometric|liveness|id[_\s-]*check|id[_\s-]*verif|thirdfort|infotrak/i;

// ── Page ────────────────────────────────────────────────────────────────

export default function AdminProfileSmokeTest() {
  const [cases, setCases] = useState<CaseOption[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string>("");
  const [loadingCases, setLoadingCases] = useState(true);
  const [parties, setParties] = useState<PartyRow[]>([]);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [propertyAddress, setPropertyAddress] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState<string>("");
  const [artefacts, setArtefacts] = useState<RunArtefacts | null>(null);
  const [cleaning, setCleaning] = useState(false);

  // Load admin's accessible cases
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingCases(true);
      const { data, error } = await supabase
        .from("cases")
        .select("id, case_reference, property_address")
        .order("created_at", { ascending: false })
        .limit(200);
      if (cancelled) return;
      if (error) {
        toast.error("Could not load cases");
      } else {
        setCases(data ?? []);
      }
      setLoadingCases(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load parties + docs whenever a case is selected
  useEffect(() => {
    if (!selectedCaseId) {
      setParties([]);
      setDocuments([]);
      setPropertyAddress("");
      setArtefacts(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const [partiesRes, docsRes, caseRes] = await Promise.all([
        supabase
          .from("case_parties")
          .select("id, full_name, role")
          .eq("case_id", selectedCaseId),
        supabase
          .from("documents")
          .select("id, file_name")
          .eq("case_id", selectedCaseId)
          .limit(500),
        supabase.from("cases").select("property_address").eq("id", selectedCaseId).maybeSingle(),
      ]);
      if (cancelled) return;
      setParties(((partiesRes.data ?? []) as PartyRow[]).filter((p) => p.role !== "seller"));
      setDocuments((docsRes.data ?? []) as DocumentRow[]);
      setPropertyAddress(caseRes.data?.property_address ?? "");
      setArtefacts(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedCaseId]);

  // Derived: persons we'd render Section 5C for
  const expectedPersons = useMemo(
    () => parties.filter((p) => p.full_name.trim()).map((p) => p.full_name.trim()),
    [parties],
  );

  const idDocCount = useMemo(
    () => documents.filter((d) => ID_DOC_PATTERN.test(d.file_name)).length,
    [documents],
  );

  // ── Run pipeline ──────────────────────────────────────────────────────

  const handleRun = async () => {
    if (!selectedCaseId) return;
    if (expectedPersons.length === 0) {
      toast.error("This case has no purchaser or giftor parties to profile.");
      return;
    }
    setRunning(true);
    setArtefacts(null);
    const aiRunId = `smoke-${Date.now()}`;

    try {
      // 1) Build inputs for enrichment (mirrors useSoWSubmit, simplified)
      setStage("Preparing person and firm inputs…");
      const profilePersons = parties.map((p) => ({
        fullName: p.full_name,
        location: propertyAddress,
      }));
      const chPersons = parties.map((p) => ({ fullName: p.full_name }));
      const ofsiParties = parties.map((p) => ({ full_name: p.full_name, role: p.role }));
      const fcaFirms: Array<{ name: string }> = []; // smoke test does not collect employers

      // 2) Run enrichment in parallel
      setStage("Calling profile-intelligence, Companies House, OFSI, FCA, FATF…");
      const [profileResp, chResp, ofsiResp, fcaResp, fatfResp] = await Promise.all([
        supabase.functions.invoke("profile-intelligence", {
          body: { persons: profilePersons, propertyAddress },
        }).then(r => ({ data: r.data, error: r.error })).catch((e) => ({ data: null, error: e })),
        supabase.functions.invoke("companies-house-lookup", {
          body: { persons: chPersons },
        }).then(r => ({ data: r.data, error: r.error })).catch((e) => ({ data: null, error: e })),
        supabase.functions.invoke("ofsi-sanctions-check", {
          body: { parties: ofsiParties, threshold: 0.78 },
        }).then(r => ({ data: r.data, error: r.error })).catch((e) => ({ data: null, error: e })),
        fcaFirms.length > 0
          ? supabase.functions.invoke("fca-register-check", { body: { firms: fcaFirms } })
              .then(r => ({ data: r.data, error: r.error })).catch((e) => ({ data: null, error: e }))
          : Promise.resolve({ data: null, error: null }),
        supabase.functions.invoke("fatf-jurisdiction-check", {
          body: { jurisdictions: [] },
        }).then(r => ({ data: r.data, error: r.error })).catch((e) => ({ data: null, error: e })),
      ]);

      const profileResult = (profileResp.data ?? null) as { profiles?: ProfileResultPerson[] } | null;
      const chResult = (chResp.data ?? null) as { results?: CompaniesHouseResultPerson[] } | null;
      const ofsiResult = (ofsiResp.data ?? null) as { results?: OfsiResultParty[] } | null;
      const fcaResult = (fcaResp.data ?? null) as { results?: FcaResultFirm[] } | null;
      const fatfData = (fatfResp.data ?? null) as FatfData | null;

      // 3) Build deterministic table
      setStage("Building deterministic Section 5C table…");
      const personsForBuilder: PersonInputForProfile[] = parties.map((p) => ({
        fullName: p.full_name,
        jurisdictions: [],
        hasIdDocument: documents.some((d) => ID_DOC_PATTERN.test(d.file_name)),
        // ID-doc heuristic is case-wide because docs aren't bound to parties at this layer.
      }));
      const builderMarkdown = buildPersonalProfileSection({
        persons: personsForBuilder,
        profileResult,
        chResult,
        ofsiResult,
        fcaResult,
        fatfData,
      });

      // 4) Persist diagnostic rows under namespaced ai_run_id
      setStage("Persisting diagnostic enrichment rows…");
      const persistResult = await persistEnrichmentForCase({
        caseId: selectedCaseId,
        aiRunId,
        persons: parties.map((p) => ({ id: p.id, fullName: p.full_name })),
        profileResult,
        chResult,
        ofsiResult,
        fcaResult,
      });
      if (persistResult.errors.length > 0) {
        toast.warning(`Persistence had ${persistResult.errors.length} issue(s) — see console.`);
      }

      // 5) Read back what we wrote
      const { data: checks } = await supabase
        .from("external_profile_checks")
        .select("id, party_name, overall_outcome, overall_summary, requires_review, has_discrepancy, no_signal_ratio, checks")
        .eq("case_id", selectedCaseId)
        .eq("ai_run_id", aiRunId);
      const checkIds = (checks ?? []).map((c) => c.id);
      const { data: signals } = checkIds.length
        ? await supabase
            .from("external_profile_signals")
            .select("id, profile_check_id, source_type, source_name, source_url, summary, requires_review")
            .in("profile_check_id", checkIds)
        : { data: [] as Array<{ id: string; profile_check_id: string; source_type: string; source_name: string; source_url: string | null; summary: string; requires_review: boolean }> };

      const persisted: PersistedCheckRow[] = (checks ?? []).map((c) => ({
        ...c,
        signals: (signals ?? []).filter((s) => s.profile_check_id === c.id),
      }));

      // 6) Run validator against just the deterministic Section 5C output.
      //    aiReportId is intentionally undefined → validator does NOT persist.
      setStage("Calling sow-section-validator…");
      const validation = await validateMandatorySections(
        builderMarkdown,
        documents.map((d) => d.file_name),
        undefined,
        expectedPersons,
      );
      const profileFindings = validation.omissions.filter(
        (f) => f.section_id === "personal_profile_section_5c",
      );

      // 7) Local coverage check (so we can spot validator drift)
      const coverageLocal = evaluatePersonalProfileCoverage(builderMarkdown, expectedPersons);

      setArtefacts({
        aiRunId,
        expectedPersons,
        builderMarkdown,
        builderInputs: {
          persons: personsForBuilder,
          profileHits: profileResult?.profiles?.length ?? 0,
          chHits: chResult?.results?.length ?? 0,
          ofsiHits: ofsiResult?.results?.length ?? 0,
          fcaHits: fcaResult?.results?.length ?? 0,
          fatfAvailable: !!(fatfData?.blackList || fatfData?.greyList),
        },
        persisted,
        validatorFindings: profileFindings,
        validatorPassed: profileFindings.length === 0,
        coverageLocal,
      });
      toast.success("Smoke test complete.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[smoke-test] failed:", err);
      toast.error(`Smoke test failed: ${msg}`);
    } finally {
      setRunning(false);
      setStage("");
    }
  };

  const handleCleanup = async () => {
    if (!selectedCaseId) return;
    setCleaning(true);
    try {
      // Find smoke-* check ids first so we can also cull their signals.
      const { data: checks } = await supabase
        .from("external_profile_checks")
        .select("id, ai_run_id")
        .eq("case_id", selectedCaseId)
        .like("ai_run_id", "smoke-%");
      const ids = (checks ?? []).map((c) => c.id);
      if (ids.length > 0) {
        await supabase.from("external_profile_signals").delete().in("profile_check_id", ids);
        await supabase.from("external_profile_checks").delete().in("id", ids);
      }
      toast.success(`Removed ${ids.length} smoke-test check row(s).`);
      setArtefacts(null);
    } catch (err) {
      toast.error(`Cleanup failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setCleaning(false);
    }
  };

  const copyMarkdown = async () => {
    if (!artefacts?.builderMarkdown) return;
    await navigator.clipboard.writeText(artefacts.builderMarkdown);
    toast.success("Section 5C markdown copied.");
  };

  // ── Spec-parity checklist ─────────────────────────────────────────────

  const parity = useMemo(() => {
    if (!artefacts) return null;
    const persistedNames = new Set(
      artefacts.persisted.map((p) => p.party_name.toLowerCase().trim()),
    );
    const persistedHasAll = artefacts.expectedPersons.every((n) =>
      persistedNames.has(n.toLowerCase().trim()),
    );
    const validatorAgrees =
      artefacts.coverageLocal.rendersCorrectly === artefacts.validatorPassed;
    return [
      { label: "Section header present", pass: artefacts.coverageLocal.hasSectionHeader },
      { label: "One block per expected person", pass: artefacts.coverageLocal.personsMissing.length === 0 },
      { label: "All 8 rows present per person", pass: artefacts.coverageLocal.personsWithIncompleteRows.length === 0 },
      { label: "Persistence row exists for each person", pass: persistedHasAll },
      { label: "Validator agrees with builder", pass: validatorAgrees },
    ];
  }, [artefacts]);

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <AppLayout>
      <div className="container mx-auto p-6 space-y-6 max-w-6xl">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Personal Profile (Section 5C) — Smoke Test</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Runs enrichment, deterministic table builder, persistence, and validator
            against an existing case. Read-only — does not touch the case's saved report.
          </p>
        </div>

        {/* Case selector + run */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Select case</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col md:flex-row md:items-end gap-3">
              <div className="flex-1 min-w-0">
                <Select value={selectedCaseId} onValueChange={setSelectedCaseId} disabled={loadingCases || running}>
                  <SelectTrigger>
                    <SelectValue placeholder={loadingCases ? "Loading cases…" : "Choose a case"} />
                  </SelectTrigger>
                  <SelectContent>
                    {cases.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.case_reference} — {c.property_address}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleRun} disabled={!selectedCaseId || running}>
                {running ? <Loader2 className="animate-spin" /> : <Play />}
                {running ? "Running…" : "Run smoke test"}
              </Button>
              <Button
                variant="outline"
                onClick={handleCleanup}
                disabled={!selectedCaseId || cleaning || running}
              >
                {cleaning ? <Loader2 className="animate-spin" /> : <Trash2 />}
                Delete smoke-test rows
              </Button>
            </div>
            {selectedCaseId && (
              <div className="text-sm text-muted-foreground space-y-1">
                <div>
                  Persons detected: <span className="font-medium text-foreground">{expectedPersons.length > 0 ? expectedPersons.join(", ") : "—"}</span>
                </div>
                <div>
                  Documents on file: <span className="font-medium text-foreground">{documents.length}</span>
                  {" · "}ID-document matches (heuristic): <span className="font-medium text-foreground">{idDocCount}</span>
                </div>
                {running && stage && (
                  <div className="text-xs flex items-center gap-2 mt-2">
                    <Loader2 className="h-3 w-3 animate-spin" /> {stage}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {artefacts && (
          <>
            {/* Spec parity checklist */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <ListChecks className="h-4 w-4" /> Spec parity checklist
                </CardTitle>
                <CardDescription>
                  Diagnostic run id: <code className="text-xs">{artefacts.aiRunId}</code>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {(parity ?? []).map((row) => (
                    <li key={row.label} className="flex items-center gap-2 text-sm">
                      {row.pass ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-amber-600" />
                      )}
                      <span className={row.pass ? "" : "text-amber-700 font-medium"}>{row.label}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* 1. Deterministic table */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="h-4 w-4" /> 1. Deterministic Section 5C table
                  </CardTitle>
                  <CardDescription>
                    profile hits: {artefacts.builderInputs.profileHits}
                    {" · "}CH hits: {artefacts.builderInputs.chHits}
                    {" · "}OFSI hits: {artefacts.builderInputs.ofsiHits}
                    {" · "}FCA hits: {artefacts.builderInputs.fcaHits}
                    {" · "}FATF data: {artefacts.builderInputs.fatfAvailable ? "yes" : "no"}
                  </CardDescription>
                </div>
                <Button size="sm" variant="outline" onClick={copyMarkdown}>
                  <Copy className="h-3 w-3" /> Copy markdown
                </Button>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[420px] rounded border bg-muted/30 p-4">
                  <pre className="text-xs whitespace-pre-wrap font-mono">{artefacts.builderMarkdown}</pre>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* 2. Persisted enrichment rows */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Database className="h-4 w-4" /> 2. Persisted enrichment ({artefacts.persisted.length} check row(s))
                </CardTitle>
                <CardDescription>
                  Stored in <code>external_profile_checks</code> / <code>external_profile_signals</code> under run id <code>{artefacts.aiRunId}</code>.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {artefacts.persisted.length === 0 && (
                  <p className="text-sm text-muted-foreground">No rows were written.</p>
                )}
                {artefacts.persisted.map((row) => (
                  <div key={row.id} className="rounded border p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="font-medium text-sm">{row.party_name}</div>
                      <div className="flex gap-2">
                        <Badge variant="outline">{row.overall_outcome}</Badge>
                        {row.requires_review && <Badge variant="destructive">requires review</Badge>}
                        {row.has_discrepancy && <Badge variant="destructive">discrepancy</Badge>}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">{row.overall_summary}</p>
                    <div className="text-xs text-muted-foreground">
                      no-signal ratio: {row.no_signal_ratio} · signals: {row.signals?.length ?? 0}
                    </div>
                    {row.signals && row.signals.length > 0 && (
                      <ul className="text-xs space-y-1 pt-1">
                        {row.signals.map((s) => (
                          <li key={s.id} className="flex gap-2">
                            <Badge variant="secondary" className="text-[10px]">{s.source_type}</Badge>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium truncate">{s.source_name}</div>
                              {s.source_url && (
                                <a href={s.source_url} target="_blank" rel="noreferrer" className="text-primary underline truncate block">
                                  {s.source_url}
                                </a>
                              )}
                              <div className="text-muted-foreground">{s.summary}</div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* 3. Validator finding */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Shield className="h-4 w-4" /> 3. Validator verdict
                </CardTitle>
                <CardDescription>
                  Output of <code>sow-section-validator</code> against the deterministic table only.
                  Validator was called with <code>aiReportId=undefined</code> so no findings were persisted.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {artefacts.validatorPassed ? (
                  <div className="flex items-center gap-2 text-sm text-green-700">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>
                      <code>rendersCorrectly = true</code> — no <code>personal_profile_section_5c</code> finding raised.
                    </span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {artefacts.validatorFindings.map((f) => (
                      <div key={f.id} className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">
                        <div className="flex items-center gap-2 mb-1">
                          <AlertTriangle className="h-4 w-4 text-amber-700" />
                          <span className="font-medium">{f.section}</span>
                          <Badge variant="outline">{f.severity}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{f.reason}</p>
                        <Separator className="my-2" />
                        <p className="text-xs"><strong>Expected:</strong> {f.expectedBehaviour}</p>
                      </div>
                    ))}
                  </div>
                )}
                <Separator className="my-4" />
                <div className="text-xs text-muted-foreground space-y-1">
                  <div>
                    Local coverage parser:
                    {" "}
                    <code>rendersCorrectly = {String(artefacts.coverageLocal.rendersCorrectly)}</code>
                    {" · "}missing persons: {artefacts.coverageLocal.personsMissing.length}
                    {" · "}incomplete rows: {artefacts.coverageLocal.personsWithIncompleteRows.length}
                  </div>
                  {artefacts.coverageLocal.personsWithIncompleteRows.length > 0 && (
                    <div>
                      Incomplete:
                      {artefacts.coverageLocal.personsWithIncompleteRows.map((p) => (
                        <div key={p.name} className="ml-2">
                          • {p.name} — missing: {p.missingRows.join(", ")}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}
