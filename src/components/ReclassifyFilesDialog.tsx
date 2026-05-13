/**
 * Dialog for reviewing and acting on existing-file classification suggestions.
 * Non-destructive, user-controlled, suggestion-first.
 */

import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowRight, Check, FolderOpen, Loader2, ScanSearch, Sparkles, X, RefreshCw,
} from "lucide-react";
import { getFolderLabel } from "@/lib/caseFolders";
import type { ExistingFileSuggestion, ScanProgress } from "@/hooks/useExistingFileClassification";

interface ReclassifyFilesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suggestions: ExistingFileSuggestion[];
  progress: ScanProgress;
  onScan: (includeAll?: boolean) => void;
  onMoveSelected: () => Promise<number>;
  onDismiss: (suggestion: ExistingFileSuggestion) => void;
  onDismissAll: () => void;
  onToggle: (index: number) => void;
  onToggleAll: (selected: boolean) => void;
  onMoveComplete?: () => void;
}

export default function ReclassifyFilesDialog({
  open,
  onOpenChange,
  suggestions,
  progress,
  onScan,
  onMoveSelected,
  onDismiss,
  onDismissAll,
  onToggle,
  onToggleAll,
  onMoveComplete,
}: ReclassifyFilesDialogProps) {
  const [moving, setMoving] = useState(false);
  const [movedCount, setMovedCount] = useState<number | null>(null);

  const isScanning = progress.phase === "listing" || progress.phase === "downloading" || progress.phase === "classifying";
  const isDone = progress.phase === "done";
  const selectedCount = suggestions.filter((s) => s.selected).length;
  const highCount = suggestions.filter((s) => s.confidence === "high").length;

  const handleMoveSelected = async () => {
    setMoving(true);
    const count = await onMoveSelected();
    setMovedCount(count);
    setMoving(false);
    if (count > 0) onMoveComplete?.();
  };

  const progressPercent = progress.totalFiles > 0
    ? Math.round((progress.processedFiles / progress.totalFiles) * 100)
    : 0;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setMovedCount(null); } onOpenChange(v); }}>
        <DialogContent className="max-w-2xl h-[85vh] !flex !flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ScanSearch size={18} className="text-accent" />
              Review Existing Files
            </DialogTitle>
            <DialogDescription>
              Scan your case files to identify documents that may be in the wrong folder.
              No files will be moved without your approval.
            </DialogDescription>
          </DialogHeader>

          {/* Pre-scan state */}
          {progress.phase === "idle" && suggestions.length === 0 && movedCount === null && (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center">
                <ScanSearch size={28} className="text-accent" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">Scan case files for misclassifications</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                  This will analyse each document using AI to check if it belongs in a different folder.
                  Files you've previously dismissed won't be re-suggested.
                </p>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => onScan(false)} className="gap-1.5 bg-accent text-accent-foreground hover:bg-accent/90">
                  <ScanSearch size={14} />
                  Scan Unreviewed Files
                </Button>
                <Button variant="outline" onClick={() => onScan(true)} className="gap-1.5 text-xs">
                  <RefreshCw size={14} />
                  Rescan All Files
                </Button>
              </div>
            </div>
          )}

          {/* Scanning progress */}
          {isScanning && (
            <div className="py-8 space-y-4">
              <div className="flex items-center justify-center gap-2 text-sm text-foreground">
                <Loader2 size={16} className="animate-spin text-accent" />
                {progress.phase === "listing" && "Listing case files…"}
                {progress.phase === "downloading" && "Downloading files for analysis…"}
                {progress.phase === "classifying" && "Classifying documents…"}
              </div>
              <Progress value={progressPercent} className="h-2" />
              <div className="text-center text-xs text-muted-foreground">
                {progress.processedFiles} / {progress.totalFiles} files processed
                {progress.currentFile && (
                  <span className="block mt-1 truncate max-w-md mx-auto">{progress.currentFile}</span>
                )}
              </div>
            </div>
          )}

          {/* Error state */}
          {progress.phase === "error" && (
            <div className="py-6 text-center space-y-3">
              <p className="text-sm text-destructive">{progress.errorMessage || "Scan failed"}</p>
              <Button variant="outline" onClick={() => onScan(false)} className="gap-1.5">
                <RefreshCw size={14} />
                Retry
              </Button>
            </div>
          )}

          {/* Results: no suggestions found */}
          {isDone && suggestions.length === 0 && movedCount === null && (
            <div className="flex flex-col items-center gap-3 py-8">
              <div className="w-14 h-14 rounded-full bg-green-100 dark:bg-green-950/30 flex items-center justify-center">
                <Check size={24} className="text-green-600 dark:text-green-400" />
              </div>
              <p className="text-sm font-medium text-foreground">All files are correctly filed</p>
              <p className="text-xs text-muted-foreground">
                {progress.totalFiles} file{progress.totalFiles !== 1 ? "s" : ""} scanned — no misclassifications detected.
              </p>
            </div>
          )}

          {/* Success after move */}
          {movedCount !== null && suggestions.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-8">
              <div className="w-14 h-14 rounded-full bg-green-100 dark:bg-green-950/30 flex items-center justify-center">
                <Check size={24} className="text-green-600 dark:text-green-400" />
              </div>
              <p className="text-sm font-medium text-foreground">
                {movedCount} file{movedCount !== 1 ? "s" : ""} moved successfully
              </p>
            </div>
          )}

          {/* Suggestion list */}
          {suggestions.length > 0 && (
            <div className="min-h-0 flex-1 flex flex-col">
              <div className="flex items-center justify-between px-1 mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-foreground">
                    {suggestions.length} suggestion{suggestions.length !== 1 ? "s" : ""}
                  </span>
                  {highCount > 0 && (
                    <Badge variant="secondary" className="text-[10px] h-5">
                      {highCount} high confidence
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="text-[11px] text-accent hover:underline"
                    onClick={() => onToggleAll(true)}
                  >
                    Select all
                  </button>
                  <span className="text-muted-foreground text-[11px]">·</span>
                  <button
                    className="text-[11px] text-muted-foreground hover:underline"
                    onClick={() => onToggleAll(false)}
                  >
                    Deselect all
                  </button>
                </div>
              </div>

              <ScrollArea type="always" className="min-h-0 flex-1 -mx-2 px-2">
                <div className="space-y-2">
                  {suggestions.map((s, i) => (
                    <div
                      key={`${s.currentFolder}-${s.fileName}`}
                      className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                        s.selected
                          ? "border-accent/40 bg-accent/5"
                          : "border-border bg-muted/20"
                      }`}
                    >
                      <Checkbox
                        checked={s.selected}
                        onCheckedChange={() => onToggle(i)}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{s.fileName}</p>
                        <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                          <FolderOpen size={12} />
                          <span>{getFolderLabel(s.currentFolder)}</span>
                          <ArrowRight size={10} className="text-accent" />
                          <span className="text-accent font-medium">{getFolderLabel(s.suggestedFolder)}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge
                            variant={s.confidence === "high" ? "default" : "secondary"}
                            className={`text-[10px] h-4 ${
                              s.confidence === "high"
                                ? "bg-accent text-accent-foreground"
                                : ""
                            }`}
                          >
                            {s.confidence}
                          </Badge>
                          <span className="text-[11px] text-muted-foreground">{s.category}</span>
                        </div>
                        {s.description && (
                          <p className="text-[11px] text-muted-foreground mt-1 italic line-clamp-2">
                            {s.description}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => onDismiss(s)}
                        className="shrink-0 p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                        title="Dismiss this suggestion"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

        {/* Footer actions */}
        {suggestions.length > 0 && (
          <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-border">
            <Button variant="ghost" size="sm" onClick={onDismissAll} disabled={moving} className="text-xs text-muted-foreground">
              Dismiss all
            </Button>
            <div className="flex-1" />
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={moving}>
              Close
            </Button>
            <Button
              size="sm"
              disabled={selectedCount === 0 || moving}
              onClick={handleMoveSelected}
              className="gap-1.5 bg-accent text-accent-foreground hover:bg-accent/90"
            >
              {moving ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <>
                  <ArrowRight size={14} />
                  Move {selectedCount} file{selectedCount !== 1 ? "s" : ""}
                </>
              )}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
