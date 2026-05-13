import { AlertTriangle, X, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

interface Conflict {
  field: string;
  label: string;
  currentValue: string;
  hoowlaValue: string;
}

interface HoowlaConflictBannerProps {
  caseId: string;
  conflicts: Conflict[];
}

const HoowlaConflictBanner = ({ caseId, conflicts }: HoowlaConflictBannerProps) => {
  const [dismissed, setDismissed] = useState(false);
  const [applying, setApplying] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  if (dismissed || !conflicts.length) return null;

  const handleApplyHoowlaValue = async (conflict: Conflict) => {
    setApplying(conflict.field);
    try {
      // Update the case field with the Hoowla value
      const updatePayload: Record<string, unknown> = {};

      if (conflict.field === "purchase_price" || conflict.field === "stamp_duty" || conflict.field === "legal_fees") {
        updatePayload[conflict.field] = parseFloat(conflict.hoowlaValue.replace(/[^0-9.-]/g, "")) || null;
      } else {
        updatePayload[conflict.field] = conflict.hoowlaValue;
      }

      const { error } = await supabase
        .from("cases")
        .update(updatePayload)
        .eq("id", caseId);

      if (error) throw error;

      // Remove this conflict from stored conflicts
      const { data: caseData } = await supabase
        .from("cases")
        .select("ai_context_notes")
        .eq("id", caseId)
        .single();

      const notes = (caseData?.ai_context_notes as Record<string, unknown>) || {};
      const storedConflicts = ((notes.hoowla_conflicts || []) as Array<Record<string, string>>);
      const updatedConflicts = storedConflicts.filter((c) => c.field !== conflict.field);

      await supabase
        .from("cases")
        .update({
          ai_context_notes: { ...notes, hoowla_conflicts: updatedConflicts } as Record<string, unknown>,
        } as any)
        .eq("id", caseId);

      queryClient.invalidateQueries({ queryKey: ["case", caseId] });
      toast({
        title: "Updated from Hoowla",
        description: `${conflict.label} updated to "${conflict.hoowlaValue}"`,
      });
    } catch (e: any) {
      toast({
        title: "Update failed",
        description: e.message || "Could not apply Hoowla value",
        variant: "destructive",
      });
    } finally {
      setApplying(null);
    }
  };

  const handleDismissAll = async () => {
    setDismissed(true);
    // Clear conflicts from storage
    try {
      const { data: caseData } = await supabase
        .from("cases")
        .select("ai_context_notes")
        .eq("id", caseId)
        .single();

      const notes = (caseData?.ai_context_notes as Record<string, unknown>) || {};
      await supabase
        .from("cases")
        .update({
          ai_context_notes: { ...notes, hoowla_conflicts: [] } as Record<string, unknown>,
        } as any)
        .eq("id", caseId);

      queryClient.invalidateQueries({ queryKey: ["case", caseId] });
    } catch {}
  };

  return (
    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30 px-4 py-3">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400 shrink-0" />
          <span className="text-sm font-semibold text-amber-800 dark:text-amber-300">
            Hoowla data conflicts detected
          </span>
        </div>
        <button
          onClick={handleDismissAll}
          className="shrink-0 rounded p-0.5 hover:bg-amber-200/50 dark:hover:bg-amber-800/30 transition-colors"
          aria-label="Dismiss conflicts"
        >
          <X size={14} className="text-amber-600 dark:text-amber-400" />
        </button>
      </div>
      <p className="text-xs text-amber-700 dark:text-amber-400 mb-3">
        The following fields in Hoowla differ from this case. Review and choose which value to keep.
      </p>
      <div className="space-y-2">
        {conflicts.map((conflict) => (
          <div
            key={conflict.field}
            className="flex items-center gap-3 rounded-md bg-amber-100/60 dark:bg-amber-900/20 px-3 py-2 text-xs"
          >
            <div className="flex-1 min-w-0">
              <span className="font-medium text-amber-900 dark:text-amber-200">{conflict.label}: </span>
              <span className="text-amber-700 dark:text-amber-400">
                Current: &ldquo;{conflict.currentValue}&rdquo;
              </span>
              <span className="mx-1 text-amber-500">→</span>
              <span className="text-amber-800 dark:text-amber-300 font-medium">
                Hoowla: &ldquo;{conflict.hoowlaValue}&rdquo;
              </span>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 h-7 text-xs border-amber-300 dark:border-amber-700 hover:bg-amber-200/50 dark:hover:bg-amber-800/30"
              disabled={applying === conflict.field}
              onClick={() => handleApplyHoowlaValue(conflict)}
            >
              {applying === conflict.field ? (
                <RefreshCw size={12} className="animate-spin mr-1" />
              ) : null}
              Use Hoowla
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default HoowlaConflictBanner;
