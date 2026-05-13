import { motion } from "framer-motion";
import {
  ShieldCheck, CheckCircle2, AlertTriangle, FileText,
  Users, Wallet, BarChart3,
} from "lucide-react";

const riskScore = 34;
const riskLabel = "Low Risk";

const findings = [
  { label: "Salary verified — 12 months of payslips cross-referenced", level: "green" as const },
  { label: "Savings account balance consistent with declared income", level: "green" as const },
  { label: "Gift element (£25,000) — giftor declaration outstanding", level: "amber" as const },
  { label: "No PEP, sanctions, or adverse media indicators", level: "green" as const },
  { label: "Deposit source matches bank statement credits", level: "green" as const },
];

const outputs = [
  { label: "Internal SoW Report", icon: FileText },
  { label: "Client Email Draft", icon: Users },
  { label: "AML Risk Rating", icon: BarChart3 },
  { label: "Structured Enquiries", icon: Wallet },
];

function RiskCircle({ score, size = 44 }: { score: number; size?: number }) {
  const color = score >= 70 ? "hsl(0, 70%, 55%)" : score >= 50 ? "hsl(35, 90%, 50%)" : "hsl(145, 60%, 45%)";
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
        <path
          d="M18 2.0845a 15.9155 15.9155 0 0 1 0 31.831a 15.9155 15.9155 0 0 1 0 -31.831"
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth="3.5"
        />
        <motion.path
          d="M18 2.0845a 15.9155 15.9155 0 0 1 0 31.831a 15.9155 15.9155 0 0 1 0 -31.831"
          fill="none"
          stroke={color}
          strokeWidth="3.5"
          strokeLinecap="round"
          initial={{ strokeDasharray: "0, 100" }}
          animate={{ strokeDasharray: `${score}, 100` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xs font-bold text-foreground">{score}</span>
      </div>
    </div>
  );
}

export default function DemoMockupAgents() {
  return (
    <div className="space-y-3">
      {/* Agent header */}
      <div className="flex items-center gap-2 mb-1">
        <div className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center">
          <ShieldCheck size={16} className="text-accent" />
        </div>
        <div>
          <p className="text-xs font-semibold text-foreground">Olimey AI</p>
          <p className="text-[10px] text-muted-foreground">Source of Wealth Assessment · 20 credits</p>
        </div>
      </div>

      {/* Output preview */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-lg border-2 border-accent/30 bg-accent/5 p-3 space-y-3"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[9px] font-bold text-accent uppercase tracking-wider">
              Preview Output
            </p>
            <p className="text-xs font-semibold text-foreground mt-0.5">
              Olimey AI Assessment
            </p>
            <p className="text-[10px] text-muted-foreground">{riskLabel}</p>
          </div>
          <RiskCircle score={riskScore} />
        </div>

        {/* Findings */}
        <div className="space-y-1">
          {findings.map((f, i) => (
            <motion.div
              key={f.label}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06 }}
              className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] ${
                f.level === "amber"
                  ? "bg-amber-500/10 text-amber-600"
                  : "bg-emerald-500/10 text-emerald-600"
              }`}
            >
              {f.level === "amber" ? (
                <AlertTriangle size={10} className="shrink-0" />
              ) : (
                <CheckCircle2 size={10} className="shrink-0" />
              )}
              <span className="truncate">{f.label}</span>
            </motion.div>
          ))}
        </div>

        {/* Outputs generated */}
        <div className="flex flex-wrap gap-1.5">
          {outputs.map((o) => {
            const Icon = o.icon;
            return (
              <span
                key={o.label}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-background border border-border text-[9px] font-medium text-foreground"
              >
                <Icon size={8} className="text-accent" />
                {o.label}
              </span>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}
