import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, Loader2, Sparkles, ArrowRight, X } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import RiskBadge from "@/components/RiskBadge";
import type { CaseStatus, RiskLevel } from "@/types";

interface SearchResult {
  case_id: string;
  case_reference: string;
  property_address: string;
  status: string;
  risk_level: string | null;
  risk_score: number | null;
  relevance_reason: string;
  match_score: number;
}

const AICaseSearch = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searchSummary, setSearchSummary] = useState<string | null>(null);

  const handleSearch = useCallback(async () => {
    if (!query.trim() || searching) return;
    setSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-case-search", {
        body: { query: query.trim() },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setResults(data.results || []);
      setSearchSummary(data.summary || null);
    } catch (e: any) {
      console.error("AI search error:", e);
      setResults([]);
      setSearchSummary("Search failed. Please try again.");
    } finally {
      setSearching(false);
    }
  }, [query, searching]);

  const clearSearch = () => {
    setQuery("");
    setResults(null);
    setSearchSummary(null);
  };

  return (
    <div className="space-y-3">
      {/* Search bar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Sparkles size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-accent" />
          <Input
            placeholder="Search cases in natural language… e.g. 'leasehold properties with high risk'"
            className="pl-9 pr-8 h-10 text-sm rounded-lg"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
          {query && (
            <button onClick={clearSearch} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X size={14} />
            </button>
          )}
        </div>
        <Button size="sm" onClick={handleSearch} disabled={!query.trim() || searching} className="gap-1.5 shrink-0">
          {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          AI Search
        </Button>
      </div>

      {/* Results */}
      {results !== null && (
        <Card className="border-border/60 overflow-hidden">
          <CardContent className="p-4 space-y-3">
            {searchSummary && (
              <p className="text-xs text-muted-foreground">{searchSummary}</p>
            )}

            {results.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No cases matched your query.</p>
            ) : (
              <div className="space-y-2">
                {results.map((r) => (
                  <button
                    key={r.case_id}
                    onClick={() => navigate(`/case/${r.case_id}`)}
                    className="w-full text-left p-3 rounded-lg bg-muted/30 hover:bg-muted/60 border border-border/40 hover:border-accent/40 transition-all group"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-mono text-xs font-bold text-accent">{r.case_reference}</span>
                          <StatusBadge status={r.status as CaseStatus} />
                          {r.risk_level && (
                            <RiskBadge level={r.risk_level as RiskLevel} score={r.risk_score ?? undefined} size="sm" />
                          )}
                        </div>
                        <p className="text-xs text-foreground truncate">{r.property_address}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{r.relevance_reason}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className="text-[10px]">
                          {Math.round(r.match_score * 100)}% match
                        </Badge>
                        <ArrowRight size={14} className="text-muted-foreground group-hover:text-accent transition-colors" />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AICaseSearch;
