import { useState, useEffect, memo, useMemo, lazy, Suspense } from "react";
import {
  Pencil, X, Save, Download, Copy, Check, Loader2, Columns2,
  User, Banknote, MapPin, Shield, BarChart3, FileText, AlertTriangle,
  CheckCircle2, XCircle, Info, ChevronDown, ChevronRight, Landmark,
  Clock, Briefcase, CreditCard, Building2, Scale, ListChecks,
  ExternalLink, Globe, Star, ShieldAlert,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { QueryClient } from "@tanstack/react-query";
import { useEvidenceReferences, groupBySection } from "@/hooks/useEvidenceReferences";
import EvidenceChip from "@/components/evidence/EvidenceChip";
import EvidenceViewerDialog from "@/components/evidence/EvidenceViewerDialog";
import type { EvidenceReference } from "@/components/evidence/types";
import LsagItemDrilldown from "@/components/case-workspace/LsagItemDrilldown";
import {
  matchLsagItemNumber,
  bucketByLsagItem,
  type ItemMatchResult,
} from "@/lib/lsagItemMatcher";
import SectionFindingStrip from "@/components/sow/SectionFindingStrip";
import {
  currentResolution,
  type SectionCompliancePayload,
  type SectionFinding,
  type SectionResolution,
  type SectionResolutionAction,
} from "@/lib/sowSectionValidator";
import { resolveFinding } from "@/lib/sectionFindingActions";
import { groupFindingsByHeading } from "@/lib/sectionFindingMatcher";

// AML dashboard embedded as the in-report Section 6 when requested.
const AMLCheckSummary = lazy(() => import("@/components/AMLCheckSummary"));
const OFSISanctionsPanel = lazy(() => import("@/components/case-workspace/OFSISanctionsPanel"));


/* ── Types ─────────────────────────────────────────────────────────── */

interface StructuredSoWReportTabProps {
  title: string;
  subtitle?: string;
  content: string | null | undefined;
  aiReportId?: string;
  caseId?: string;
  dbField?: "client_report" | "internal_report" | "draft_email";
  queryClient: QueryClient;
  emptyMessage?: string;
  onExport?: (text: string) => void;
  /**
   * Persisted Section Compliance payload from `ai_reports.section_compliance`.
   * When supplied, validator findings render inline beneath the matching
   * report section (replacing the right-hand sidebar in the SoW Internal view).
   */
  compliance?: SectionCompliancePayload | null;
  /** Case parties — required when embedding the AML/OFSI dashboard (Section 6). */
  caseParties?: Array<{ id: string; full_name: string; role: string; pep_status?: string | null }>;
  /**
   * When true, an "AML Compliance Dashboard" section is appended to the report
   * containing the OFSI panel + AML 13-check grid (replacing the standalone
   * AML Checks tab).
   */
  embedAmlDashboard?: boolean;
  /** Switch to another tab in the case workspace (used by finding-strip CTAs). */
  onSwitchTab?: (tab: "sow_tracker" | "sow_email" | string) => void;
}

interface ParsedSection {
  heading: string;
  body: string;
  severity: Severity;
  icon: typeof FileText;
  isChecklist: boolean;
}

interface ChecklistItem {
  name: string;
  status: "pass" | "fail" | "partial";
}

type Severity = "high" | "medium" | "low" | "good" | "info";

/* ── Severity styles ───────────────────────────────────────────────── */

const SEVERITY_STYLES: Record<Severity, { badge: string; border: string; icon: string; bg: string }> = {
  high: {
    badge: "bg-destructive/10 text-destructive border-destructive/30",
    border: "border-l-4 border-l-destructive/60",
    icon: "text-destructive",
    bg: "bg-destructive/5",
  },
  medium: {
    badge: "bg-risk-amber/10 text-risk-amber border-risk-amber/30",
    border: "border-l-4 border-l-risk-amber/60",
    icon: "text-risk-amber",
    bg: "bg-risk-amber/5",
  },
  low: {
    badge: "bg-risk-green/10 text-risk-green border-risk-green/30",
    border: "border-l-4 border-l-risk-green/60",
    icon: "text-risk-green",
    bg: "bg-risk-green/5",
  },
  good: {
    badge: "bg-risk-green/10 text-risk-green border-risk-green/30",
    border: "border-l-4 border-l-risk-green/60",
    icon: "text-risk-green",
    bg: "bg-risk-green/5",
  },
  info: {
    badge: "bg-accent/10 text-accent border-accent/30",
    border: "border-l-4 border-l-accent/40",
    icon: "text-accent",
    bg: "bg-accent/5",
  },
};

const SEVERITY_LABELS: Record<Severity, string> = {
  high: "High Risk",
  medium: "Medium Risk",
  low: "Low Risk",
  good: "Satisfactory",
  info: "Info",
};

/* ── Detection helpers ─────────────────────────────────────────────── */

function detectSeverity(text: string): Severity {
  const upper = text.toUpperCase();

  // If the section contains an explicit Profile Consistency Rating, use that
  // instead of generic keyword matching which can pick up incidental phrases.
  const profileRatingMatch = upper.match(
    /PROFILE\s*CONSISTENCY\s*RATING\s*[:：]?\s*(GREEN|AMBER|RED)/
  );
  if (profileRatingMatch) {
    const rating = profileRatingMatch[1];
    if (rating === "RED") return "high";
    if (rating === "AMBER") return "medium";
    return "good"; // GREEN
  }

  // Also check for explicit overall risk ratings that the agent assigns
  const overallRatingMatch = upper.match(
    /(?:OVERALL\s*RISK|RISK\s*RATING)\s*[:：]?\s*(RED|AMBER|GREEN)/
  );
  if (overallRatingMatch) {
    const rating = overallRatingMatch[1];
    if (rating === "RED") return "high";
    if (rating === "AMBER") return "medium";
    return "good";
  }

  if (/HIGH\s*RISK|RED\s*FLAG|CRITICAL|URGENT|SIGNIFICANT\s*CONCERN|MAJOR\s*ISSUE|FAIL/.test(upper)) return "high";
  if (/MEDIUM\s*RISK|MODERATE|CAUTION|ADVISORY|POTENTIAL\s*CONCERN|MINOR\s*ISSUE|PARTIAL/.test(upper)) return "medium";
  if (/LOW\s*RISK|MINIMAL|NO\s*SIGNIFICANT|NEGLIGIBLE/.test(upper)) return "low";
  if (/SATISFACTORY|NO\s*ISSUES|NO\s*CONCERNS|COMPLIANT|CLEAR|ACCEPTABLE|NO\s*ADVERSE|STANDARD|NORMAL|PASS/.test(upper)) return "good";
  return "info";
}

function pickIcon(heading: string): typeof FileText {
  const h = heading.toLowerCase();
  if (/identity|passport|id\s*verif|name|dob/.test(h)) return User;
  if (/cash|deposit/.test(h)) return Banknote;
  if (/address/.test(h)) return MapPin;
  if (/salary|income|employ|wage|earning/.test(h)) return Briefcase;
  if (/purchase\s*price|ratio|multiple|affordab/.test(h)) return BarChart3;
  if (/bank\s*statement|statement\s*coverage|gap/.test(h)) return CreditCard;
  if (/compliance|lsag|checklist|regulatory/.test(h)) return ListChecks;
  if (/risk|score|overall/.test(h)) return AlertTriangle;
  if (/lender|mortgage/.test(h)) return Building2;
  if (/legal|covenant/.test(h)) return Scale;
  if (/summar|overview|executive|conclusion/.test(h)) return Info;
  if (/source\s*of\s*(wealth|fund)|sow/.test(h)) return Landmark;
  if (/time|period|coverage/.test(h)) return Clock;
  if (/shield|protect|guard/.test(h)) return Shield;
  return FileText;
}

function isChecklistSection(heading: string): boolean {
  return /lsag|checklist/i.test(heading);
}

/**
 * Strip every status indicator (words + glyphs) from a checklist body
 * sentence so the rendered tile shows the rationale only — never the
 * word "Fail / Pass / Partial" and never the ❌ / ✅ / ⚠️ glyphs.
 * Pure presentation. Does not mutate stored content.
 */
function stripStatusArtifacts(text: string): string {
  return text
    // Strip emoji & pictographic symbols (covers ❌ ✅ ⚠ 🟢 🔴 🟡 ◆ ♦ ◇ ◈ ▪ ▫ ■ □ etc.)
    .replace(
      /[\u2600-\u27BF\u2B00-\u2BFF\u25A0-\u25FF\u2300-\u23FF]/gu,
      "",
    )
    // Strip astral-plane emoji (U+1F300–U+1FAFF range covers most coloured emoji)
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, "")
    // Strip leftover variation selectors and zero-width joiners that emoji leave behind
    .replace(/[\uFE00-\uFE0F\u200D\uFFFD]/g, "")
    .replace(/\b(pass|fail|partial)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;:])/g, "$1")
    .replace(/^[\s.,;:—–-]+/, "")
    .replace(/[\s.,;:—–-]+$/, "")
    .trim();
}

function parseChecklistItems(body: string): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  // Match patterns like: "- Identity Verification: Pass", "| ID Check | Pass |", "1. Name check — Fail"
  const lines = body.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let status: "pass" | "fail" | "partial" | null = null;
    if (/\bpass\b/i.test(trimmed)) status = "pass";
    if (/\bfail\b/i.test(trimmed)) status = "fail";
    if (/\bpartial\b/i.test(trimmed)) status = "partial";

    if (status) {
      // Extract the name by removing markers, status words, table pipes,
      // and emoji status glyphs so it never shows two indicators at once.
      let name = trimmed
        .replace(/^[-*•|#\d.)\s]+/, "")
        .replace(/\|/g, "")
        .replace(/\*\*/g, "");
      name = stripStatusArtifacts(name);

      if (name.length > 2) {
        items.push({ name, status });
      }
    }
  }
  return items;
}

/* ── Markdown parser ───────────────────────────────────────────────── */

function parseMarkdownSections(markdown: string): ParsedSection[] {
  const lines = markdown.split("\n");
  const sections: ParsedSection[] = [];
  let currentHeading = "";
  let currentBody: string[] = [];

  const flush = () => {
    if (currentHeading || currentBody.length > 0) {
      const body = currentBody.join("\n").trim();
      const heading = currentHeading || "Overview";
      const checklist = isChecklistSection(heading);
      sections.push({
        heading,
        body,
        severity: detectSeverity(heading + " " + body),
        icon: pickIcon(heading),
        isChecklist: checklist,
      });
    }
    currentBody = [];
  };

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,4}\s+(.+)/);
    if (headingMatch) {
      flush();
      // Strip stray markdown bold markers (e.g. "**1. Executive Summary**")
      // that sometimes appear inside model-generated headings.
      currentHeading = headingMatch[1].replace(/\*\*/g, "").trim();
    } else {
      currentBody.push(line);
    }
  }
  flush();
  return sections;
}

/* ── Sub-components ────────────────────────────────────────────────── */

const CopyButton = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-1.5"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        toast({ title: "Copied to clipboard" });
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
};

const STATUS_CONFIG = {
  pass: {
    icon: CheckCircle2,
    label: "Pass",
    bg: "bg-risk-green/10",
    text: "text-risk-green",
    border: "border-risk-green/30",
    dot: "bg-risk-green",
  },
  fail: {
    icon: XCircle,
    label: "Fail",
    bg: "bg-destructive/10",
    text: "text-destructive",
    border: "border-destructive/30",
    dot: "bg-destructive",
  },
  partial: {
    icon: AlertTriangle,
    label: "Partial",
    bg: "bg-risk-amber/10",
    text: "text-risk-amber",
    border: "border-risk-amber/30",
    dot: "bg-risk-amber",
  },
};

interface ChecklistGridProps {
  items: ChecklistItem[];
  /** Evidence rows attached to this LSAG section, if any. */
  sectionEvidence?: EvidenceReference[];
  /**
   * True when the entire ai_report has zero persisted evidence_references
   * (i.e. the agent run never captured citations for this case at all).
   * Used to render an honest, case-level empty-state banner instead of
   * 15 misleading "no evidence linked" tiles.
   */
  caseHasNoEvidence?: boolean;
  aiReportId?: string;
  onOpenEvidence?: (refs: EvidenceReference[], heading: string, label: string) => void;
  /**
   * Layout variant: "grid" (Variant B — left-bar tiles in 3/4 columns,
   * good for AML 13-tile dashboard) or "dense" (Variant C — single-column
   * dense list, good for the LSAG 15-item checklist).
   */
  layout?: "grid" | "dense";
}

const ChecklistGrid = ({ items, sectionEvidence = [], caseHasNoEvidence = false, aiReportId, onOpenEvidence, layout = "grid" }: ChecklistGridProps) => {
  const passCount = items.filter(i => i.status === "pass").length;
  const failCount = items.filter(i => i.status === "fail").length;
  const partialCount = items.filter(i => i.status === "partial").length;
  const total = items.length;

  const riskClass = failCount > total / 2 ? "RED"
    : failCount + partialCount > total / 2 ? "AMBER"
    : "GREEN";

  const riskColor = riskClass === "RED" ? "text-destructive"
    : riskClass === "AMBER" ? "text-risk-amber"
    : "text-risk-green";

  // Bucket evidence by canonical LSAG item number once.
  const evidenceBuckets = useMemo(() => bucketByLsagItem(sectionEvidence), [sectionEvidence]);

  // Drilldown sheet state — single sheet, swap the active item.
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const activeItem = activeIdx !== null ? items[activeIdx] : null;
  const activeMatch = useMemo(() => {
    if (!activeItem) return { number: 0, matchedOn: "" };
    return matchLsagItemNumber(activeItem.name);
  }, [activeItem]);
  const activeEvidence: ItemMatchResult<EvidenceReference>[] = useMemo(() => {
    if (!activeItem) return [];
    if (activeMatch.number > 0) {
      return evidenceBuckets.matched.get(activeMatch.number) || [];
    }
    return [];
  }, [activeItem, activeMatch, evidenceBuckets]);

  return (
    <div className="space-y-4">
      {/* Summary bar with info popover */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5 text-risk-green font-medium">
            <CheckCircle2 size={13} /> {passCount} Pass
          </span>
          <span className="flex items-center gap-1.5 text-risk-amber font-medium">
            <AlertTriangle size={13} /> {partialCount} Partial
          </span>
          <span className="flex items-center gap-1.5 text-destructive font-medium">
            <XCircle size={13} /> {failCount} Fail
          </span>
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <button className="text-muted-foreground hover:text-foreground transition-colors" aria-label="How is this score calculated?">
              <Info size={14} />
            </button>
          </PopoverTrigger>
          <PopoverContent side="left" align="start" className="w-80 text-xs space-y-2.5 p-3.5">
            <p className="font-semibold text-foreground text-sm">LSAG Compliance Checklist — Scoring</p>
            <p className="text-muted-foreground leading-relaxed">
              This checklist evaluates <span className="font-medium text-foreground">{total} compliance requirements</span> from
              the Legal Sector Affinity Group (LSAG) AML guidance. Each item is assessed against the documents and information provided:
            </p>
            <div className="space-y-1.5 border-t border-border pt-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={12} className="text-risk-green shrink-0" />
                <span className="text-muted-foreground"><span className="font-medium text-foreground">Pass</span> — Requirement fully satisfied by provided evidence</span>
              </div>
              <div className="flex items-center gap-2">
                <AlertTriangle size={12} className="text-risk-amber shrink-0" />
                <span className="text-muted-foreground"><span className="font-medium text-foreground">Partial</span> — Some evidence exists but is incomplete or requires clarification</span>
              </div>
              <div className="flex items-center gap-2">
                <XCircle size={12} className="text-destructive shrink-0" />
                <span className="text-muted-foreground"><span className="font-medium text-foreground">Fail</span> — No supporting evidence found; action required</span>
              </div>
            </div>
            <div className="border-t border-border pt-2 space-y-1">
              <p className="font-medium text-foreground">Risk Class Thresholds:</p>
              <p className="text-muted-foreground"><span className="font-medium text-risk-green">GREEN</span> — Majority of items pass; minor gaps only</p>
              <p className="text-muted-foreground"><span className="font-medium text-risk-amber">AMBER</span> — Combined fails + partials exceed half the checklist</p>
              <p className="text-muted-foreground"><span className="font-medium text-destructive">RED</span> — More than half the checklist items fail</p>
            </div>
            <p className="text-muted-foreground italic text-[10px] pt-0.5">
              Click any tile to see the evidence excerpts and audit trail for that item.
            </p>
          </PopoverContent>
        </Popover>
      </div>

      {/* Structured overall score card */}
      <div className={`rounded-lg border p-3 flex items-center justify-between ${
        riskClass === "RED" ? "border-destructive/30 bg-destructive/5"
          : riskClass === "AMBER" ? "border-risk-amber/30 bg-risk-amber/5"
          : "border-risk-green/30 bg-risk-green/5"
      }`}>
        <div className="space-y-0.5">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Overall Score</p>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-risk-green font-bold">{passCount}/{total}</span>
            <span className="text-risk-amber font-bold">{partialCount}/{total}</span>
            <span className="text-destructive font-bold">{failCount}/{total}</span>
          </div>
        </div>
        <Badge variant="outline" className={`text-xs font-bold ${riskColor} ${
          riskClass === "RED" ? "border-destructive/40 bg-destructive/10"
            : riskClass === "AMBER" ? "border-risk-amber/40 bg-risk-amber/10"
            : "border-risk-green/40 bg-risk-green/10"
        }`}>
          Risk Class: {riskClass}
        </Badge>
      </div>

      {/*
        Honest case-level banner. Shown when the agent run for this case did
        not persist any evidence_references at all — clicking 15 tiles to
        discover that fact would be a poor reviewer experience.
      */}
      {caseHasNoEvidence && (
        <div className="rounded-md border border-dashed border-border bg-muted/30 p-3 flex items-start gap-2.5">
          <ShieldAlert size={14} className="text-muted-foreground shrink-0 mt-0.5" />
          <div className="space-y-0.5 text-[11px] leading-relaxed">
            <p className="font-medium text-foreground">No evidence citations captured for this case</p>
            <p className="text-muted-foreground">
              The agent did not persist per-item source citations during this run, so the
              per-tile drilldown will show no evidence excerpts. Pass / Partial / Fail
              decisions and rationale remain visible in the section body above and the
              audit trail panel inside each tile.
            </p>
          </div>
        </div>
      )}

      {/* Tile renderer — Variant B (grid) or Variant C (dense list) */}
      {layout === "dense" ? (
        <div className="rounded-lg border border-border bg-card overflow-hidden divide-y divide-border">
          {items.map((item, idx) => {
            const cfg = STATUS_CONFIG[item.status];
            const tileMatch = matchLsagItemNumber(item.name);
            const evCount = tileMatch.number > 0
              ? (evidenceBuckets.matched.get(tileMatch.number)?.length || 0)
              : 0;
            const showEvidence = !(item.status === "pass" && evCount === 0);
            return (
              <button
                key={idx}
                type="button"
                onClick={() => setActiveIdx(idx)}
                className="relative w-full text-left flex items-center gap-3 pl-4 pr-3 py-2.5 hover:bg-muted/40 transition-colors focus:outline-none focus-visible:bg-muted/40"
                aria-label={`View evidence and audit trail for ${item.name}`}
              >
                <span className={`absolute left-0 top-0 bottom-0 w-1 ${cfg.dot}`} />
                <Badge variant="outline" className={`text-[9px] px-1.5 py-0 font-bold tracking-wide shrink-0 ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                  {cfg.label.toUpperCase()}
                </Badge>
                <span className="flex-1 min-w-0 text-xs text-foreground font-medium truncate">
                  {item.name}
                </span>
                {showEvidence && (
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {evCount > 0
                      ? `${evCount} evidence ref${evCount === 1 ? "" : "s"}`
                      : "No evidence"}
                  </span>
                )}
                <ChevronRight size={12} className="text-muted-foreground/60 shrink-0" />
              </button>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
          {items.map((item, idx) => {
            const cfg = STATUS_CONFIG[item.status];
            const tileMatch = matchLsagItemNumber(item.name);
            const evCount = tileMatch.number > 0
              ? (evidenceBuckets.matched.get(tileMatch.number)?.length || 0)
              : 0;
            const showEvidence = !(item.status === "pass" && evCount === 0);
            return (
              <button
                key={idx}
                type="button"
                onClick={() => setActiveIdx(idx)}
                className={`relative text-left rounded-lg border ${cfg.border} bg-card pl-4 pr-3 py-2.5 transition-all hover:ring-2 hover:ring-ring/30 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
                aria-label={`View evidence and audit trail for ${item.name}`}
              >
                <span className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-lg ${cfg.dot}`} />
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Item {idx + 1}
                  </span>
                  <Badge variant="outline" className={`text-[9px] px-1.5 py-0 font-bold tracking-wide ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                    {cfg.label.toUpperCase()}
                  </Badge>
                </div>
                <p className="text-xs font-medium text-foreground leading-snug line-clamp-2 min-h-[2.4em]">
                  {item.name}
                </p>
                {showEvidence && (
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1.5 mt-1.5 border-t border-border/50">
                    <span>
                      {evCount > 0
                        ? `${evCount} evidence ref${evCount === 1 ? "" : "s"}`
                        : "No evidence linked"}
                    </span>
                    <ChevronRight size={11} className="opacity-60" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Drilldown sheet */}
      {activeItem && (
        <LsagItemDrilldown
          open={activeIdx !== null}
          onOpenChange={(open) => { if (!open) setActiveIdx(null); }}
          itemName={activeItem.name}
          itemStatus={activeItem.status}
          canonicalNumber={activeMatch.number}
          matchedOn={activeMatch.matchedOn}
          evidence={activeEvidence}
          aiReportId={aiReportId}
          caseHasNoEvidence={caseHasNoEvidence}
          sectionHasUnmappedEvidence={evidenceBuckets.unmapped.length > 0}
          onOpenEvidence={onOpenEvidence || (() => {})}
        />
      )}
    </div>
  );
};

/* ── Profile section detection & parsing ────────────────────────────── */

interface ProfileSource {
  title: string;
  url: string;
  extractedInfo: string;
  relevance: string;
  confidence: string;
  identityMatch?: boolean;
  falsePositiveRisk?: string;
}

interface ParsedProfile {
  consistencyRating: "GREEN" | "AMBER" | "RED" | null;
  sources: ProfileSource[];
  assessment: string;
  crossCheck: string;
  reasoning: string;
}

function isProfileSection(heading: string): boolean {
  return /person\s*:/i.test(heading);
}

/**
 * Top-level numbered headings (e.g. "1. Executive Summary", "4. Transaction
 * Analysis") render as static cards (no chevron, content always visible).
 * Sub-numbered (1.1, 4.2), lettered (A., B.), and unnumbered headings
 * remain collapsible.
 */
function isTopLevelNumberedHeading(heading: string): boolean {
  const cleaned = heading.replace(/\*\*/g, "").trim();
  return /^\d+\.\s+(?!\d)/.test(cleaned);
}

function parseProfileBody(body: string): ParsedProfile {
  const sources: ProfileSource[] = [];
  let consistencyRating: "GREEN" | "AMBER" | "RED" | null = null;
  let assessment = "";
  let crossCheck = "";
  let reasoning = "";

  // Extract consistency rating
  const ratingMatch = body.match(/Profile\s*Consistency\s*Rating\s*[:：]?\s*\*{0,2}(GREEN|AMBER|RED)\*{0,2}/i);
  if (ratingMatch) {
    consistencyRating = ratingMatch[1].toUpperCase() as "GREEN" | "AMBER" | "RED";
  }

  // Extract assessment paragraph
  const assessmentMatch = body.match(/\*{0,2}Assessment\s*[:：]?\*{0,2}\s*([\s\S]*?)(?=\n\n|\n\*{0,2}[A-Z]|$)/i);
  if (assessmentMatch) {
    assessment = assessmentMatch[1].trim();
  }

  // Extract cross-check line
  const crossCheckMatch = body.match(/\*{0,2}Cross-?Check[^:]*[:：]\*{0,2}\s*(.+)/i);
  if (crossCheckMatch) {
    crossCheck = crossCheckMatch[1].trim();
  }

  // Extract reasoning
  const reasoningMatch = body.match(/\*{0,2}Reasoning\s*[:：]?\*{0,2}\s*([\s\S]*?)(?=\n\n\*{0,2}[A-Z]|\n\*{0,2}Assessment|$)/i);
  if (reasoningMatch) {
    reasoning = reasoningMatch[1].trim();
  }

  // Parse markdown table rows for sources
  const lines = body.split("\n");
  let headerCols: string[] = [];
  let foundHeader = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;

    const cells = trimmed.split("|").map(c => c.trim()).filter(Boolean);

    // Detect header row
    if (!foundHeader && cells.some(c => /source\s*title/i.test(c) || /extracted/i.test(c))) {
      headerCols = cells;
      foundHeader = true;
      continue;
    }

    // Skip separator row
    if (cells.every(c => /^[-:]+$/.test(c))) continue;

    // Data row
    if (foundHeader && cells.length >= 3) {
      const titleIdx = headerCols.findIndex(c => /source\s*title/i.test(c));
      const urlIdx = headerCols.findIndex(c => /source\s*url/i.test(c));
      const infoIdx = headerCols.findIndex(c => /extracted/i.test(c));
      const relIdx = headerCols.findIndex(c => /relevance/i.test(c));
      const confIdx = headerCols.findIndex(c => /confidence/i.test(c));
      const identIdx = headerCols.findIndex(c => /identity\s*match/i.test(c));
      const fpIdx = headerCols.findIndex(c => /false\s*positive/i.test(c));

      const getCell = (idx: number) => idx >= 0 && idx < cells.length ? cells[idx] : "";

      const title = getCell(titleIdx);
      const url = getCell(urlIdx);
      const info = getCell(infoIdx);
      const rel = getCell(relIdx);
      const conf = getCell(confIdx);
      const identMatch = getCell(identIdx);
      const fpRisk = getCell(fpIdx);

      if (title || info) {
        sources.push({
          title: title.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"),
          url: url.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$2") || "",
          extractedInfo: info,
          relevance: rel,
          confidence: conf,
          identityMatch: /true|yes|✅|confirmed/i.test(identMatch),
          falsePositiveRisk: fpRisk || undefined,
        });
      }
    }
  }

  return { consistencyRating, sources, assessment, crossCheck, reasoning };
}

const CONSISTENCY_STYLES = {
  GREEN: { bg: "bg-risk-green/10", text: "text-risk-green", border: "border-risk-green/30", label: "Green — Consistent" },
  AMBER: { bg: "bg-risk-amber/10", text: "text-risk-amber", border: "border-risk-amber/30", label: "Amber — Clarification Required" },
  RED: { bg: "bg-destructive/10", text: "text-destructive", border: "border-destructive/30", label: "Red — Inconsistent" },
};

const CONFIDENCE_STYLES: Record<string, { bg: string; text: string }> = {
  high: { bg: "bg-risk-green/10", text: "text-risk-green" },
  medium: { bg: "bg-risk-amber/10", text: "text-risk-amber" },
  low: { bg: "bg-destructive/10", text: "text-destructive" },
};

const ProfileSectionContent = ({ body }: { body: string }) => {
  const profile = useMemo(() => parseProfileBody(body), [body]);

  if (profile.sources.length === 0 && !profile.consistencyRating) {
    // Fallback to standard markdown rendering
    return (
      <div className="prose prose-sm prose-report max-w-none agent-output">
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{body}</ReactMarkdown>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Source cards */}
      {profile.sources.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Intelligence Sources ({profile.sources.length})
          </p>
          <div className="grid gap-2">
            {profile.sources.map((source, idx) => {
              const confKey = source.confidence.toLowerCase().trim();
              const confStyle = CONFIDENCE_STYLES[confKey] || CONFIDENCE_STYLES.medium;
              const isLowConfidence = confKey === "low";
              const isFalsePositive = isLowConfidence || source.identityMatch === false;

              return (
                <div
                  key={idx}
                  className={`rounded-lg border p-3 space-y-2 ${
                    isFalsePositive
                      ? "border-destructive/30 bg-destructive/5 opacity-70"
                      : "border-border bg-card"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="p-1 rounded bg-accent/10 shrink-0">
                        <Globe size={13} className="text-accent" />
                      </div>
                      {source.url ? (
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-semibold text-accent hover:underline truncate"
                        >
                          {source.title || `Source ${idx + 1}`}
                        </a>
                      ) : (
                        <span className="text-xs font-semibold text-foreground truncate">{source.title || `Source ${idx + 1}`}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${confStyle.bg} ${confStyle.text} border-transparent`}>
                              {source.confidence || "Medium"}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs max-w-xs">
                            {source.falsePositiveRisk
                              ? `⚠ ${source.falsePositiveRisk}`
                              : `Confidence: ${source.confidence || "Medium"}`}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      {source.url && (
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-accent hover:text-accent/80 transition-colors"
                        >
                          <ExternalLink size={12} />
                        </a>
                      )}
                    </div>
                  </div>

                  {isFalsePositive && (
                    <div className="flex items-center gap-1.5 text-destructive">
                      <AlertTriangle size={12} />
                      <span className="text-[10px] font-medium">
                        Possible false positive — verify identity
                        {source.falsePositiveRisk ? `: ${source.falsePositiveRisk}` : ""}
                      </span>
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground leading-relaxed">{source.extractedInfo}</p>

                  {source.relevance && (
                    <p className="text-[11px] text-muted-foreground/80 italic">
                      <span className="font-medium text-foreground/70 not-italic">Relevance:</span> {source.relevance}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Cross-check */}
      {profile.crossCheck && (
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Cross-Check Against Documents</p>
          <p className="text-xs text-muted-foreground leading-relaxed">{profile.crossCheck}</p>
        </div>
      )}

      {/* Consistency Rating */}
      {profile.consistencyRating && (
        <div className={`rounded-lg border p-3 ${CONSISTENCY_STYLES[profile.consistencyRating].bg} ${CONSISTENCY_STYLES[profile.consistencyRating].border}`}>
          <div className="flex items-center gap-2 mb-2">
            <Shield size={14} className={CONSISTENCY_STYLES[profile.consistencyRating].text} />
            <span className="text-xs font-semibold text-foreground">Profile Consistency Rating</span>
            <Badge
              variant="outline"
              className={`text-[10px] ml-auto ${CONSISTENCY_STYLES[profile.consistencyRating].bg} ${CONSISTENCY_STYLES[profile.consistencyRating].text} ${CONSISTENCY_STYLES[profile.consistencyRating].border}`}
            >
              {CONSISTENCY_STYLES[profile.consistencyRating].label}
            </Badge>
          </div>
          {profile.reasoning && (
            <p className="text-xs text-muted-foreground leading-relaxed">{profile.reasoning}</p>
          )}
        </div>
      )}

      {/* Assessment */}
      {profile.assessment && (
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Assessment</p>
          <p className="text-xs text-foreground leading-relaxed">{profile.assessment}</p>
        </div>
      )}
    </div>
  );
};

/* ── Key-value table detection ──────────────────────────────────────── */

interface KeyValueRow {
  field: string;
  value: string;
}

/**
 * Detects 2-column markdown tables (| Field | Value |) and returns parsed rows.
 * Returns null if the body doesn't contain such a table.
 */
function parseKeyValueTable(body: string): { rows: KeyValueRow[]; remainingBody: string } | null {
  const lines = body.split("\n");
  const tableLines: string[] = [];
  const nonTableLines: string[] = [];
  let inTable = false;
  let headerDetected = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      const cells = trimmed.split("|").map(c => c.trim()).filter(Boolean);
      // Skip separator rows like |---|---|
      if (cells.every(c => /^[-:]+$/.test(c))) {
        inTable = true;
        headerDetected = true;
        continue;
      }
      if (cells.length === 2) {
        if (!headerDetected && !inTable) {
          // This might be the header row — skip it, wait for separator
          tableLines.push(trimmed);
          inTable = true;
          continue;
        }
        tableLines.push(trimmed);
        inTable = true;
        continue;
      }
    }
    if (inTable && trimmed === "") {
      inTable = false;
    }
    if (!inTable || !trimmed.startsWith("|")) {
      nonTableLines.push(line);
    }
  }

  if (!headerDetected) return null;

  const rows: KeyValueRow[] = [];
  for (const tl of tableLines) {
    const cells = tl.split("|").map(c => c.trim()).filter(Boolean);
    if (cells.length === 2) {
      // Skip header-like rows
      const isHeader = /^field$/i.test(cells[0]) && /^description$/i.test(cells[1]);
      if (!isHeader) {
        rows.push({ field: cells[0].replace(/\*\*/g, ""), value: cells[1].replace(/\*\*/g, "") });
      }
    }
  }

  if (rows.length < 3) return null;

  return { rows, remainingBody: nonTableLines.join("\n").trim() };
}

const KeyValueTableCard = ({ rows }: { rows: KeyValueRow[] }) => {
  // Group financial rows for highlighting
  const financialFields = new Set(["purchase price", "mortgage amount", "stamp duty", "legal fees"]);

  // Convert any literal <br>, <br/>, <br /> tags (which sometimes appear in
  // model-generated cells) into real line breaks, and strip stray markdown
  // bold markers. Presentation-only — does not change stored content.
  const formatValue = (raw: string): string[] => {
    return raw
      .replace(/\*\*/g, "")
      .split(/\s*<br\s*\/?>\s*/i)
      .map(s => s.trim())
      .filter(Boolean);
  };

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="divide-y divide-border">
        {rows.map((row, idx) => {
          const isFinancial = financialFields.has(row.field.toLowerCase());
          const lines = formatValue(row.value);
          return (
            <div
              key={idx}
              className={`flex items-start gap-4 px-4 py-2.5 text-xs ${
                idx % 2 === 0 ? "bg-card" : "bg-muted/30"
              }`}
            >
              <span className="w-[180px] shrink-0 font-medium text-muted-foreground">{row.field}</span>
              <span className={`flex-1 ${isFinancial ? "font-semibold text-foreground" : "text-foreground"}`}>
                {lines.length > 1 ? (
                  <span className="block space-y-1">
                    {lines.map((ln, i) => (
                      <span key={i} className="block">{ln}</span>
                    ))}
                  </span>
                ) : (
                  lines[0] ?? ""
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* ── Section card ──────────────────────────────────────────────────── */

interface SectionCardProps {
  section: ParsedSection;
  evidenceRefs?: EvidenceReference[];
  onViewEvidence?: (refs: EvidenceReference[], heading: string) => void;
  aiReportId?: string;
  onOpenItemEvidence?: (refs: EvidenceReference[], heading: string, label: string) => void;
  caseHasNoEvidence?: boolean;
  /** Validator findings attached to this heading (rendered inline below the body). */
  findings?: SectionFinding[];
  /** Latest non-reverted resolution for each finding id. */
  resolutionsByFinding?: Map<string, SectionResolution | null>;
  canResolve?: boolean;
  onFindingAction?: (
    findingId: string,
    action: SectionResolutionAction,
    opts?: { revertsResolutionId?: string; sourceResolutionId?: string; note?: string },
  ) => Promise<void>;
  onSwitchTab?: (tab: string) => void;
  /** Custom body slot — when supplied, replaces the default markdown body. */
  customBody?: React.ReactNode;
}

const SectionCard = ({
  section, evidenceRefs, onViewEvidence, aiReportId, onOpenItemEvidence,
  caseHasNoEvidence, findings = [], resolutionsByFinding, canResolve = false,
  onFindingAction, onSwitchTab, customBody,
}: SectionCardProps) => {
  const [open, setOpen] = useState(true);
  const style = SEVERITY_STYLES[section.severity];
  const Icon = section.icon;

  const checklistItems = section.isChecklist ? parseChecklistItems(section.body) : [];
  const hasChecklist = checklistItems.length > 0;
  const isProfile = isProfileSection(section.heading);
  const isStatic = isTopLevelNumberedHeading(section.heading);

  // LSAG checklists render as a dense single-column list (Variant C); other
  // checklists (e.g. AML 13-point dashboard) keep the grid (Variant B).
  const isLsagChecklist = hasChecklist && /lsag/i.test(section.heading);

  // Try parsing key-value table (e.g. INTERIM REPORT case details)
  const kvTable = useMemo(() => {
    if (hasChecklist || isProfile || customBody) return null;
    return parseKeyValueTable(section.body);
  }, [section.body, hasChecklist, isProfile, customBody]);

  const showBody = isStatic || open;

  // Counters from findings: open / resolved (any non-reverted action).
  const openFindings = findings.filter((f) => !resolutionsByFinding?.get(f.id));
  const resolvedFindings = findings.filter((f) => !!resolutionsByFinding?.get(f.id));

  return (
    <div className={`rounded-lg border border-border ${style.border} ${style.bg} overflow-hidden`}>
      <div
        className={`flex items-center justify-between gap-3 p-4 ${
          isStatic ? "" : "cursor-pointer hover:bg-muted/30 transition-colors"
        }`}
        onClick={isStatic ? undefined : () => setOpen(!open)}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`p-1.5 rounded-md ${style.bg}`}>
            <Icon size={16} className={style.icon} />
          </div>
          <span className="text-sm font-semibold text-foreground truncate">{section.heading}</span>
          {evidenceRefs && evidenceRefs.length > 0 && onViewEvidence && (
            <EvidenceChip
              references={evidenceRefs}
              onClick={() => onViewEvidence(evidenceRefs, section.heading)}
            />
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {findings.length > 0 && (
            <span className="text-[10px] text-muted-foreground hidden sm:inline">
              {openFindings.length > 0 && (
                <span className="font-semibold text-risk-amber">{openFindings.length} open</span>
              )}
              {openFindings.length > 0 && resolvedFindings.length > 0 && " · "}
              {resolvedFindings.length > 0 && (
                <span>{resolvedFindings.length} resolved</span>
              )}
            </span>
          )}
          <Badge variant="outline" className={`text-[10px] ${style.badge}`}>
            {SEVERITY_LABELS[section.severity]}
          </Badge>
          {!isStatic && (
            open
              ? <ChevronDown size={14} className="text-muted-foreground" />
              : <ChevronRight size={14} className="text-muted-foreground" />
          )}
        </div>
      </div>

      {showBody && (
        <div className="px-4 pb-4 space-y-3">
          {customBody ? (
            customBody
          ) : hasChecklist ? (
            <ChecklistGrid
              items={checklistItems}
              sectionEvidence={evidenceRefs}
              caseHasNoEvidence={caseHasNoEvidence}
              aiReportId={aiReportId}
              onOpenEvidence={onOpenItemEvidence}
              layout={isLsagChecklist ? "dense" : "grid"}
            />
          ) : isProfile ? (
            <ProfileSectionContent body={section.body} />
          ) : kvTable ? (
            <>
              <KeyValueTableCard rows={kvTable.rows} />
              {kvTable.remainingBody && (
                <div className="prose prose-sm prose-report max-w-none agent-output">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{kvTable.remainingBody}</ReactMarkdown>
                </div>
              )}
            </>
          ) : (
            <div className="prose prose-sm prose-report max-w-none agent-output">
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{section.body}</ReactMarkdown>
            </div>
          )}

          {/* Inline validator findings — rendered beneath the section body
              they criticise. Open strips show action buttons; resolved
              strips collapse to a one-line audit receipt with Undo. */}
          {findings.length > 0 && onFindingAction && (
            <div className="pt-1 space-y-2">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground/80 font-semibold">
                <ShieldAlert size={11} />
                <span>Section Compliance — validator flags</span>
              </div>
              {findings.map((f) => (
                <SectionFindingStrip
                  key={f.id}
                  finding={f}
                  resolution={resolutionsByFinding?.get(f.id) ?? null}
                  canResolve={canResolve}
                  onAction={(action, opts) => onFindingAction(f.id, action, opts)}
                  onOpenTracker={() => onSwitchTab?.("sow_tracker")}
                  onOpenEmail={() => onSwitchTab?.("sow_email")}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/* ── Main component ────────────────────────────────────────────────── */

const StructuredSoWReportTab = ({
  title,
  subtitle,
  content,
  aiReportId,
  caseId,
  dbField,
  queryClient,
  emptyMessage = "No content available yet.",
  onExport,
  compliance,
  caseParties,
  embedAmlDashboard = false,
  onSwitchTab,
}: StructuredSoWReportTabProps) => {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [editedText, setEditedText] = useState("");
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(true);

  // Local mirror of the compliance payload so reviewer actions update
  // immediately without waiting for a refetch.
  const [localCompliance, setLocalCompliance] = useState<SectionCompliancePayload | null>(
    compliance ?? null,
  );
  useEffect(() => { setLocalCompliance(compliance ?? null); }, [compliance]);

  // Evidence viewer state
  const [evidenceViewerOpen, setEvidenceViewerOpen] = useState(false);
  const [evidenceViewerRefs, setEvidenceViewerRefs] = useState<EvidenceReference[]>([]);
  const [evidenceViewerHeading, setEvidenceViewerHeading] = useState("");
  const [evidenceViewerLabel, setEvidenceViewerLabel] = useState("");

  // Fetch evidence references for this report — fall back to mock data for UX validation
  const { data: evidenceRefs } = useEvidenceReferences(aiReportId);

  const sections = useMemo(() => {
    if (!content || editing) return [];
    const all = parseMarkdownSections(content);
    if (all.length > 0 && title && all[0].heading.replace(/\*\*/g, "").trim().toLowerCase() === title.replace(/\*\*/g, "").trim().toLowerCase()) {
      if (all[0].body.trim()) {
        all[0].heading = "Overview";
      } else {
        all.shift();
      }
    }

    // Suppress duplicated Executive Summary: when Section 1 ("Overall Risk
    // & Decision" or similar) already exists, drop a later standalone
    // "Executive Summary" heading whose body would just repeat it.
    const hasOverallRisk = all.some((s) =>
      /^(\d+\.\s*)?(overall\s+risk|risk\s+(?:and|&)\s+decision)/i.test(s.heading),
    );
    if (hasOverallRisk) {
      const filtered: ParsedSection[] = [];
      let droppedExec = false;
      for (const s of all) {
        if (!droppedExec && /^(\d+\.\s*)?executive\s+summary\b/i.test(s.heading)) {
          droppedExec = true;
          continue;
        }
        filtered.push(s);
      }
      return filtered;
    }
    return all;
  }, [content, editing, title]);

  const evidenceBySection = useMemo(() => {
    return groupBySection(evidenceRefs || []);
  }, [evidenceRefs]);

  // Group findings by the rendered heading they belong to.
  const findingsByHeading = useMemo(() => {
    if (!localCompliance?.findings?.length) return new Map<string, SectionFinding[]>();
    return groupFindingsByHeading(
      localCompliance.findings,
      sections.map((s) => s.heading),
    );
  }, [localCompliance, sections]);

  // Resolution lookup for every finding.
  const resolutionsByFinding = useMemo(() => {
    const map = new Map<string, SectionResolution | null>();
    if (!localCompliance) return map;
    for (const f of localCompliance.findings) {
      map.set(f.id, currentResolution(f.id, localCompliance.resolutions || []));
    }
    return map;
  }, [localCompliance]);

  // Header counters (open / resolved / promoted) across all findings.
  const findingTotals = useMemo(() => {
    const all = localCompliance?.findings ?? [];
    let open = 0, resolved = 0, promoted = 0;
    for (const f of all) {
      const r = resolutionsByFinding.get(f.id);
      if (!r) { open += 1; continue; }
      resolved += 1;
      if (r.action === "promoted") promoted += 1;
    }
    return { total: all.length, open, resolved, promoted };
  }, [localCompliance, resolutionsByFinding]);

  // Action handler: dispatches to the existing edge function and mirrors the
  // updated payload locally so the strip re-renders immediately.
  const handleFindingAction = async (
    findingId: string,
    action: SectionResolutionAction,
    opts?: { revertsResolutionId?: string; sourceResolutionId?: string; note?: string },
  ) => {
    if (!aiReportId) return;
    try {
      const result = await resolveFinding({
        aiReportId,
        findingId,
        action,
        note: opts?.note,
        revertsResolutionId: opts?.revertsResolutionId,
        sourceResolutionId: opts?.sourceResolutionId,
      });
      setLocalCompliance(result.compliance);
      // Mirror any merged report fields locally via the queryClient cache
      // so the user sees the updated text immediately.
      if (result.reportFields) {
        queryClient.invalidateQueries({ queryKey: ["sow_report", caseId] });
      }
      // Promote / merge / revert may all mutate the Enquiry Tracker — refresh it.
      const res = result.resolution as any;
      const trackerTouched =
        action === "promoted" ||
        action === "ai_merged" ||
        action === "reverted" ||
        !!res?.enquiry_item_id ||
        !!res?.withdrew_enquiry_item_id;
      if (trackerTouched) {
        queryClient.invalidateQueries({ queryKey: ["enquiry_rounds", caseId, "sow"] });
        queryClient.invalidateQueries({ queryKey: ["enquiry_items", caseId, "sow"] });
      }
      if (action === "promoted") {
        if (res?.promotion_skipped_reason === "already_promoted") {
          toast({ title: "Already in tracker", description: "This finding was previously promoted." });
        } else if (res?.enquiry_round_number) {
          toast({
            title: "Added to Enquiry Tracker",
            description: `Round ${res.enquiry_round_number} — open the Enquiries tab to review.`,
          });
        } else {
          toast({ title: "Promoted to enquiry" });
        }
      } else if (action === "ai_merged") {
        if (res?.enquiry_item_id && res?.enquiry_round_number) {
          toast({
            title: "Merged into report",
            description: `Also added to Enquiry Tracker (Round ${res.enquiry_round_number}).`,
          });
        } else {
          toast({ title: "Merged into report" });
        }
      } else {
        toast({ title: "Finding updated" });
      }
    } catch (e: any) {
      toast({ title: "Action failed", description: e.message, variant: "destructive" });
    }
  };

  useEffect(() => {
    if (content) setEditedText(content);
  }, [content]);

  const handleSave = async () => {
    if (!aiReportId || !dbField) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("ai_reports")
        .update({ [dbField]: editedText } as any)
        .eq("id", aiReportId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["ai_report", caseId] });
      queryClient.invalidateQueries({ queryKey: ["sow_report", caseId] });
      setEditing(false);
      toast({ title: `${title} saved` });
    } catch (e: any) {
      toast({ title: "Failed to save", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditedText(content || "");
    setEditing(false);
  };

  const stripForCopy = (text: string) =>
    text.replace(/\*\*/g, "").replace(/^#{1,4}\s+/gm, "");

  const handleViewEvidence = (refs: EvidenceReference[], heading: string) => {
    setEvidenceViewerRefs(refs);
    setEvidenceViewerHeading(heading);
    setEvidenceViewerLabel(refs[0]?.item_label || "");
    setEvidenceViewerOpen(true);
  };

  /** Open evidence viewer for a specific item (called from LSAG drilldown). */
  const handleOpenItemEvidence = (refs: EvidenceReference[], heading: string, label: string) => {
    setEvidenceViewerRefs(refs);
    setEvidenceViewerHeading(heading);
    setEvidenceViewerLabel(label);
    setEvidenceViewerOpen(true);
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
          </div>
          {content && (
            <div className="flex gap-2">
              {editing ? (
                <>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={handleCancel}>
                    <X size={14} /> Cancel
                  </Button>
                  <Button size="sm" className="gap-1.5" onClick={handleSave} disabled={saving}>
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    Save
                  </Button>
                </>
              ) : (
                <>
                  {aiReportId && dbField && (
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEditing(true)}>
                      <Pencil size={14} /> Edit
                    </Button>
                  )}
                  <CopyButton text={stripForCopy(content)} />
                  {onExport && (
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onExport(content)}>
                      <Download size={14} /> Export .docx
                    </Button>
                  )}
                </>
              )}
            </div>
          )}
        </CardHeader>
        <CardContent>
          {content ? (
            editing ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    Edit below. Changes will be saved to the database.
                  </p>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowPreview(!showPreview)}>
                    <Columns2 size={14} />
                    {showPreview ? "Hide Preview" : "Show Preview"}
                  </Button>
                </div>
                <div className={`grid gap-4 ${showPreview ? "grid-cols-2" : "grid-cols-1"}`}>
                  <Textarea
                    value={editedText}
                    onChange={(e) => setEditedText(e.target.value)}
                    className="min-h-[500px] font-mono text-sm leading-relaxed"
                    placeholder={`${title} content...`}
                  />
                  {showPreview && (
                    <div className="border rounded-md p-4 min-h-[500px] overflow-y-auto">
                      <div className="prose prose-sm prose-report max-w-none agent-output">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{editedText}</ReactMarkdown>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Findings header counter — at-a-glance reviewer chip group */}
                {findingTotals.total > 0 && (
                  <div className="flex flex-wrap items-center gap-2 text-[11px] rounded-md border border-border bg-muted/30 px-3 py-2">
                    <ShieldAlert size={12} className="text-muted-foreground" />
                    <span className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">
                      Section Compliance
                    </span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-foreground">
                      <span className="font-semibold text-risk-amber">{findingTotals.open}</span> open
                    </span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-foreground">
                      <span className="font-semibold">{findingTotals.resolved}</span> resolved
                    </span>
                    {findingTotals.promoted > 0 && (
                      <>
                        <span className="text-muted-foreground">·</span>
                        <span className="text-foreground">
                          <span className="font-semibold text-accent">{findingTotals.promoted}</span> promoted to enquiry
                        </span>
                      </>
                    )}
                  </div>
                )}

                {sections.map((section, idx) => {
                  const sectionKey = section.heading.toLowerCase().trim();
                  let sectionRefs = evidenceBySection.get(sectionKey) || [];

                  const isLsagSection =
                    sectionKey.includes("lsag") || sectionKey.includes("compliance checklist");
                  if (isLsagSection && sectionRefs.length === 0) {
                    const widened: EvidenceReference[] = [];
                    for (const [k, rows] of evidenceBySection.entries()) {
                      if (k.includes("lsag") || k.includes("genesis compliance") || k.includes("compliance checklist")) {
                        widened.push(...rows);
                      }
                    }
                    sectionRefs = widened;
                  }

                  const sectionFindings = findingsByHeading.get(sectionKey) ?? [];

                  return (
                    <SectionCard
                      key={idx}
                      section={section}
                      evidenceRefs={sectionRefs}
                      onViewEvidence={handleViewEvidence}
                      aiReportId={aiReportId}
                      onOpenItemEvidence={handleOpenItemEvidence}
                      caseHasNoEvidence={(evidenceRefs?.length ?? 0) === 0}
                      findings={sectionFindings}
                      resolutionsByFinding={resolutionsByFinding}
                      canResolve={!!aiReportId}
                      onFindingAction={handleFindingAction}
                      onSwitchTab={onSwitchTab}
                    />
                  );
                })}

                {/* Embedded AML Compliance Dashboard (replaces the old AML tab) */}
                {embedAmlDashboard && (
                  <SectionCard
                    section={{
                      heading: "AML Compliance Dashboard",
                      body: "",
                      severity: "info",
                      icon: ShieldAlert,
                      isChecklist: false,
                    }}
                    customBody={
                      <Suspense fallback={<p className="text-xs text-muted-foreground py-4">Loading AML dashboard…</p>}>
                        <div className="space-y-4">
                          {caseId && caseParties && (
                            <OFSISanctionsPanel caseParties={caseParties} caseId={caseId} />
                          )}
                          <AMLCheckSummary internalReport={content} />
                        </div>
                      </Suspense>
                    }
                  />
                )}
              </div>
            )
          ) : (
            <p className="text-sm text-muted-foreground text-center py-6">{emptyMessage}</p>
          )}
        </CardContent>
      </Card>

      {/* Evidence Viewer Dialog */}
      <EvidenceViewerDialog
        open={evidenceViewerOpen}
        onOpenChange={setEvidenceViewerOpen}
        references={evidenceViewerRefs}
        bucket="case-documents"
        caseId={caseId}
        sectionHeading={evidenceViewerHeading}
        itemLabel={evidenceViewerLabel}
      />
    </>
  );
};

export default memo(StructuredSoWReportTab);
