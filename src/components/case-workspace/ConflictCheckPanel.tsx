import { useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Search, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

interface Party {
  id: string;
  full_name: string;
  role: string;
}

interface ConflictMatch {
  partyName: string;
  matchedCaseRef: string;
  matchedCaseId: string;
  matchedRole: string;
  matchedPropertyAddress: string;
}

interface ConflictCheckPanelProps {
  caseId: string;
  parties: Party[];
}

export default function ConflictCheckPanel({ caseId, parties }: ConflictCheckPanelProps) {
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState(false);
  const [conflicts, setConflicts] = useState<ConflictMatch[]>([]);

  const runCheck = async () => {
    if (parties.length === 0) return;
    setChecking(true);
    try {
      const names = parties.map((p) => p.full_name).filter(Boolean);
      if (names.length === 0) { setChecked(true); return; }

      // Search for parties with matching names in OTHER cases
      const { data, error } = await supabase
        .from("case_parties")
        .select("full_name, role, case_id")
        .neq("case_id", caseId)
        .in("full_name", names);

      if (error) throw error;

      if (!data || data.length === 0) {
        setConflicts([]);
        setChecked(true);
        return;
      }

      // Fetch case details for matches
      const matchedCaseIds = [...new Set(data.map((d) => d.case_id))];
      const { data: cases } = await supabase
        .from("cases")
        .select("id, case_reference, property_address")
        .in("id", matchedCaseIds);

      const caseMap = new Map((cases || []).map((c) => [c.id, c]));

      const results: ConflictMatch[] = data.map((match) => {
        const caseInfo = caseMap.get(match.case_id);
        return {
          partyName: match.full_name,
          matchedCaseRef: caseInfo?.case_reference || "Unknown",
          matchedCaseId: match.case_id,
          matchedRole: match.role,
          matchedPropertyAddress: caseInfo?.property_address || "Unknown",
        };
      });

      setConflicts(results);
      setChecked(true);
    } catch (e) {
      console.error("[ConflictCheck] Error:", e);
    } finally {
      setChecking(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users size={14} className="text-accent" />
            Conflict of Interest Check
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            className="text-[10px] h-6 gap-1"
            onClick={runCheck}
            disabled={checking || parties.length === 0}
          >
            {checking ? <Loader2 size={10} className="animate-spin" /> : <Search size={10} />}
            {checked ? "Re-check" : "Run Check"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {!checked && !checking && (
          <p className="text-[11px] text-muted-foreground">
            Cross-reference {parties.length} part{parties.length !== 1 ? "ies" : "y"} against all other cases to detect potential conflicts.
          </p>
        )}

        {checked && conflicts.length === 0 && (
          <div className="flex items-center gap-2 py-2 px-3 rounded-lg bg-[hsl(var(--risk-green))]/5 border border-[hsl(var(--risk-green))]/20">
            <CheckCircle2 size={14} className="text-[hsl(var(--risk-green))] shrink-0" />
            <span className="text-[11px] text-[hsl(var(--risk-green))] font-medium">
              No conflicts detected across {parties.length} part{parties.length !== 1 ? "ies" : "y"}
            </span>
          </div>
        )}

        {checked && conflicts.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 py-1.5 px-3 rounded-lg bg-[hsl(var(--risk-red))]/5 border border-[hsl(var(--risk-red))]/20">
              <AlertTriangle size={14} className="text-[hsl(var(--risk-red))] shrink-0" />
              <span className="text-[11px] text-[hsl(var(--risk-red))] font-semibold">
                {conflicts.length} potential conflict{conflicts.length !== 1 ? "s" : ""} found
              </span>
            </div>
            {conflicts.map((c, i) => (
              <div key={i} className="px-3 py-2 rounded-lg bg-muted/30 border border-border text-[11px] space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">{c.partyName}</span>
                  <Badge variant="secondary" className="text-[9px] h-4">{c.matchedRole}</Badge>
                </div>
                <p className="text-muted-foreground">
                  Also appears in <span className="font-medium text-foreground">{c.matchedCaseRef}</span> — {c.matchedPropertyAddress}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
