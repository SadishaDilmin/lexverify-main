import { useState, useEffect, memo, useMemo } from "react";
import {
  Pencil, X, Save, Download, Copy, Check, Loader2, Columns2, FileDown,
  FileText, Shield, AlertTriangle, CheckCircle2, MapPin, Droplets, Leaf, Zap,
  Building2, Scale, Search, Info, ChevronDown, ChevronRight, ShieldAlert,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

import type { QueryClient } from "@tanstack/react-query";

interface StructuredReportTabProps {
  title: string;
  subtitle?: string;
  content: string | null | undefined;
  aiReportId?: string;
  caseId?: string;
  dbField?: "client_report" | "internal_report" | "draft_email";
  queryClient: QueryClient;
  emptyMessage?: string;
  onExport?: (text: string) => void;
  onExportPdf?: () => void;
}

interface ParsedSection {
  heading: string;
  body: string;
  severity: "high" | "medium" | "low" | "info" | "good";
  icon: typeof FileText;
}

const SEVERITY_STYLES: Record<string, { badge: string; border: string; icon: string }> = {
  high: {
    badge: "bg-destructive/10 text-destructive border-destructive/30",
    border: "border-l-destructive/60",
    icon: "text-destructive",
  },
  medium: {
    badge: "bg-risk-amber/10 text-risk-amber border-risk-amber/30",
    border: "border-l-risk-amber/60",
    icon: "text-risk-amber",
  },
  low: {
    badge: "bg-risk-green/10 text-risk-green border-risk-green/30",
    border: "border-l-risk-green/60",
    icon: "text-risk-green",
  },
  good: {
    badge: "bg-risk-green/10 text-risk-green border-risk-green/30",
    border: "border-l-risk-green/60",
    icon: "text-risk-green",
  },
  info: {
    badge: "bg-accent/10 text-accent border-accent/30",
    border: "border-l-accent/40",
    icon: "text-accent",
  },
};

const SEVERITY_LABELS: Record<string, string> = {
  high: "High Risk",
  medium: "Medium Risk",
  low: "Low Risk",
  good: "Satisfactory",
  info: "Info",
};

function detectSeverity(text: string): "high" | "medium" | "low" | "info" | "good" {
  const upper = text.toUpperCase();
  if (/HIGH\s*RISK|RED\s*FLAG|CRITICAL|URGENT|SIGNIFICANT\s*CONCERN|MAJOR\s*ISSUE/.test(upper)) return "high";
  if (/MEDIUM\s*RISK|MODERATE|CAUTION|ADVISORY|POTENTIAL\s*CONCERN|MINOR\s*ISSUE/.test(upper)) return "medium";
  if (/LOW\s*RISK|MINIMAL|NO\s*SIGNIFICANT|NEGLIGIBLE/.test(upper)) return "low";
  if (/SATISFACTORY|NO\s*ISSUES|NO\s*CONCERNS|COMPLIANT|CLEAR|ACCEPTABLE|NO\s*ADVERSE|STANDARD|NORMAL|UNREMARKABLE/.test(upper)) return "good";
  return "info";
}

function pickIcon(heading: string): typeof FileText {
  const h = heading.toLowerCase();
  if (/local\s*(authority|search)/.test(h)) return MapPin;
  if (/drainage|water/.test(h)) return Droplets;
  if (/environment/.test(h)) return Leaf;
  if (/epc|energy/.test(h)) return Zap;
  if (/risk|score/.test(h)) return AlertTriangle;
  if (/summar|overview|executive/.test(h)) return Info;
  if (/lender|mortgage/.test(h)) return Building2;
  if (/compliance|qa|quality/.test(h)) return Shield;
  if (/legal|covenant|easement/.test(h)) return Scale;
  if (/search/.test(h)) return Search;
  if (/defect|title/.test(h)) return ShieldAlert;
  if (/recommend|action|next/.test(h)) return CheckCircle2;
  return FileText;
}

function parseMarkdownSections(markdown: string): ParsedSection[] {
  const lines = markdown.split("\n");
  const sections: ParsedSection[] = [];
  let currentHeading = "";
  let currentBody: string[] = [];

  const flush = () => {
    if (currentHeading || currentBody.length > 0) {
      const body = currentBody.join("\n").trim();
      const heading = currentHeading || "Overview";
      sections.push({
        heading,
        body,
        severity: detectSeverity(heading + " " + body),
        icon: pickIcon(heading),
      });
    }
    currentBody = [];
  };

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,4}\s+(.+)/);
    if (headingMatch) {
      flush();
      currentHeading = headingMatch[1].trim();
    } else {
      currentBody.push(line);
    }
  }
  flush();

  return sections;
}

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

const SectionCard = ({ section }: { section: ParsedSection }) => {
  const [open, setOpen] = useState(true);
  const style = SEVERITY_STYLES[section.severity];
  const Icon = section.icon;

  return (
    <div className="p-4 rounded-lg border border-border bg-card space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon
            size={16}
            className={style.icon}
          />
          <span className="text-sm font-semibold text-foreground">{section.heading}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="outline" className={`text-[10px] ${style.badge}`}>
            {SEVERITY_LABELS[section.severity]}
          </Badge>
          <button onClick={() => setOpen(!open)} className="text-muted-foreground hover:text-foreground transition-colors">
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        </div>
      </div>
      {open && (
        <div className="prose prose-sm prose-report max-w-none agent-output">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{section.body}</ReactMarkdown>
        </div>
      )}
      {section.severity !== "info" && section.severity !== "good" && open && (
        <div className="p-2 rounded bg-muted/60 border border-border">
          <p className="text-[10px] text-foreground">
            <ShieldAlert size={10} className="inline mr-1 text-accent" />
            <span className="font-medium">Risk level:</span> {SEVERITY_LABELS[section.severity]}
          </p>
        </div>
      )}
    </div>
  );
};

const StructuredReportTab = ({
  title,
  subtitle,
  content,
  aiReportId,
  caseId,
  dbField,
  queryClient,
  emptyMessage = "No content available yet.",
  onExport,
  onExportPdf,
}: StructuredReportTabProps) => {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [editedText, setEditedText] = useState("");
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(true);

  useEffect(() => {
    if (content) setEditedText(content);
  }, [content]);

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
    return all;
  }, [content, editing, title]);

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

  

  return (
    <div className="space-y-4">
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
                  {onExportPdf && (
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={onExportPdf}>
                      <FileDown size={14} /> Export PDF
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
                {sections.map((section, idx) => (
                  <SectionCard key={idx} section={section} />
                ))}
              </div>
            )
          ) : (
            <p className="text-sm text-muted-foreground text-center py-6">{emptyMessage}</p>
          )}
        </CardContent>
      </Card>

    </div>
  );
};

export default memo(StructuredReportTab);
