import { motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, XCircle, FileText } from "lucide-react";

const flags = [
  { label: "Chancel liability not insured", level: "red" },
  { label: "Mining search — historical workings nearby", level: "amber" },
  { label: "Drainage map mismatch with plan", level: "amber" },
  { label: "Tree Preservation Order on boundary", level: "amber" },
  { label: "Flood Zone 1 — low risk confirmed", level: "green" },
];

export default function DemoMockupReport() {
  return (
    <div className="space-y-4">
      {/* Risk score hero */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.15 }}
        className="relative rounded-xl border-2 border-amber-500/40 bg-amber-500/5 p-4"
      >
        <div className="absolute -top-2.5 left-3 px-2 bg-card text-[9px] font-bold text-amber-600 uppercase tracking-wider">
          AI Risk Assessment
        </div>
        <div className="flex items-center gap-4">
          {/* Score circle */}
          <div className="relative w-16 h-16 shrink-0">
            <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
              <path d="M18 2.0845a 15.9155 15.9155 0 0 1 0 31.831a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="hsl(var(--muted))" strokeWidth="3" />
              <motion.path
                d="M18 2.0845a 15.9155 15.9155 0 0 1 0 31.831a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="hsl(35, 90%, 50%)"
                strokeWidth="3"
                strokeDasharray="72, 100"
                initial={{ strokeDasharray: "0, 100" }}
                animate={{ strokeDasharray: "72, 100" }}
                transition={{ delay: 0.3, duration: 0.8, ease: "easeOut" }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-lg font-bold text-foreground">72</span>
            </div>
          </div>
          <div>
            <p className="text-sm font-bold text-foreground">Medium Risk</p>
            <div className="flex items-center gap-3 mt-1">
              <span className="flex items-center gap-1 text-[10px] font-semibold"><XCircle size={10} className="text-red-500" /> 1 Red</span>
              <span className="flex items-center gap-1 text-[10px] font-semibold"><AlertTriangle size={10} className="text-amber-500" /> 3 Amber</span>
              <span className="flex items-center gap-1 text-[10px] font-semibold"><CheckCircle2 size={10} className="text-emerald-500" /> 12 Green</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Flag list */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Top Risk Drivers</p>
        {flags.map((f, i) => (
          <motion.div
            key={f.label}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 + i * 0.08 }}
            className={`flex items-center gap-2 p-2 rounded-lg border ${
              f.level === "red" ? "border-red-500/30 bg-red-500/5" :
              f.level === "amber" ? "border-amber-500/20 bg-amber-500/5" :
              "border-emerald-500/20 bg-emerald-500/5"
            }`}
          >
            {f.level === "red" && <XCircle size={12} className="text-red-500 shrink-0" />}
            {f.level === "amber" && <AlertTriangle size={12} className="text-amber-500 shrink-0" />}
            {f.level === "green" && <CheckCircle2 size={12} className="text-emerald-500 shrink-0" />}
            <span className="text-[11px] text-foreground">{f.label}</span>
          </motion.div>
        ))}
      </div>

      {/* Generated outputs */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.9 }}
        className="grid grid-cols-2 gap-2"
      >
        {["Internal Report", "Client Report", "Draft Enquiries", "Audit Trail"].map((label) => (
          <div key={label} className="flex items-center gap-1.5 p-2 rounded-lg bg-muted/50 border border-border">
            <FileText size={10} className="text-accent shrink-0" />
            <span className="text-[10px] font-medium text-foreground">{label}</span>
          </div>
        ))}
      </motion.div>
    </div>
  );
}
