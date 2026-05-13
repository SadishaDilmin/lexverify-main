import { useCallback, useEffect, useState } from "react";
import { ShieldAlert, ShieldCheck, AlertTriangle, Loader2, RefreshCw, ChevronDown, ChevronRight, Info, History, ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Party {
  id: string;
  full_name: string;
  role: string;
}

interface MatchExplanation {
  bigram: number;
  token: number;
  levenshtein: number;
  phonetic: number;
  lexical: number;
  nameScore: number;
  dobAdjustment: number;
  finalScore: number;
  variantUsed: "primary" | "alias";
  matchedAgainst: string;
  cleanedQuery: string;
}

interface OFSIMatch {
  ofsiName: string;
  score: number;
  type: string;
  regime: string;
  dateOfBirth: string;
  listedOn: string;
  ukRef: string;
  groupId: string;
  explanation?: MatchExplanation;
}

type ScreeningStatus = "clear" | "review_recommended" | "potential_match" | "strong_match";

interface PartyResult {
  partyName: string;
  partyId?: string;
  partyRole?: string;
  matches: OFSIMatch[];
  status: ScreeningStatus;
}

interface ScreeningResponse {
  overall_status: ScreeningStatus;
  screened_at: string;
  total_ofsi_entries: number;
  threshold?: number;
  tier_counts?: Partial<Record<ScreeningStatus, number>>;
  results: PartyResult[];
  /** Set when the response was loaded from a historical run (not a fresh screening). */
  historical_run_id?: string;
}

interface ScreeningRunRow {
  id: string;
  screened_by: string | null;
  screened_at: string;
  threshold: number;
  parties_screened: number;
  ofsi_entries_checked: number;
  overall_status: ScreeningStatus;
  tier_counts: Partial<Record<ScreeningStatus, number>>;
  results: PartyResult[];
  /** Resolved display name (full_name → email → "User"). Filled client-side. */
  screener_name?: string | null;
}

interface OFSISanctionsPanelProps {
  caseParties: Party[];
  caseId: string;
}

const STATUS_CONFIG: Record<ScreeningStatus, { icon: typeof ShieldCheck; label: string; className: string }> = {
  clear: { icon: ShieldCheck, label: "No matches", className: "bg-green-500/10 text-green-700 border-green-500/20" },
  review_recommended: { icon: AlertTriangle, label: "Review recommended", className: "bg-amber-300/10 text-amber-600 border-amber-300/40" },
  potential_match: { icon: AlertTriangle, label: "Potential match", className: "bg-amber-500/10 text-amber-700 border-amber-500/20" },
  strong_match: { icon: ShieldAlert, label: "Strong match", className: "bg-destructive/10 text-destructive border-destructive/20" },
};

/** Friendly label + tooltip-style description for each component score. */
const COMPONENT_LABELS: Array<{ key: keyof Pick<MatchExplanation, "lexical" | "bigram" | "token" | "levenshtein" | "phonetic">; label: string; hint: string }> = [
  { key: "lexical", label: "Lexical (best of below)", hint: "The strongest of bi-gram, token and edit-distance signals — the dominant lexical evidence." },
  { key: "bigram", label: "Bi-gram (Dice)", hint: "Character-pair overlap. Robust to small spelling differences." },
  { key: "token", label: "Token match", hint: "Word-by-word similarity. Handles initials and reordered name parts." },
  { key: "levenshtein", label: "Edit distance", hint: "Length-normalised Levenshtein. Catches single-character typos and transliteration." },
  { key: "phonetic", label: "Phonetic", hint: "Sound-based key overlap. Catches Qaddafi/Gaddafi-style variants. Capped at 0.85 contribution on its own." },
];

function ScoreBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
      <div className="h-full bg-primary/70" style={{ width: `${pct}%` }} />
    </div>
  );
}

function MatchExplanationPanel({ explanation }: { explanation: MatchExplanation }) {
  const dobSign = explanation.dobAdjustment > 0 ? "+" : "";
  return (
    <div className="mt-2 rounded border border-border/60 bg-background/40 p-2.5 space-y-2">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
        <Info size={12} className="text-muted-foreground" />
        How this score was calculated
      </div>
      <div className="grid grid-cols-[max-content_minmax(0,1fr)_max-content] gap-x-3 gap-y-1.5 text-[11px] items-center">
        {COMPONENT_LABELS.map(({ key, label, hint }) => (
          <div key={key} className="contents">
            <span className="text-muted-foreground" title={hint}>{label}</span>
            <ScoreBar value={explanation[key]} />
            <span className="font-mono tabular-nums text-foreground">{explanation[key].toFixed(3)}</span>
          </div>
        ))}
        <div className="contents">
          <span className="text-muted-foreground pt-1 border-t border-border/40">Combined name score</span>
          <div className="pt-1 border-t border-border/40"><ScoreBar value={explanation.nameScore} /></div>
          <span className="font-mono tabular-nums text-foreground pt-1 border-t border-border/40">{explanation.nameScore.toFixed(3)}</span>
        </div>
        {explanation.dobAdjustment !== 0 && (
          <div className="contents">
            <span className="text-muted-foreground" title="Date of birth tie-breaker. Never creates a match on its own; only adjusts a name-derived score.">DOB adjustment</span>
            <span className={`text-[11px] ${explanation.dobAdjustment > 0 ? "text-green-700" : "text-destructive"}`}>
              {explanation.dobAdjustment > 0 ? "Boost applied" : "Year mismatch"}
            </span>
            <span className={`font-mono tabular-nums ${explanation.dobAdjustment > 0 ? "text-green-700" : "text-destructive"}`}>
              {dobSign}{explanation.dobAdjustment.toFixed(3)}
            </span>
          </div>
        )}
        <div className="contents">
          <span className="text-foreground font-medium pt-1 border-t border-border/40">Final score</span>
          <div className="pt-1 border-t border-border/40"><ScoreBar value={explanation.finalScore} /></div>
          <span className="font-mono tabular-nums font-semibold text-foreground pt-1 border-t border-border/40">{explanation.finalScore.toFixed(3)}</span>
        </div>
      </div>
      <div className="text-[10px] text-muted-foreground space-y-0.5 pt-1">
        <div>Compared <span className="font-mono">{explanation.cleanedQuery}</span> against <span className="font-mono">{explanation.matchedAgainst}</span> ({explanation.variantUsed === "alias" ? "alias permutation" : "primary OFSI name"}).</div>
        <div>Honorifics and accents are stripped before scoring. This breakdown is an audit aid; final review remains with the conveyancer.</div>
      </div>
    </div>
  );
}

export default function OFSISanctionsPanel({ caseParties, caseId }: OFSISanctionsPanelProps) {
  const [screening, setScreening] = useState<ScreeningResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [history, setHistory] = useState<ScreeningRunRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [viewingRunId, setViewingRunId] = useState<string | null>(null);
  const { toast } = useToast();

  const toggleExpanded = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  /** Fetch the most recent runs for this case and resolve screener display names. */
  const loadHistory = useCallback(async (hydrateLatest: boolean) => {
    if (!caseId) return;
    setHistoryLoading(true);
    try {
      const { data: runs, error } = await supabase
        .from("ofsi_screening_runs")
        .select("id, screened_by, screened_at, threshold, parties_screened, ofsi_entries_checked, overall_status, tier_counts, results")
        .eq("case_id", caseId)
        .order("screened_at", { ascending: false })
        .limit(20);
      if (error) throw error;

      const rows = ((runs ?? []) as unknown) as ScreeningRunRow[];

      // Resolve screener display names (best-effort).
      const screenerIds = Array.from(new Set(rows.map((r) => r.screened_by).filter(Boolean) as string[]));
      if (screenerIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name, email")
          .in("user_id", screenerIds);
        const nameMap = new Map<string, string>();
        for (const p of profiles ?? []) {
          nameMap.set(p.user_id, p.full_name || p.email || "User");
        }
        for (const r of rows) {
          r.screener_name = r.screened_by ? (nameMap.get(r.screened_by) ?? "User") : null;
        }
      }

      setHistory(rows);

      // On first load, surface the most recent run so the panel is not empty.
      if (hydrateLatest && rows.length > 0 && !screening) {
        const latest = rows[0];
        setScreening({
          overall_status: latest.overall_status,
          screened_at: latest.screened_at,
          total_ofsi_entries: latest.ofsi_entries_checked,
          threshold: latest.threshold,
          tier_counts: latest.tier_counts,
          results: latest.results,
        });
      }
    } catch (e) {
      console.error("OFSI history load error:", e);
    } finally {
      setHistoryLoading(false);
    }
  // `screening` intentionally omitted — we only hydrate-from-latest on the initial mount call.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  useEffect(() => {
    loadHistory(true);
  }, [loadHistory]);

  const viewHistoricalRun = (run: ScreeningRunRow) => {
    setViewingRunId(run.id);
    setScreening({
      overall_status: run.overall_status,
      screened_at: run.screened_at,
      total_ofsi_entries: run.ofsi_entries_checked,
      threshold: run.threshold,
      tier_counts: run.tier_counts,
      results: run.results,
      historical_run_id: run.id,
    });
    setExpanded(new Set());
  };

  const returnToLatest = () => {
    setViewingRunId(null);
    const latest = history[0];
    if (latest) {
      setScreening({
        overall_status: latest.overall_status,
        screened_at: latest.screened_at,
        total_ofsi_entries: latest.ofsi_entries_checked,
        threshold: latest.threshold,
        tier_counts: latest.tier_counts,
        results: latest.results,
      });
    } else {
      setScreening(null);
    }
    setExpanded(new Set());
  };

  const runScreening = async () => {
    if (caseParties.length === 0) {
      toast({ title: "No parties", description: "Add parties to the case before running sanctions screening.", variant: "destructive" });
      return;
    }
    setLoading(true);
    setViewingRunId(null);
    try {
      const { data, error } = await supabase.functions.invoke("ofsi-sanctions-check", {
        body: {
          parties: caseParties.map((p) => ({
            id: p.id,
            full_name: p.full_name,
            role: p.role,
          })),
          // Use the edge function's default threshold (0.65) so the
          // "review recommended" tier surfaces, not just strong/potential matches.
          threshold: 0.65,
          case_id: caseId,
        },
      });
      if (error) throw error;
      setScreening(data as ScreeningResponse);
      toast({
        title: "Sanctions screening complete",
        description: `Screened ${caseParties.length} ${caseParties.length === 1 ? "party" : "parties"} against ${data.total_ofsi_entries} OFSI entries.`,
      });
      // Refresh history so the new run appears at the top. Don't re-hydrate
      // `screening` — the live `data` we just set is the same row.
      loadHistory(false);
    } catch (e: any) {
      console.error("OFSI screening error:", e);
      toast({ title: "Screening failed", description: e.message || "Unknown error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-border">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldAlert size={18} className="text-primary" />
          OFSI Sanctions Screening
        </CardTitle>
        <Button size="sm" onClick={runScreening} disabled={loading} className="gap-1.5">
          {loading ? <Loader2 size={14} className="animate-spin" /> : screening ? <RefreshCw size={14} /> : <ShieldAlert size={14} />}
          {loading ? "Screening…" : screening ? "Re-screen" : "Run Screening"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {!screening && !loading && (
          <p className="text-sm text-muted-foreground">
            Screen all case parties against the UK OFSI Consolidated List of Financial Sanctions Targets. This is a live check against the official HM Treasury register.
          </p>
        )}

        {screening && (
          <>
            {viewingRunId && (
              <div className="flex items-center justify-between gap-2 text-xs bg-muted/40 border border-border rounded px-2.5 py-1.5">
                <span className="text-muted-foreground">
                  Viewing historical run from {new Date(screening.screened_at).toLocaleString()}
                </span>
                <button type="button" onClick={returnToLatest} className="inline-flex items-center gap-1 text-foreground hover:text-primary transition-colors">
                  <ArrowLeft size={12} />
                  Back to latest
                </button>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mb-2">
              <span>Screened at {new Date(screening.screened_at).toLocaleString()}</span>
              <span>•</span>
              <span>{screening.total_ofsi_entries.toLocaleString()} OFSI entries checked</span>
              {typeof screening.threshold === "number" && (
                <>
                  <span>•</span>
                  <span>Threshold {screening.threshold.toFixed(2)}</span>
                </>
              )}
            </div>

            {screening.results.map((result, idx) => {
              const config = STATUS_CONFIG[result.status];
              const Icon = config.icon;
              return (
                <div key={idx} className="border border-border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{result.partyName}</span>
                      <Badge variant="outline" className="text-xs capitalize">{result.partyRole}</Badge>
                    </div>
                    <Badge className={`gap-1 ${config.className}`}>
                      <Icon size={12} />
                      {config.label}
                    </Badge>
                  </div>

                  {result.matches.length > 0 && (
                    <div className="space-y-1.5 pl-2 border-l-2 border-destructive/30">
                      {result.matches.map((match, mIdx) => {
                        const key = `${idx}-${mIdx}`;
                        const isOpen = expanded.has(key);
                        return (
                          <div key={mIdx} className="text-xs space-y-0.5 bg-muted/50 rounded p-2">
                            <div className="flex items-center justify-between">
                              <span className="font-medium">{match.ofsiName}</span>
                              <Badge variant="outline" className="text-[10px]">
                                {Math.round(match.score * 100)}% match
                              </Badge>
                            </div>
                            <div className="text-muted-foreground grid grid-cols-2 gap-x-4">
                              <span>Type: {match.type}</span>
                              <span>Regime: {match.regime || "—"}</span>
                              {match.dateOfBirth && <span>DOB: {match.dateOfBirth}</span>}
                              {match.ukRef && <span>Ref: {match.ukRef}</span>}
                            </div>
                            {match.explanation && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => toggleExpanded(key)}
                                  className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                                  aria-expanded={isOpen}
                                >
                                  {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                  {isOpen ? "Hide score breakdown" : "Why this match? Show score breakdown"}
                                </button>
                                {isOpen && <MatchExplanationPanel explanation={match.explanation} />}
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}

        {(history.length > 0 || historyLoading) && (
          <div className="pt-2 border-t border-border/60">
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              aria-expanded={showHistory}
            >
              {showHistory ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              <History size={12} />
              Screening history ({history.length})
            </button>
            {showHistory && (
              <div className="mt-2 space-y-1">
                {historyLoading && history.length === 0 && (
                  <p className="text-[11px] text-muted-foreground">Loading history…</p>
                )}
                {history.map((run) => {
                  const cfg = STATUS_CONFIG[run.overall_status];
                  const isActive = viewingRunId === run.id;
                  const tc = run.tier_counts || {};
                  const chips: string[] = [];
                  if (tc.strong_match) chips.push(`${tc.strong_match} strong`);
                  if (tc.potential_match) chips.push(`${tc.potential_match} potential`);
                  if (tc.review_recommended) chips.push(`${tc.review_recommended} review`);
                  if (tc.clear) chips.push(`${tc.clear} clear`);
                  return (
                    <button
                      key={run.id}
                      type="button"
                      onClick={() => viewHistoricalRun(run)}
                      className={`w-full text-left text-[11px] rounded border px-2.5 py-1.5 transition-colors ${
                        isActive
                          ? "bg-primary/5 border-primary/40"
                          : "bg-background hover:bg-muted/40 border-border/60"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-foreground">
                          {new Date(run.screened_at).toLocaleString()}
                        </span>
                        <Badge className={`gap-1 text-[10px] ${cfg.className}`}>{cfg.label}</Badge>
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-muted-foreground">
                        <span>{run.screener_name ?? "User"}</span>
                        <span>·</span>
                        <span>{run.parties_screened} {run.parties_screened === 1 ? "party" : "parties"}</span>
                        <span>·</span>
                        <span>Threshold {Number(run.threshold).toFixed(2)}</span>
                        {chips.length > 0 && (
                          <>
                            <span>·</span>
                            <span>{chips.join(" · ")}</span>
                          </>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
