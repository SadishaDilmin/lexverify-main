import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Calculator,
  Clock,
  Download,
  Mail,
  PoundSterling,
  TrendingUp,
  Sparkles,
  Landmark,
  Check,
  CreditCard,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { generateCalculatorPdf, type CalculatorData } from "@/lib/calculatorPdf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  COMPLEXITY_MODIFIERS,
  creditsPerAgent,
  totalCreditsPerCase,
  creditCostGBP,
  CREDIT_PRICE_GBP,
  BASE_CREDITS_PER_AGENT,
} from "@/data/creditPricing";

/* ─── AI Agents ─── */
export const AI_AGENTS = [
  { id: "source-of-wealth", title: "Olimey AI", icon: Landmark },
];

/* ─── Constants ─── */
const MANUAL_HOURS_PER_CASE = 2.5;
const AI_MINUTES_PER_CASE = 8;
const AI_CLAIM_REDUCTION_PCT = 70;
const AVG_CLAIM_COST = 35_000;

/* ─── Helpers ─── */
const fmt = (n: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(n);

const fmtDec = (n: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

/* ─── Stat Card ─── */
interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}

const StatCard = ({ icon: Icon, label, value, sub, accent }: StatCardProps) => (
  <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
    <Card className={`border-border ${accent ? "ring-2 ring-accent/40" : ""}`}>
      <CardContent className="pt-6 flex flex-col items-center text-center gap-2">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${accent ? "bg-accent/15 text-accent" : "bg-muted text-muted-foreground"}`}>
          <Icon size={22} />
        </div>
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold text-foreground">{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  </motion.div>
);

/* ─── Row helper ─── */
const Row = ({ label, value, bold }: { label: string; value: string; bold?: boolean }) => (
  <div className="flex items-center justify-between">
    <span className="text-muted-foreground">{label}</span>
    <span className={bold ? "font-semibold text-foreground" : "text-foreground"}>{value}</span>
  </div>
);

/* ─── Props ─── */
interface ROICalculatorProps {
  /** When true, hides the hero header (useful when embedded in another page) */
  embedded?: boolean;
  /** Optional ID for scroll-to anchoring */
  id?: string;
}

/* ─── Main Component ─── */
const ROICalculator = ({ embedded = false, id }: ROICalculatorProps) => {
  const { toast } = useToast();
  const [hourlyRate, setHourlyRate] = useState("");
  const [casesPerFeeEarner, setCasesPerFeeEarner] = useState("");
  const [totalFirmCases, setTotalFirmCases] = useState("");
  const [avgFee, setAvgFee] = useState("");
  const [claimProbability, setClaimProbability] = useState("2");
  const [calculated, setCalculated] = useState(false);
  const [period, setPeriod] = useState<"monthly" | "annual">("annual");
  const [selectedAgents, setSelectedAgents] = useState<string[]>(["source-of-wealth"]);
  const [selectedComplexity, setSelectedComplexity] = useState<string[]>([]);

  const hourly = parseFloat(hourlyRate) || 0;
  const perEarner = parseInt(casesPerFeeEarner) || 0;
  const cases = parseInt(totalFirmCases) || 0;
  const fee = parseFloat(avgFee) || 0;
  const claimPct = parseFloat(claimProbability) || 0;
  const agentCount = Math.max(selectedAgents.length, 1);

  const allSelected = selectedAgents.length === AI_AGENTS.length;

  const toggleAgent = (agentId: string) => {
    setSelectedAgents((prev) => prev.includes(agentId) ? prev.filter((a) => a !== agentId) : [...prev, agentId]);
    setCalculated(false);
  };

  const toggleAll = () => {
    setSelectedAgents(allSelected ? [] : AI_AGENTS.map((a) => a.id));
    setCalculated(false);
  };

  const canCalculate = hourly > 0 && perEarner > 0 && cases > 0 && fee > 0 && claimPct >= 0 && selectedAgents.length > 0;

  /* Derived values */
  const manualCostPerCase = hourly * MANUAL_HOURS_PER_CASE;
  const aiCostEquivPerCase = hourly * (AI_MINUTES_PER_CASE / 60);
  const savingPerCase = (manualCostPerCase - aiCostEquivPerCase) * agentCount;
  const totalSaving = savingPerCase * cases;

  const hoursFreedPerCase = (MANUAL_HOURS_PER_CASE - AI_MINUTES_PER_CASE / 60) * agentCount;
  const totalHoursFreed = hoursFreedPerCase * cases;
  const additionalCases = Math.floor(totalHoursFreed / (MANUAL_HOURS_PER_CASE + 1));
  const additionalRevenue = additionalCases * fee;

  const manualClaimCostAnnual = (claimPct / 100) * cases * AVG_CLAIM_COST;
  const aiClaimCostAnnual = ((claimPct / 100) * (1 - (AI_CLAIM_REDUCTION_PCT * agentCount) / (100 * agentCount))) * cases * AVG_CLAIM_COST;
  const claimSaving = manualClaimCostAnnual - aiClaimCostAnnual;

  const totalBenefit = totalSaving + additionalRevenue + claimSaving;

  /* Credit cost calculations */
  const creditsPerAgentVal = creditsPerAgent(selectedComplexity);
  const creditsPerCaseVal = totalCreditsPerCase(agentCount, selectedComplexity);
  const creditCostPerCase = creditCostGBP(creditsPerCaseVal);
  const totalCreditCost = creditCostPerCase * cases;
  const netBenefit = totalBenefit - totalCreditCost;

  const mult = period === "monthly" ? 1 / 12 : 1;
  const periodLabel = period === "monthly" ? "per month" : "per year";

  const handleCalculate = () => {
    if (canCalculate) setCalculated(true);
  };

  const getPdfData = (): CalculatorData => ({
    hourlyRate: hourly,
    casesPerFeeEarner: perEarner,
    totalFirmCases: cases,
    avgFee: fee,
    claimProbability: claimPct,
    manualHoursPerCase: MANUAL_HOURS_PER_CASE,
    aiMinutesPerCase: AI_MINUTES_PER_CASE,
    aiClaimReductionPct: AI_CLAIM_REDUCTION_PCT,
    avgClaimCost: AVG_CLAIM_COST,
    manualCostPerCase,
    aiCostEquivPerCase,
    savingPerCase,
    totalSaving,
    hoursFreedPerCase,
    totalHoursFreed,
    additionalCases,
    additionalRevenue,
    manualClaimCostAnnual,
    aiClaimCostAnnual,
    claimSaving,
    totalBenefit,
    period,
    agentCount,
  });

  const handleDownloadPdf = async () => {
    const doc = await generateCalculatorPdf(getPdfData());
    doc.save("Olimey AI-Benefit-Calculator.pdf");
    toast({ title: "PDF downloaded", description: "Your benefit summary has been saved." });
  };

  const handleShareEmail = () => {
    const periodLabelEmail = period === "monthly" ? "per month" : "per year";
    const subject = encodeURIComponent("Olimey AI Agent — Benefit Calculator Results");
    const body = encodeURIComponent(
      `Here are my estimated savings (${periodLabelEmail}) from using Olimey AI's AI-powered search review:\n\n` +
      `• Time Cost Saved: ${fmt(totalSaving * mult)}\n` +
      `• Additional Revenue Capacity: ${fmt(additionalRevenue * mult)} (${Math.round(additionalCases * mult)} extra cases)\n` +
      `• Risk Cost Reduction: ${fmt(claimSaving * mult)}\n` +
      `• AI Credit Cost: ${fmt(totalCreditCost * mult)}\n` +
      `• Net Estimated Benefit: ${fmt(netBenefit * mult)}\n\n` +
      `Based on: ${perEarner} cases/conveyancer, ${cases} total firm cases, ${agentCount} AI agent${agentCount > 1 ? "s" : ""}, ${fmt(hourly)}/hr rate, ${fmt(fee)} avg fee per transaction.\n\n` +
      `Try the calculator: ${window.location.origin}/pricing#calculator\n\n` +
      `— Generated by Olimey AI Benefit Calculator`
    );
    window.open(`mailto:?subject=${subject}&body=${body}`, "_self");
  };

  return (
    <div id={id} className="space-y-10">
      {/* Hero – only when standalone */}
      {!embedded && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center space-y-3"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/10 border border-accent/20 text-accent text-sm font-medium mb-2">
            <Calculator size={15} />
            Benefit Calculator
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-foreground">
            AI Agent Profitability Calculator
          </h1>
          <p className="text-muted-foreground max-w-2xl mx-auto text-base md:text-lg">
            Estimate how much time, money, and risk your firm saves by using Olimey AI's AI-powered search review
            instead of manual analysis — based on your own caseload and rates.
          </p>
        </motion.div>
      )}

      {embedded && (
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold text-foreground">Benefit Calculator</h2>
          <p className="text-muted-foreground text-sm max-w-xl mx-auto">
            Enter your firm's details to see your estimated savings after credit costs.
          </p>
        </div>
      )}

      {/* Input form */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.1 }}
      >
        <Card className="border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl">Your Firm's Details</CardTitle>
            <CardDescription>
              Enter your figures below. All data stays in your browser — nothing is stored or sent.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="hourlyRate">Conveyancer hourly rate (£)</Label>
                <Input id="hourlyRate" type="number" min={0} step={1} placeholder="e.g. 180" value={hourlyRate} onChange={(e) => { setHourlyRate(e.target.value); setCalculated(false); }} />
                <p className="text-xs text-muted-foreground">The blended or average hourly rate for the conveyancer performing search reviews.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="casesPerFeeEarner">Live cases per conveyancer</Label>
                <Input id="casesPerFeeEarner" type="number" min={0} step={1} placeholder="e.g. 20" value={casesPerFeeEarner} onChange={(e) => { setCasesPerFeeEarner(e.target.value); setCalculated(false); }} />
                <p className="text-xs text-muted-foreground">The number of live purchase matters each conveyancer handles at any one time.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="totalFirmCases">Total live cases across the firm</Label>
                <Input id="totalFirmCases" type="number" min={0} step={1} placeholder="e.g. 80" value={totalFirmCases} onChange={(e) => { setTotalFirmCases(e.target.value); setCalculated(false); }} />
                <p className="text-xs text-muted-foreground">The total number of live purchase matters the firm is handling concurrently across all conveyancers.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="avgFee">Average fee per purchase transaction (£)</Label>
                <Input id="avgFee" type="number" min={0} step={1} placeholder="e.g. 1200" value={avgFee} onChange={(e) => { setAvgFee(e.target.value); setCalculated(false); }} />
                <p className="text-xs text-muted-foreground">Assuming an even mix of freehold and leasehold transactions.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="claimProb">Estimated negligence claim probability (%)</Label>
                <Input id="claimProb" type="number" min={0} max={100} step={0.1} placeholder="e.g. 2" value={claimProbability} onChange={(e) => { setClaimProbability(e.target.value); setCalculated(false); }} />
                <p className="text-xs text-muted-foreground">Industry average for conveyancing negligence claims is approximately 1–3% of cases.</p>
              </div>
            </div>

            {/* AI Agent Selection */}
            <div className="mt-6 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Select AI Agents</Label>
                <button type="button" onClick={toggleAll} className="text-xs font-medium text-accent hover:underline">
                  {allSelected ? "Deselect All" : "Select All Agents"}
                </button>
              </div>
              <div className="grid sm:grid-cols-3 gap-2">
                {AI_AGENTS.map((agent) => {
                  const isSelected = selectedAgents.includes(agent.id);
                  const AgentIcon = agent.icon;
                  return (
                    <button
                      key={agent.id}
                      type="button"
                      onClick={() => toggleAgent(agent.id)}
                      className={`flex items-center gap-2.5 rounded-lg border p-2.5 text-left text-sm transition-colors ${isSelected ? "border-accent bg-accent/5 text-foreground" : "border-border bg-background text-muted-foreground hover:border-accent/40"}`}
                    >
                      <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${isSelected ? "bg-accent/15 text-accent" : "bg-muted text-muted-foreground"}`}>
                        <AgentIcon size={14} />
                      </div>
                      <span className="truncate flex-1 text-xs font-medium">{agent.title}</span>
                      {isSelected && <Check size={14} className="text-accent shrink-0" />}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                {selectedAgents.length} of {AI_AGENTS.length} agents selected — savings multiply with each additional agent.
              </p>
            </div>

            {/* Case Complexity Selection */}
            <div className="mt-6 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Case Type &amp; Complexity</Label>
                {!embedded && (
                  <Link to="/pricing" className="text-xs font-medium text-accent hover:underline">
                    View full pricing →
                  </Link>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Select the factors that apply. Base cost is {BASE_CREDITS_PER_AGENT} credits per agent (Freehold). Each factor adds credits.
              </p>
              <div className="grid sm:grid-cols-2 gap-2">
                {COMPLEXITY_MODIFIERS.map((mod) => {
                  const isSelected = selectedComplexity.includes(mod.id);
                  return (
                    <button
                      key={mod.id}
                      type="button"
                      onClick={() => {
                        setSelectedComplexity((prev) => prev.includes(mod.id) ? prev.filter((f) => f !== mod.id) : [...prev, mod.id]);
                        setCalculated(false);
                      }}
                      className={`flex items-center gap-2.5 rounded-lg border p-2.5 text-left text-sm transition-colors ${isSelected ? "border-accent bg-accent/5 text-foreground" : "border-border bg-background text-muted-foreground hover:border-accent/40"}`}
                    >
                      <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${isSelected ? "bg-accent/15 text-accent" : "bg-muted text-muted-foreground"}`}>
                        <CreditCard size={14} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-medium block truncate">{mod.label}</span>
                        <span className="text-[10px] text-muted-foreground">+{mod.extraCredits} credits/agent</span>
                      </div>
                      {isSelected && <Check size={14} className="text-accent shrink-0" />}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2 border border-border">
                <CreditCard size={14} className="text-accent shrink-0" />
                <span>
                  <span className="font-semibold text-foreground">{creditsPerAgentVal} credits</span> per agent ×{" "}
                  <span className="font-semibold text-foreground">{agentCount} agent{agentCount > 1 ? "s" : ""}</span> ={" "}
                  <span className="font-semibold text-accent">{creditsPerCaseVal} credits/case</span> ({fmt(creditCostPerCase)}/case)
                </span>
              </div>
            </div>

            {/* Time comparison callout */}
            <div className="mt-6 rounded-lg border border-border bg-muted/30 p-4 flex flex-col sm:flex-row gap-4 sm:gap-8 items-start sm:items-center">
              <div className="flex items-center gap-3">
                <Clock size={20} className="text-muted-foreground shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-foreground">Manual review</p>
                  <p className="text-xs text-muted-foreground">~{MANUAL_HOURS_PER_CASE} hours per case</p>
                </div>
              </div>
              <Sparkles size={18} className="text-accent hidden sm:block" />
              <div className="flex items-center gap-3">
                <Sparkles size={20} className="text-accent shrink-0 sm:hidden" />
                <div>
                  <p className="text-sm font-semibold text-accent">AI agent review</p>
                  <p className="text-xs text-muted-foreground">~{AI_MINUTES_PER_CASE} minutes per case</p>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <Button onClick={handleCalculate} disabled={!canCalculate} className="bg-accent text-accent-foreground hover:bg-accent/90 gap-2">
                <Calculator size={16} />
                Calculate Savings
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Results */}
      {calculated && (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="space-y-8">
          <Separator />

          <div className="text-center space-y-3">
            <h2 className="text-2xl font-bold text-foreground">Your Estimated Savings</h2>
            <p className="text-muted-foreground text-sm">Based on {agentCount} AI agent{agentCount > 1 ? "s" : ""} × {cases} firm cases ({perEarner} per conveyancer)</p>
            <Tabs value={period} onValueChange={(v) => setPeriod(v as "monthly" | "annual")} className="inline-flex">
              <TabsList>
                <TabsTrigger value="monthly">Monthly</TabsTrigger>
                <TabsTrigger value="annual">Annual</TabsTrigger>
              </TabsList>
            </Tabs>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              {period === "monthly"
                ? "Figures shown are estimated monthly values (annual projections divided by 12)."
                : "Figures shown are estimated annual values based on your current caseload. Switch to Monthly to see the per-month breakdown."}
            </p>
          </div>

          {/* Primary stats */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={PoundSterling} label="Time Cost Saved" value={fmt(totalSaving * mult)} sub={`${fmtDec(savingPerCase)} per case × ${cases} cases · ${agentCount} agent${agentCount > 1 ? "s" : ""} (${periodLabel})`} accent />
            <StatCard icon={TrendingUp} label="Additional Revenue Capacity" value={fmt(additionalRevenue * mult)} sub={`${Math.round(additionalCases * mult)} extra cases ${periodLabel}`} />
            <StatCard icon={Check} label="Risk Cost Reduction" value={fmt(claimSaving * mult)} sub={`${AI_CLAIM_REDUCTION_PCT}% fewer negligence-related claims`} />
            <StatCard icon={CreditCard} label="AI Agent Credit Cost" value={fmt(totalCreditCost * mult)} sub={`${creditsPerCaseVal} credits/case × ${cases} cases (${periodLabel})`} />
          </div>

          {/* Total benefit */}
          <Card className="border-accent/30 bg-accent/5">
            <CardContent className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-accent/15 flex items-center justify-center">
                  <Calculator size={24} className="text-accent" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Net Estimated Benefit ({periodLabel})</p>
                  <p className="text-3xl font-bold text-foreground">{fmt(netBenefit * mult)}</p>
                  <p className="text-xs text-muted-foreground">
                    Gross benefit {fmt(totalBenefit * mult)} minus {fmt(totalCreditCost * mult)} AI credit cost
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={handleDownloadPdf} variant="outline" className="gap-2 border-border">
                  <Download size={16} /> Download PDF
                </Button>
                <Button onClick={handleShareEmail} variant="outline" className="gap-2 border-border">
                  <Mail size={16} /> Share via Email
                </Button>
                <Link to="/signup">
                  <Button className="bg-accent text-accent-foreground hover:bg-accent/90 gap-2">
                    Get Started <TrendingUp size={16} />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>

          {/* Breakdown detail */}
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-lg">Detailed Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 text-sm">
                <Row label="Manual review time per case" value={`${MANUAL_HOURS_PER_CASE} hours`} />
                <Row label="AI review time per case" value={`${AI_MINUTES_PER_CASE} minutes`} />
                <Row label="Time freed per case" value={`${hoursFreedPerCase.toFixed(1)} hours`} />
                <Row label="Total hours freed across caseload" value={`${totalHoursFreed.toFixed(0)} hours`} />
                <Separator />
                <Row label="Cost of manual review per case" value={fmtDec(manualCostPerCase)} />
                <Row label="Equivalent AI cost per case (staff time)" value={fmtDec(aiCostEquivPerCase)} />
                <Row label="Net saving per case" value={fmtDec(savingPerCase)} bold />
                <Separator />
                <Row label="Additional cases capacity" value={`${additionalCases} cases`} />
                <Row label="Additional revenue at avg fee" value={fmt(additionalRevenue)} bold />
                <Separator />
                <Row label="Manual claim exposure (annual est.)" value={fmt(manualClaimCostAnnual)} />
                <Row label="AI-assisted claim exposure" value={fmt(aiClaimCostAnnual)} />
                <Row label="Risk cost reduction" value={fmt(claimSaving)} bold />
                <Separator />
                <Row label="Credits per agent per case" value={`${creditsPerAgentVal} credits`} />
                <Row label={`Total credits per case (×${agentCount} agents)`} value={`${creditsPerCaseVal} credits`} />
                <Row label="AI credit cost per case" value={fmtDec(creditCostPerCase)} />
                <Row label="Total AI credit cost (all cases)" value={fmt(totalCreditCost)} bold />
                <Separator />
                <Row label="Gross benefit" value={fmt(totalBenefit)} />
                <Row label="Less: AI credit cost" value={`-${fmt(totalCreditCost)}`} />
                <Row label="Net benefit" value={fmt(netBenefit)} bold />
              </div>
            </CardContent>
          </Card>

          {/* Disclaimer */}
          <p className="text-xs text-muted-foreground text-center max-w-2xl mx-auto">
            These estimates are illustrative only, based on industry averages for conveyancing search review.
            Actual savings will vary depending on case complexity, firm processes, and the types of searches conducted.
            The average PI claim cost used is {fmt(AVG_CLAIM_COST)} based on industry data.
          </p>
        </motion.div>
      )}
    </div>
  );
};

export default ROICalculator;
