import { useMemo } from "react";
import {
  FileUp, Play, Mail, ShieldCheck, AlertTriangle, CheckCircle2,
  Clock, UserPlus, Landmark, ScrollText, Archive, Edit, MessageSquare,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface AuditEntry {
  id: string;
  event_type: string;
  user_name: string;
  user_position: string;
  created_at: string;
  metadata: any;
}

interface CaseTimelineViewProps {
  auditLog: AuditEntry[];
  caseCreatedAt: string;
  caseStatus: string;
}

const EVENT_CONFIG: Record<string, { icon: typeof Clock; label: string; color: string }> = {
  case_created: { icon: UserPlus, label: "Case Created", color: "text-accent" },
  document_uploaded: { icon: FileUp, label: "Document Uploaded", color: "text-[hsl(var(--risk-amber))]" },
  ai_review_started: { icon: Play, label: "AI Review Started", color: "text-accent" },
  ai_review_completed: { icon: ShieldCheck, label: "AI Review Completed", color: "text-[hsl(var(--risk-green))]" },
  ai_report_modified: { icon: Edit, label: "Report Modified", color: "text-[hsl(var(--risk-amber))]" },
  risk_flagged: { icon: AlertTriangle, label: "Risk Flagged", color: "text-[hsl(var(--risk-red))]" },
  case_completed: { icon: Archive, label: "Case Completed", color: "text-[hsl(var(--risk-green))]" },
  draft_email_sent: { icon: Mail, label: "Email Drafted", color: "text-accent" },
  sow_analysis_run: { icon: Landmark, label: "Olimey AI Run", color: "text-accent" },
  draft_review_run: { icon: ScrollText, label: "TitleShield™ Run", color: "text-accent" },
  feedback_submitted: { icon: MessageSquare, label: "Feedback", color: "text-muted-foreground" },
  sow_ai_note_added: { icon: Edit, label: "AI Note Added", color: "text-accent" },
};

const DEFAULT_CONFIG = { icon: Clock, label: "Event", color: "text-muted-foreground" };

export default function CaseTimelineView({ auditLog, caseCreatedAt, caseStatus }: CaseTimelineViewProps) {
  const timelineEvents = useMemo(() => {
    const events = auditLog
      .slice()
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    // Group consecutive same-type events
    const grouped: Array<AuditEntry & { count: number }> = [];
    for (const e of events) {
      const last = grouped[grouped.length - 1];
      if (last && last.event_type === e.event_type && last.user_name === e.user_name) {
        last.count++;
        last.created_at = e.created_at; // use latest timestamp
      } else {
        grouped.push({ ...e, count: 1 });
      }
    }
    return grouped;
  }, [auditLog]);

  if (timelineEvents.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          No timeline events yet. Actions on this case will appear here.
        </CardContent>
      </Card>
    );
  }

  const formatDate = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  };
  const formatTime = (d: string) => {
    const date = new Date(d);
    return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Clock size={16} className="text-accent" />
          Case Timeline
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Horizontal scrollable timeline */}
        <div className="overflow-x-auto pb-2">
          <div className="flex items-start gap-0 min-w-max">
            {timelineEvents.map((event, idx) => {
              const config = EVENT_CONFIG[event.event_type] || DEFAULT_CONFIG;
              const Icon = config.icon;
              const isLast = idx === timelineEvents.length - 1;

              return (
                <div key={event.id} className="flex items-start">
                  <div className="flex flex-col items-center min-w-[120px] max-w-[140px]">
                    {/* Node */}
                    <div className={`w-8 h-8 rounded-full border-2 border-border bg-background flex items-center justify-center shadow-sm ${isLast ? "ring-2 ring-accent/30" : ""}`}>
                      <Icon size={14} className={config.color} />
                    </div>
                    {/* Label */}
                    <div className="mt-2 text-center px-1">
                      <p className="text-[10px] font-semibold text-foreground leading-tight">
                        {config.label}
                        {event.count > 1 && (
                          <Badge variant="secondary" className="ml-1 text-[8px] h-3.5 px-1">
                            ×{event.count}
                          </Badge>
                        )}
                      </p>
                      <p className="text-[9px] text-muted-foreground mt-0.5">{event.user_name}</p>
                      <p className="text-[9px] text-muted-foreground">
                        {formatDate(event.created_at)} · {formatTime(event.created_at)}
                      </p>
                    </div>
                  </div>
                  {/* Connector line */}
                  {!isLast && (
                    <div className="h-[2px] w-8 bg-border mt-4 shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Status summary */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
          <span className="text-[10px] text-muted-foreground">
            {timelineEvents.length} event{timelineEvents.length !== 1 ? "s" : ""} · Started {formatDate(caseCreatedAt)}
          </span>
          <Badge variant={caseStatus === "completed" ? "default" : "secondary"} className="text-[10px]">
            {caseStatus === "completed" ? (
              <><CheckCircle2 size={10} className="mr-1" /> Completed</>
            ) : (
              <><Clock size={10} className="mr-1" /> {caseStatus}</>
            )}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
