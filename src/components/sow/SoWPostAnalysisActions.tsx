import { useState } from "react";
import {
  Mail, FileSearch, AlertTriangle, CheckCircle2, FileText,
  ClipboardList, Download, ChevronRight, Loader2, ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface ActionItem {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  severity: "critical" | "warning" | "info" | "success";
  done: boolean;
}

interface SoWPostAnalysisActionsProps {
  resultText: string;
  hasEmail: boolean;
  hasMissingDocs: boolean;
  missingDocCount: number;
  onGoToEmail: () => void;
  onGoToEnquiries: () => void;
  onExportReport: () => void;
  onReRun: () => void;
  isLoading: boolean;
}

function parseRecommendedActions(text: string, hasEmail: boolean, hasMissingDocs: boolean, missingDocCount: number): ActionItem[] {
  const actions: ActionItem[] = [];
  const lower = text.toLowerCase();

  // Funding gap actions
  if (lower.includes("funding gap") || lower.includes("shortfall") || lower.includes("unexplained")) {
    actions.push({
      id: "funding_gap",
      label: "Address Funding Gap",
      description: "Request evidence to explain the identified shortfall in source of funds",
      icon: AlertTriangle,
      severity: "critical",
      done: false,
    });
  }

  // Missing documents
  if (hasMissingDocs) {
    actions.push({
      id: "missing_docs",
      label: `Upload Missing Documents (${missingDocCount})`,
      description: "Upload identified missing evidence for incremental analysis",
      icon: FileSearch,
      severity: "warning",
      done: false,
    });
  }

  // Client enquiry email
  if (hasEmail) {
    actions.push({
      id: "send_email",
      label: "Review & Send Client Enquiries",
      description: "Review the AI-drafted enquiry email and send to the client",
      icon: Mail,
      severity: "info",
      done: false,
    });
  }

  // Bank statement recency
  if (lower.includes("stale") || lower.includes("outdated") || (lower.includes("bank statement") && lower.includes("older"))) {
    actions.push({
      id: "stale_statements",
      label: "Request Updated Bank Statements",
      description: "Current statements are older than 3 months — request fresh copies",
      icon: FileText,
      severity: "warning",
      done: false,
    });
  }

  // Gift letter
  if ((lower.includes("gift") && (lower.includes("missing") || lower.includes("not provided") || lower.includes("required")))) {
    actions.push({
      id: "gift_letter",
      label: "Obtain Gift Declaration",
      description: "A signed gift letter/declaration is required for gifted funds",
      icon: ClipboardList,
      severity: "critical",
      done: false,
    });
  }

  // Always add export
  actions.push({
    id: "export",
    label: "Export Report for File",
    description: "Download the internal report for your compliance file",
    icon: Download,
    severity: "success",
    done: false,
  });

  return actions;
}

const severityStyles = {
  critical: { badge: "bg-[hsl(var(--risk-red))]/10 text-[hsl(var(--risk-red))] border-[hsl(var(--risk-red))]/20", dot: "bg-[hsl(var(--risk-red))]" },
  warning: { badge: "bg-[hsl(var(--risk-amber))]/10 text-[hsl(var(--risk-amber))] border-[hsl(var(--risk-amber))]/20", dot: "bg-[hsl(var(--risk-amber))]" },
  info: { badge: "bg-accent/10 text-accent border-accent/20", dot: "bg-accent" },
  success: { badge: "bg-[hsl(var(--risk-green))]/10 text-[hsl(var(--risk-green))] border-[hsl(var(--risk-green))]/20", dot: "bg-[hsl(var(--risk-green))]" },
};

export default function SoWPostAnalysisActions({
  resultText,
  hasEmail,
  hasMissingDocs,
  missingDocCount,
  onGoToEmail,
  onGoToEnquiries,
  onExportReport,
  onReRun,
  isLoading,
}: SoWPostAnalysisActionsProps) {
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const actions = parseRecommendedActions(resultText, hasEmail, hasMissingDocs, missingDocCount);

  if (actions.length === 0) return null;

  const handleAction = (id: string) => {
    switch (id) {
      case "send_email": onGoToEmail(); break;
      case "missing_docs": onGoToEnquiries(); break;
      case "export": onExportReport(); break;
      case "funding_gap":
      case "stale_statements":
      case "gift_letter":
        onGoToEnquiries();
        break;
    }
    setCompletedIds(prev => new Set(prev).add(id));
  };

  const pendingCount = actions.filter(a => !completedIds.has(a.id)).length;

  return (
    <div className="rounded-xl border border-accent/20 bg-accent/5 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5 uppercase tracking-wider">
          <ArrowRight size={12} className="text-accent" /> Recommended Next Steps
        </h3>
        <Badge variant="secondary" className="text-[10px] h-5">
          {pendingCount} pending
        </Badge>
      </div>

      <div className="space-y-1.5">
        {actions.map((action) => {
          const done = completedIds.has(action.id);
          const style = severityStyles[action.severity];
          return (
            <button
              key={action.id}
              onClick={() => handleAction(action.id)}
              disabled={isLoading}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all text-left group ${
                done
                  ? "border-[hsl(var(--risk-green))]/20 bg-[hsl(var(--risk-green))]/5 opacity-60"
                  : "border-border bg-background hover:bg-muted/50 hover:shadow-sm"
              }`}
            >
              <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${
                done ? "bg-[hsl(var(--risk-green))]/10" : style.badge
              }`}>
                {done ? (
                  <CheckCircle2 size={12} className="text-[hsl(var(--risk-green))]" />
                ) : (
                  <action.icon size={12} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-[11px] font-semibold leading-tight ${done ? "line-through text-muted-foreground" : "text-foreground"}`}>
                  {action.label}
                </p>
                <p className="text-[10px] text-muted-foreground truncate">{action.description}</p>
              </div>
              {!done && <ChevronRight size={12} className="text-muted-foreground shrink-0 group-hover:text-foreground" />}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Button
          variant="outline"
          size="sm"
          className="text-[10px] h-6 gap-1"
          onClick={onReRun}
          disabled={isLoading}
        >
          {isLoading ? <Loader2 size={10} className="animate-spin" /> : null}
          Re-Run Analysis
        </Button>
      </div>
    </div>
  );
}
