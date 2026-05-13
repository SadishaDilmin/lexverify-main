import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FolderPlus, ArrowRight, Clock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import StatusBadge from "@/components/StatusBadge";
import type { CaseStatus } from "@/types";
import type { AgentConfig } from "@/config/agents";

interface CaseRow {
  id: string;
  case_reference: string;
  property_address: string;
  status: string;
  updated_at: string;
}

interface AgentCasePickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent: AgentConfig | null;
  cases: CaseRow[];
}

const AgentCasePickerDialog = ({
  open,
  onOpenChange,
  agent,
  cases,
}: AgentCasePickerDialogProps) => {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  if (!agent) return null;

  const openCases = cases.filter((c) => c.status !== "closed");
  const filtered = openCases.filter(
    (c) =>
      c.case_reference.toLowerCase().includes(search.toLowerCase()) ||
      c.property_address.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelectCase = (caseId: string) => {
    onOpenChange(false);
    // Navigate to case workspace with tool context so the correct tab opens
    const toolParam = agent.id ? `?tool=${agent.id}` : "";
    navigate(`/case/${caseId}${toolParam}`);
  };

  const handleNewCase = () => {
    onOpenChange(false);
    // Always go to case creation — pass tool so we can redirect after creation
    navigate(`/case/new?tool=${agent.id}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" style={{ fontFamily: "'DM Sans', sans-serif" }}>
            <agent.icon size={20} className="text-accent" />
            {agent.name}
          </DialogTitle>
          <DialogDescription style={{ fontFamily: "'DM Sans', sans-serif" }}>
            Use an existing case or create a new one.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* New Case button */}
          <Button
            onClick={handleNewCase}
            className="w-full bg-accent text-accent-foreground hover:bg-accent/90 gap-2"
          >
            <FolderPlus size={16} /> Create New Case
          </Button>

          {openCases.length > 0 && (
            <>
              <div className="relative text-center">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <span className="relative bg-background px-3 text-xs text-muted-foreground">
                  or use an existing case
                </span>
              </div>

              {openCases.length > 5 && (
                <Input
                  placeholder="Search cases…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-9 text-sm"
                />
              )}

              <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
                {filtered.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No cases match your search.
                  </p>
                ) : (
                  filtered.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => handleSelectCase(c.id)}
                      className="w-full text-left p-3 rounded-lg border border-border hover:border-accent/40 hover:bg-accent/5 transition-all group flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm font-mono font-semibold text-foreground">
                            {c.case_reference}
                          </span>
                          <StatusBadge status={c.status as CaseStatus} />
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {c.property_address}
                        </p>
                        <p className="text-[10px] text-muted-foreground/60 flex items-center gap-1 mt-0.5">
                          <Clock size={10} />
                          {new Date(c.updated_at).toLocaleDateString("en-GB")}
                        </p>
                      </div>
                      <ArrowRight
                        size={14}
                        className="text-muted-foreground group-hover:text-accent transition-colors shrink-0"
                      />
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AgentCasePickerDialog;
