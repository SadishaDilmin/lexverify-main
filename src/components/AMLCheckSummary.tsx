import { CheckCircle2, XCircle, AlertTriangle, ShieldAlert, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { motion } from "framer-motion";

const AML_CHECKS = [
  { id: "identity_cross_check", label: "Identity Document Cross-Check", section: "Identity Verification Cross-Check", description: "Name & DOB on ID matched against all other documents" },
  { id: "address_mismatch", label: "Address Mismatch Detection", section: "Address Verification Cross-Check", description: "Residential addresses cross-checked across ID, bank statements & utility bills" },
  { id: "pep_edd", label: "PEP Enhanced Due Diligence", section: "PEP Enhanced Due Diligence", description: "Politically Exposed Persons screening per MLR 2017 Reg 35" },
  { id: "ofsi_sanctions", label: "OFSI Sanctions Screening", section: "OFSI Sanctions Screening", description: "Checked against OFSI Consolidated List" },
  { id: "cash_deposits", label: "Cash Deposit Analysis", section: "Cash Deposit Analysis", description: "Cash deposits flagged against occupation and declared income" },
  { id: "salary_purchase", label: "Salary vs Purchase Price", section: "Salary vs Purchase Price Analysis", description: "Income multiple calculated against purchase price" },
  { id: "bank_coverage", label: "Bank Statement Coverage", section: "Bank Statement Coverage Analysis", description: "12-month statement coverage verified with gap detection" },
  { id: "dormant_account", label: "Dormant Account Detection", section: "Dormant Account", description: "Accounts reactivated after 3+ months of inactivity flagged" },
  { id: "third_party", label: "Third-Party Payments", section: "Third-Party Payment", description: "Unexplained third-party deposits identified" },
  { id: "crypto_activity", label: "Cryptocurrency Activity", section: "Cryptocurrency", description: "Crypto exchange transactions detected in bank statements" },
  { id: "circular_payments", label: "Circular Payment Detection", section: "Circular Payment Analysis", description: "Round-trip and cycling payment patterns identified" },
  { id: "fatf_jurisdiction", label: "FATF Jurisdiction Screening", section: "International Jurisdiction Analysis", description: "Overseas transfers screened against FATF grey/black lists" },
  { id: "gift_verification", label: "Gift Verification Analysis", section: "Gift Verification Analysis", description: "Gift letters, relationships, and source of gifted funds verified" },
] as const;

type CheckStatus = "pass" | "warn" | "fail" | "not_applicable" | "not_found";

function detectCheckStatus(report: string, section: string): CheckStatus {
  // Find the section in the report
  const sectionIdx = report.indexOf(section);
  if (sectionIdx === -1) return "not_found";

  // Extract ~1500 chars after the section header for analysis
  const sectionText = report.substring(sectionIdx, sectionIdx + 1500).toLowerCase();

  // Check for explicit red/fail indicators
  const redIndicators = [
    "❌", "red", "critical", "unexplained mismatch", "significant gap",
    "serious concern", "suspicious", "escalat", "sar consideration",
    "high risk", "critical risk", "non-compliant", "fail",
  ];
  const amberIndicators = [
    "⚠️", "⚠", "amber", "partial", "minor gap", "explainable mismatch",
    "moderate risk", "medium risk", "enquiry raised", "further evidence",
    "outstanding", "missing", "not yet provided", "insufficient",
  ];
  const greenIndicators = [
    "✅", "green", "full match", "no.*identified", "no.*detected",
    "consistent", "verified", "compliant", "pass", "low risk", "satisfied",
  ];
  const naIndicators = [
    "not applicable", "n/a", "no.*provided", "no.*uploaded",
    "no gift", "no pep", "not identified as a pep", "no sanctions",
  ];

  const hasRed = redIndicators.some(i => sectionText.includes(i));
  const hasAmber = amberIndicators.some(i => sectionText.includes(i));
  const hasGreen = greenIndicators.some(i => {
    if (i.includes(".*")) {
      return new RegExp(i).test(sectionText);
    }
    return sectionText.includes(i);
  });
  const hasNA = naIndicators.some(i => {
    if (i.includes(".*")) {
      return new RegExp(i).test(sectionText);
    }
    return sectionText.includes(i);
  });

  // Priority: Red > Amber > Green > N/A
  if (hasRed) return "fail";
  if (hasAmber) return "warn";
  if (hasGreen) return "pass";
  if (hasNA) return "not_applicable";
  return "pass"; // Section exists but no clear indicators — default to pass
}

const STATUS_CONFIG: Record<CheckStatus, { icon: typeof CheckCircle2; color: string; bg: string; label: string }> = {
  pass: { icon: CheckCircle2, color: "text-risk-green", bg: "bg-risk-green/10", label: "Pass" },
  warn: { icon: AlertTriangle, color: "text-risk-amber", bg: "bg-risk-amber/10", label: "Warning" },
  fail: { icon: XCircle, color: "text-risk-red", bg: "bg-risk-red/10", label: "Fail" },
  not_applicable: { icon: Info, color: "text-muted-foreground", bg: "bg-muted/30", label: "N/A" },
  not_found: { icon: Info, color: "text-muted-foreground", bg: "bg-muted/20", label: "Not Found" },
};

interface AMLCheckSummaryProps {
  internalReport: string | null | undefined;
}

export default function AMLCheckSummary({ internalReport }: AMLCheckSummaryProps) {
  if (!internalReport) {
    return (
      <Card>
        <CardContent className="text-center py-12">
          <ShieldAlert size={32} className="text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No SoW internal report available. Run a Source of Wealth assessment to see AML check results.</p>
        </CardContent>
      </Card>
    );
  }

  const results = AML_CHECKS.map(check => ({
    ...check,
    status: detectCheckStatus(internalReport, check.section),
  }));

  const passCount = results.filter(r => r.status === "pass").length;
  const warnCount = results.filter(r => r.status === "warn").length;
  const failCount = results.filter(r => r.status === "fail").length;
  const naCount = results.filter(r => r.status === "not_applicable" || r.status === "not_found").length;

  const overallStatus: CheckStatus =
    failCount > 0 ? "fail" :
    warnCount > 0 ? "warn" :
    "pass";

  const OverallIcon = STATUS_CONFIG[overallStatus].icon;

  return (
    <div className="space-y-4">
      {/* Summary header */}
      <Card className="border-border">
        <CardContent className="p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className={`w-14 h-14 rounded-xl ${STATUS_CONFIG[overallStatus].bg} flex items-center justify-center`}>
                <OverallIcon size={28} className={STATUS_CONFIG[overallStatus].color} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">AML Compliance Dashboard</h3>
                <p className="text-sm text-muted-foreground">13-point automated check summary from Source of Wealth analysis</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {[
                { count: passCount, label: "Pass", color: "text-risk-green", bg: "bg-risk-green/10" },
                { count: warnCount, label: "Warning", color: "text-risk-amber", bg: "bg-risk-amber/10" },
                { count: failCount, label: "Fail", color: "text-risk-red", bg: "bg-risk-red/10" },
                { count: naCount, label: "N/A", color: "text-muted-foreground", bg: "bg-muted/30" },
              ].filter(s => s.count > 0).map(s => (
                <div key={s.label} className={`${s.bg} rounded-lg px-3 py-1.5 text-center min-w-[52px]`}>
                  <div className={`text-lg font-bold font-mono ${s.color}`}>{s.count}</div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Check grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {results.map((check, idx) => {
          const cfg = STATUS_CONFIG[check.status];
          const Icon = cfg.icon;
          return (
            <Tooltip key={check.id}>
              <TooltipTrigger asChild>
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.03 }}
                >
                  <Card className={`border-border hover:border-accent/40 transition-all duration-200 cursor-default ${check.status === "fail" ? "border-risk-red/30" : check.status === "warn" ? "border-risk-amber/30" : ""}`}>
                    <CardContent className="p-3.5 flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg ${cfg.bg} flex items-center justify-center shrink-0`}>
                        <Icon size={16} className={cfg.color} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-foreground truncate">{check.label}</div>
                        <div className={`text-[11px] font-semibold ${cfg.color}`}>{cfg.label}</div>
                      </div>
                      <div className="text-xs font-mono text-muted-foreground shrink-0">
                        {idx + 1}/13
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <p className="text-xs">{check.description}</p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>

      <p className="text-[11px] text-muted-foreground italic text-center">
        AML check statuses are automatically extracted from the SoW internal report. This dashboard is an aid — always review the full report for details.
      </p>
    </div>
  );
}
