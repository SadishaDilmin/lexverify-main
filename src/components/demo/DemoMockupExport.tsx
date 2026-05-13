import { motion } from "framer-motion";
import { Download, FileText, Mail, ClipboardList, CheckCircle2 } from "lucide-react";

const exports = [
  { icon: Download, label: "Download Word Report", ext: ".docx", desc: "Full internal report with findings", done: true },
  { icon: FileText, label: "Export PDF Summary", ext: ".pdf", desc: "Client-ready summary report", done: true },
  { icon: Mail, label: "Copy Draft Enquiry Email", ext: "", desc: "Ready to paste & send to seller's conveyancer", done: false },
];

export default function DemoMockupExport() {
  return (
    <div className="space-y-4">
      {/* Export cards */}
      <div className="space-y-2.5">
        {exports.map((item, i) => {
          const Icon = item.icon;
          return (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.12 }}
              className={`p-3 rounded-lg border-2 ${
                i === 2
                  ? "border-rose-500/40 bg-rose-500/5"
                  : "border-border bg-background"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                  i === 2 ? "bg-rose-500/10 text-rose-500" : "bg-muted text-foreground"
                }`}>
                  <Icon size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold text-foreground">{item.label}</p>
                    {item.ext && (
                      <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{item.ext}</span>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{item.desc}</p>
                </div>
                {item.done ? (
                  <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                ) : (
                  <div className="h-7 px-3 rounded-md bg-accent flex items-center text-[10px] font-semibold text-accent-foreground shrink-0">
                    Copy
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Audit trail highlight */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7 }}
        className="rounded-lg border-2 border-rose-500/30 bg-rose-500/5 p-3"
      >
        <div className="flex items-start gap-2">
          <ClipboardList size={14} className="text-rose-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-foreground">Full Audit Trail</p>
            <p className="text-[10px] text-muted-foreground leading-snug mt-0.5">Every download, copy, and export is timestamped and logged for PI defence and regulatory compliance.</p>
          </div>
        </div>
      </motion.div>

      {/* Timeline mockup */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.85 }}
        className="space-y-1.5"
      >
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Recent Activity</p>
        {[
          { time: "09:14", action: "Internal report downloaded (.docx)" },
          { time: "09:12", action: "Client report exported (.pdf)" },
          { time: "09:10", action: "AI review completed — 72/100 risk" },
        ].map((entry) => (
          <div key={entry.time} className="flex items-center gap-2 text-[10px]">
            <span className="font-mono text-muted-foreground w-10 shrink-0">{entry.time}</span>
            <div className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
            <span className="text-foreground">{entry.action}</span>
          </div>
        ))}
      </motion.div>
    </div>
  );
}
