import { useState, useEffect, memo } from "react";
import { Pencil, X, Save, Download, Copy, Check, Loader2, Columns2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useOptimisticSave } from "@/hooks/useOptimisticSave";
import ConflictResolutionModal from "@/components/ConflictResolutionModal";
import type { QueryClient } from "@tanstack/react-query";

interface EditableReportTabProps {
  title: string;
  subtitle?: string;
  content: string | null | undefined;
  aiReportId?: string | undefined;
  caseId?: string;
  dbField?: "client_report" | "internal_report" | "draft_email";
  queryClient: QueryClient;
  emptyMessage?: string;
  onExport?: (text: string) => void;
  /** If true, render as plain text (no markdown) */
  plainText?: boolean;
  /** Strip patterns for copy (applied before copying) */
  copyStripPatterns?: RegExp[];
  /** Strip patterns for display (applied before rendering) */
  displayStripPatterns?: RegExp[];
  /** Current version of the ai_report row for OCC (H2 fix) */
  reportVersion?: number;
  /** Callback when version changes after save */
  onVersionChange?: (newVersion: number) => void;
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

const EditableReportTab = ({
  title,
  subtitle,
  content,
  aiReportId,
  caseId,
  dbField,
  queryClient,
  emptyMessage = "No content available yet.",
  onExport,
  plainText = false,
  copyStripPatterns = [/\*\*/g, /^#{1,4}\s+/gm],
  displayStripPatterns = [],
  reportVersion = 1,
  onVersionChange,
}: EditableReportTabProps) => {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [editedText, setEditedText] = useState("");
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const { save: optimisticSave, forceSave, conflictState, dismissConflict } = useOptimisticSave();

  useEffect(() => {
    if (content) setEditedText(content);
  }, [content]);

  const handleSave = async () => {
    if (!aiReportId || !dbField) return;
    setSaving(true);
    try {
      const success = await optimisticSave({
        table: "ai_reports",
        id: aiReportId,
        expectedVersion: reportVersion,
        data: { [dbField]: editedText },
        onSuccess: (newVersion) => {
          onVersionChange?.(newVersion);
          queryClient.invalidateQueries({ queryKey: ["ai_report", caseId] });
          setEditing(false);
          toast({ title: `${title} saved` });
        },
      });
      if (!success && !conflictState.isConflict) {
        // Non-conflict failure already toasted by useOptimisticSave
      }
    } finally {
      setSaving(false);
    }
  };

  const handleForceKeepMine = async () => {
    if (!conflictState.pendingOptions) return;
    setSaving(true);
    await forceSave(conflictState.pendingOptions);
    queryClient.invalidateQueries({ queryKey: ["ai_report", caseId] });
    setEditing(false);
    setSaving(false);
  };

  const handleUseServer = () => {
    dismissConflict();
    queryClient.invalidateQueries({ queryKey: ["ai_report", caseId] });
    setEditing(false);
  };

  const handleCancel = () => {
    setEditedText(content || "");
    setEditing(false);
  };

  const stripForDisplay = (text: string) => {
    let result = text;
    for (const pattern of displayStripPatterns) {
      result = result.replace(pattern, "");
    }
    return result;
  };

  const displayText = editing ? editedText : (content || "");

  const stripForCopy = (text: string) => {
    let result = text;
    for (const pattern of copyStripPatterns) {
      result = result.replace(pattern, "");
    }
    return result;
  };

  const renderContent = (text: string) => {
    const cleaned = stripForDisplay(text);
    if (plainText) {
      const strippedText = stripForCopy(cleaned);
      return (
        <div className="report-content bg-muted/30 rounded-lg p-5 text-sm space-y-4 whitespace-pre-wrap">
          {strippedText}
        </div>
      );
    }
    return (
      <div className="report-content agent-output prose prose-sm max-w-none text-foreground prose-headings:text-foreground prose-p:text-muted-foreground">
        <ReactMarkdown rehypePlugins={[rehypeRaw]}>{cleaned}</ReactMarkdown>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          {subtitle && (
            <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
          )}
        </div>
        {content && (
          <div className="flex gap-2">
            {aiReportId && dbField && editing ? (
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
                <CopyButton text={stripForCopy(displayText)} />
                {onExport && (
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onExport(displayText)}>
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
                  <div className="report-content border rounded-md p-4 min-h-[500px] overflow-y-auto">
                    {plainText ? (
                      <div className="text-sm whitespace-pre-wrap">{editedText}</div>
                    ) : (
                      <div className="prose prose-sm max-w-none text-foreground prose-headings:text-foreground prose-p:text-muted-foreground agent-output">
                        <ReactMarkdown rehypePlugins={[rehypeRaw]}>{editedText}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            renderContent(displayText)
          )
        ) : (
          <p className="text-sm text-muted-foreground text-center py-6">{emptyMessage}</p>
        )}
      </CardContent>

      {/* H2 Fix: Conflict resolution modal for concurrent edits */}
      <ConflictResolutionModal
        open={conflictState.isConflict}
        onKeepMine={handleForceKeepMine}
        onUseServer={handleUseServer}
        entityName="report"
      />
    </Card>
  );
};

export default memo(EditableReportTab);
