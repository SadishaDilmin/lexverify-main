import { useState } from "react";
import { ArrowLeftRight, Plus, Minus, Equal, ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface SoWComparisonViewProps {
  previousResult: string;
  currentResult: string;
  onDismiss: () => void;
}

interface DiffItem {
  type: "added" | "removed" | "unchanged";
  section: string;
  summary: string;
}

function extractSections(text: string): Map<string, string> {
  const sections = new Map<string, string>();
  if (!text) return sections;

  // Split by markdown headings
  const parts = text.split(/(?=^#{1,3}\s)/m);
  for (const part of parts) {
    const headingMatch = part.match(/^#{1,3}\s+(.+)/);
    const heading = headingMatch?.[1]?.trim() || "General";
    sections.set(heading, part.trim());
  }
  return sections;
}

function computeDiff(prev: string, curr: string): DiffItem[] {
  const prevSections = extractSections(prev);
  const currSections = extractSections(curr);
  const items: DiffItem[] = [];

  // Check for new sections
  for (const [heading, content] of currSections) {
    if (!prevSections.has(heading)) {
      items.push({ type: "added", section: heading, summary: "New section added" });
    } else {
      const prevContent = prevSections.get(heading) || "";
      // Simple content comparison
      const prevLen = prevContent.length;
      const currLen = content.length;
      const similarity = Math.min(prevLen, currLen) / Math.max(prevLen, currLen);

      if (similarity < 0.7) {
        items.push({ type: "added", section: heading, summary: "Significantly updated" });
      } else if (similarity < 0.95) {
        items.push({ type: "unchanged", section: heading, summary: "Minor updates" });
      }
    }
  }

  // Check for removed sections
  for (const [heading] of prevSections) {
    if (!currSections.has(heading)) {
      items.push({ type: "removed", section: heading, summary: "Section removed" });
    }
  }

  // Check for risk level changes
  const prevRisk = extractRiskLevel(prev);
  const currRisk = extractRiskLevel(curr);
  if (prevRisk && currRisk && prevRisk !== currRisk) {
    items.unshift({
      type: "added",
      section: "Risk Level Change",
      summary: `${prevRisk} → ${currRisk}`,
    });
  }

  // Check for resolved issues
  const prevMissing = countKeyword(prev, "missing");
  const currMissing = countKeyword(curr, "missing");
  if (prevMissing > currMissing && currMissing >= 0) {
    items.unshift({
      type: "added",
      section: "Issues Resolved",
      summary: `${prevMissing - currMissing} previously flagged issue(s) now resolved`,
    });
  }

  return items;
}

function extractRiskLevel(text: string): string | null {
  const lower = text.toLowerCase();
  if (lower.includes("high risk") || lower.includes("high aml")) return "High";
  if (lower.includes("medium risk") || lower.includes("moderate risk")) return "Medium";
  if (lower.includes("low risk")) return "Low";
  return null;
}

function countKeyword(text: string, keyword: string): number {
  const regex = new RegExp(keyword, "gi");
  return (text.match(regex) || []).length;
}

const typeConfig = {
  added: { icon: Plus, color: "text-[hsl(var(--risk-green))]", bg: "bg-[hsl(var(--risk-green))]/10", label: "Updated" },
  removed: { icon: Minus, color: "text-[hsl(var(--risk-red))]", bg: "bg-[hsl(var(--risk-red))]/10", label: "Removed" },
  unchanged: { icon: Equal, color: "text-muted-foreground", bg: "bg-muted", label: "Minor" },
};

export default function SoWComparisonView({ previousResult, currentResult, onDismiss }: SoWComparisonViewProps) {
  const [expanded, setExpanded] = useState(true);
  const diffs = computeDiff(previousResult, currentResult);

  if (diffs.length === 0) return null;

  const addedCount = diffs.filter(d => d.type === "added").length;
  const removedCount = diffs.filter(d => d.type === "removed").length;

  return (
    <div className="rounded-xl border border-accent/20 bg-accent/5 p-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 text-xs font-semibold text-foreground uppercase tracking-wider hover:text-accent transition-colors"
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <ArrowLeftRight size={12} className="text-accent" />
          Changes Since Last Run
        </button>
        <div className="flex items-center gap-1.5">
          {addedCount > 0 && (
            <Badge variant="secondary" className="text-[9px] h-4 bg-[hsl(var(--risk-green))]/10 text-[hsl(var(--risk-green))]">
              +{addedCount} updated
            </Badge>
          )}
          {removedCount > 0 && (
            <Badge variant="secondary" className="text-[9px] h-4 bg-[hsl(var(--risk-red))]/10 text-[hsl(var(--risk-red))]">
              -{removedCount} removed
            </Badge>
          )}
          <Button variant="ghost" size="sm" className="h-5 text-[10px] px-1.5" onClick={onDismiss}>
            Dismiss
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="space-y-1">
          {diffs.map((diff, i) => {
            const cfg = typeConfig[diff.type];
            return (
              <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/30 transition-colors">
                <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${cfg.bg}`}>
                  <cfg.icon size={10} className={cfg.color} />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-[11px] font-medium text-foreground">{diff.section}</span>
                  <span className="text-[10px] text-muted-foreground ml-1.5">— {diff.summary}</span>
                </div>
                <Badge variant="outline" className={`text-[9px] h-4 ${cfg.color}`}>{cfg.label}</Badge>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
