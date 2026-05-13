import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, Info, Landmark, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface LenderRulesWarningProps {
  lender: string | null;
  transactionType?: string;
  documentsUploaded?: string[];
}

interface LenderRule {
  id: string;
  lender_name: string;
  rule_type: string;
  rule_key: string;
  rule_value: string;
  description: string | null;
  severity: string;
}

export default function LenderRulesWarning({ lender, transactionType, documentsUploaded = [] }: LenderRulesWarningProps) {
  const { data: rules = [] } = useQuery({
    queryKey: ["lender_rules", lender],
    queryFn: async () => {
      if (!lender) return [];
      const { data, error } = await supabase
        .from("lender_rules")
        .select("*")
        .eq("lender_name", lender)
        .eq("is_active", true);
      if (error) throw error;
      return (data || []) as LenderRule[];
    },
    enabled: !!lender,
    staleTime: 5 * 60_000,
  });

  if (!lender || rules.length === 0) return null;

  const severityConfig = {
    critical: { icon: AlertTriangle, color: "text-[hsl(var(--risk-red))]", bg: "bg-[hsl(var(--risk-red))]/5 border-[hsl(var(--risk-red))]/20" },
    warning: { icon: Info, color: "text-[hsl(var(--risk-amber))]", bg: "bg-[hsl(var(--risk-amber))]/5 border-[hsl(var(--risk-amber))]/20" },
    info: { icon: Info, color: "text-accent", bg: "bg-accent/5 border-accent/20" },
  };

  const criticalCount = rules.filter((r) => r.severity === "critical").length;

  return (
    <Card className={criticalCount > 0 ? "border-[hsl(var(--risk-red))]/20" : "border-[hsl(var(--risk-amber))]/20"}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Landmark size={14} className="text-accent" />
          {lender} Compliance Requirements
          {criticalCount > 0 && (
            <Badge className="text-[9px] h-4 bg-[hsl(var(--risk-red))]/10 text-[hsl(var(--risk-red))] border-[hsl(var(--risk-red))]/20">
              {criticalCount} critical
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {rules.map((rule) => {
          const config = severityConfig[rule.severity as keyof typeof severityConfig] || severityConfig.info;
          const Icon = config.icon;
          return (
            <div key={rule.id} className={`flex items-start gap-2 px-3 py-2 rounded-lg border ${config.bg}`}>
              <Icon size={12} className={`${config.color} shrink-0 mt-0.5`} />
              <div className="flex-1 min-w-0">
                <p className={`text-[11px] font-medium ${config.color}`}>{rule.description || `${rule.rule_type}: ${rule.rule_key}`}</p>
                <p className="text-[9px] text-muted-foreground mt-0.5">
                  {rule.rule_type === "bank_statement_months" && `Minimum ${rule.rule_value} months required`}
                  {rule.rule_type === "gifted_deposit" && "Must be provided before completion"}
                  {rule.rule_type === "large_deposits" && `Threshold: £${Number(rule.rule_value).toLocaleString()}`}
                  {rule.rule_type === "self_employed" && `${rule.rule_value} years of records required`}
                </p>
              </div>
              <Badge variant="secondary" className="text-[8px] h-3.5 shrink-0">{rule.rule_type}</Badge>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
