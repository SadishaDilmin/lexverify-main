/**
 * Non-destructive banner that suggests moving a file to a more appropriate folder
 * after post-upload AI classification.
 */

import { useState } from "react";
import { ArrowRight, Check, X, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getFolderLabel } from "@/lib/caseFolders";
import { motion, AnimatePresence } from "framer-motion";
import type { ClassificationSuggestion } from "@/hooks/usePostUploadClassification";

interface ClassificationSuggestionBannerProps {
  suggestions: ClassificationSuggestion[];
  onAccept: (suggestion: ClassificationSuggestion) => Promise<{ success: boolean; newFolder?: string; error?: string }>;
  onDismiss: (suggestion: ClassificationSuggestion) => void;
  onMoveComplete?: (fileName: string, newFolder: string) => void;
}

export default function ClassificationSuggestionBanner({
  suggestions,
  onAccept,
  onDismiss,
  onMoveComplete,
}: ClassificationSuggestionBannerProps) {
  const [movingId, setMovingId] = useState<string | null>(null);

  if (suggestions.length === 0) return null;

  return (
    <div className="space-y-2 mb-3">
      <AnimatePresence>
        {suggestions.map((s) => (
          <motion.div
            key={s.id}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="rounded-lg border border-accent/30 bg-accent/5 px-3 py-2.5"
          >
            <div className="flex items-start gap-2">
              <Sparkles size={16} className="text-accent shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground leading-snug">
                  <strong className="font-medium">{s.fileName}</strong>
                  {" looks like "}
                  <span className="font-medium text-accent">{s.category}</span>.
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Currently in <strong>{getFolderLabel(s.originalFolder)}</strong>.
                  {s.confidence === "high" ? " We're confident it " : " It may "}
                  belong{s.confidence === "high" ? "s" : ""} in{" "}
                  <strong>{getFolderLabel(s.suggestedFolder)}</strong>.
                </p>
                {s.description && (
                  <p className="text-[11px] text-muted-foreground mt-1 italic">{s.description}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 mt-2 ml-6">
              <Button
                size="sm"
                variant="default"
                className="h-7 text-xs gap-1.5 bg-accent text-accent-foreground hover:bg-accent/90"
                disabled={movingId === s.id}
                onClick={async () => {
                  setMovingId(s.id);
                  const result = await onAccept(s);
                  setMovingId(null);
                  if (result.success && result.newFolder) {
                    onMoveComplete?.(s.fileName, result.newFolder);
                  }
                }}
              >
                {movingId === s.id ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <>
                    <ArrowRight size={12} />
                    Move to {getFolderLabel(s.suggestedFolder)}
                  </>
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs gap-1 text-muted-foreground"
                disabled={movingId === s.id}
                onClick={() => onDismiss(s)}
              >
                <X size={12} />
                Keep here
              </Button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
