import { useState } from "react";
import { useSearchParams, useParams, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import CaseFileBrowser from "@/components/CaseFileBrowser";
import { supabase } from "@/integrations/supabase/client";

/**
 * Floating button that appears on any page with a caseId (query param or route param).
 * Opens a dialog with the full CaseFileBrowser for quick access.
 */
export default function FloatingCaseFiles() {
  const [open, setOpen] = useState(false);
  const [searchParams] = useSearchParams();
  const params = useParams<{ id?: string }>();
  const location = useLocation();

  // Derive caseId from ?caseId= or :id route param on case-scoped routes
  const caseId =
    searchParams.get("caseId") ||
    (location.pathname.startsWith("/case/") && params.id && params.id !== "new" ? params.id : null);

  // Fetch hoowla_matter_id for the case
  const { data: caseData } = useQuery({
    queryKey: ["floating-case-hoowla", caseId],
    queryFn: async () => {
      if (!caseId) return null;
      const { data } = await supabase
        .from("cases" as any)
        .select("hoowla_matter_id")
        .eq("id", caseId)
        .single();
      return data as any as { hoowla_matter_id: string | null } | null;
    },
    enabled: !!caseId,
    staleTime: 60_000,
  });

  if (!caseId) return null;

  return (
    <>
      {/* Floating button — bottom-right */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            onClick={() => setOpen(true)}
            className="fixed bottom-24 right-6 z-50 h-12 w-12 rounded-full shadow-lg bg-accent hover:bg-accent/90 text-accent-foreground"
            aria-label="Open Case Files"
          >
            <FolderOpen size={20} />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">Case Files</TooltipContent>
      </Tooltip>

      {/* Dialog with the full file browser */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderOpen size={18} className="text-accent" />
              Case Files
            </DialogTitle>
          </DialogHeader>
          <CaseFileBrowser
            caseId={caseId}
            hoowlaMatterId={caseData?.hoowla_matter_id}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
