import { useState, useCallback } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Eye, Loader2, SkipForward, Save, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { ClassifiedFile } from "@/components/BulkAMLUpload";

export interface DuplicateCandidate {
  /** The classified file that was flagged as a duplicate */
  classified: ClassifiedFile;
  /** Name of the existing file it matched */
  matchedFileName: string;
  /** AI reason for flagging */
  reason: string;
}

interface DuplicateDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  duplicates: DuplicateCandidate[];
  existingFiles: Array<{ name: string; category: string; personName: string; description: string }>;
  onResolve: (accepted: ClassifiedFile[]) => void;
}

export default function DuplicateDocumentDialog({
  open,
  onOpenChange,
  duplicates,
  existingFiles,
  onResolve,
}: DuplicateDocumentDialogProps) {
  const { toast } = useToast();
  const [items, setItems] = useState(() =>
    duplicates.map((d) => ({
      ...d,
      newName: d.classified.file.name,
      checking: false,
      skipped: false,
      accepted: false,
      error: "",
    }))
  );
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);

  const CHECK_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/check-duplicate-doc`;

  const handleRename = useCallback(async (idx: number) => {
    const item = items[idx];
    if (!item.newName.trim()) {
      toast({ title: "File name required", variant: "destructive" });
      return;
    }

    setItems((prev) => prev.map((it, i) => i === idx ? { ...it, checking: true, error: "" } : it));

    try {
      const resp = await fetch(CHECK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          file: { name: item.newName.trim(), mimeType: item.classified.file.mimeType },
          existingFiles,
        }),
      });

      const data = await resp.json();

      if (data.isDuplicate) {
        setItems((prev) =>
          prev.map((it, i) =>
            i === idx ? { ...it, checking: false, error: `Still a duplicate: ${data.reason}` } : it
          )
        );
        toast({ title: "Still a duplicate", description: data.reason, variant: "destructive" });
      } else {
        setItems((prev) =>
          prev.map((it, i) =>
            i === idx ? { ...it, checking: false, accepted: true, error: "" } : it
          )
        );
        toast({ title: "File accepted", description: `"${item.newName.trim()}" is unique.` });
      }
    } catch (err: any) {
      setItems((prev) =>
        prev.map((it, i) =>
          i === idx ? { ...it, checking: false, error: err.message } : it
        )
      );
    }
  }, [items, existingFiles, CHECK_URL, toast]);

  const handleSkip = useCallback((idx: number) => {
    setItems((prev) => prev.map((it, i) => i === idx ? { ...it, skipped: true } : it));
  }, []);

  const handleDone = useCallback(() => {
    const accepted = items
      .filter((it) => it.accepted)
      .map((it) => ({
        ...it.classified,
        file: { ...it.classified.file, name: it.newName.trim() },
      }));
    onResolve(accepted);
    onOpenChange(false);
  }, [items, onResolve, onOpenChange]);

  const allResolved = items.every((it) => it.skipped || it.accepted);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-[95vw] max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-base">
            <AlertTriangle size={18} className="text-amber-500" />
            Duplicate Documents Detected
          </DialogTitle>
          <DialogDescription className="text-xs">
            The following files appear to be duplicates of documents already uploaded.
            You can rename them to add as separate files, or skip them.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
          {items.map((item, idx) => (
            <div
              key={item.classified.id}
              className={`rounded-lg border p-3 space-y-2 transition-colors ${
                item.skipped
                  ? "border-muted bg-muted/20 opacity-60"
                  : item.accepted
                  ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20"
                  : "border-border bg-background"
              }`}
            >
              <div className="flex items-start gap-2">
                <FileText size={14} className="text-accent mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {item.classified.file.name}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Matches: <span className="font-medium">{item.matchedFileName}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">{item.reason}</p>
                  <Badge variant="outline" className="text-[9px] mt-1">
                    {item.classified.category}
                  </Badge>
                </div>

                {/* Preview button — inline base64 preview */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => setPreviewIdx(previewIdx === idx ? null : idx)}
                  title="Preview document"
                >
                  <Eye size={14} />
                </Button>
              </div>

              {/* Inline preview */}
              {previewIdx === idx && (
                <div className="border border-border rounded bg-muted/20 overflow-hidden max-h-[300px]">
                  {item.classified.file.mimeType?.startsWith("image/") ? (
                    <img
                      src={`data:${item.classified.file.mimeType};base64,${item.classified.file.base64}`}
                      alt={item.classified.file.name}
                      className="max-w-full max-h-[280px] mx-auto object-contain"
                    />
                  ) : item.classified.file.mimeType === "application/pdf" ? (
                    <iframe
                      src={`data:application/pdf;base64,${item.classified.file.base64}`}
                      className="w-full h-[280px] border-0"
                      title={item.classified.file.name}
                    />
                  ) : (
                    <div className="p-4 text-xs text-muted-foreground text-center">
                      Preview not available for this file type. Use the rename option below.
                    </div>
                  )}
                </div>
              )}

              {/* Rename & actions */}
              {!item.skipped && !item.accepted && (
                <div className="flex items-center gap-2">
                  <Input
                    value={item.newName}
                    onChange={(e) =>
                      setItems((prev) =>
                        prev.map((it, i) => i === idx ? { ...it, newName: e.target.value, error: "" } : it)
                      )
                    }
                    placeholder="Enter new filename…"
                    className="h-8 text-xs flex-1"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1 h-8 text-xs"
                    onClick={() => handleRename(idx)}
                    disabled={item.checking}
                  >
                    {item.checking ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                    Rename &amp; Add
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1 h-8 text-xs text-muted-foreground"
                    onClick={() => handleSkip(idx)}
                  >
                    <SkipForward size={12} />
                    Skip
                  </Button>
                </div>
              )}

              {item.error && (
                <p className="text-xs text-destructive">{item.error}</p>
              )}

              {item.accepted && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                  ✓ Renamed to "{item.newName}" — will be added
                </p>
              )}
              {item.skipped && (
                <p className="text-xs text-muted-foreground italic">Skipped — not added</p>
              )}
            </div>
          ))}
        </div>

        <DialogFooter className="px-5 py-3 border-t border-border">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleDone}
            disabled={!allResolved}
            className="gap-1.5"
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
