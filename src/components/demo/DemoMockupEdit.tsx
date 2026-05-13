import { motion } from "framer-motion";
import { Edit3, RotateCcw, Shield } from "lucide-react";

const reportLines = [
  { text: "## 3.1 Local Authority Search", editable: false },
  { text: "The local authority search reveals a **Tree Preservation Order** affecting the western boundary of the property.", editable: false },
  { text: "**Recommendation:** Request confirmation from the seller whether any works have been carried out to the protected trees.", editable: true, highlight: true },
  { text: "", editable: false },
  { text: "## 3.2 Environmental Search", editable: false },
  { text: "No contaminative land use identified within 250m. Flood risk is Zone 1 (low).", editable: false },
];

export default function DemoMockupEdit() {
  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-1 border-b border-border pb-0">
        {["Internal Report", "Client Report", "Draft Email"].map((tab, i) => (
          <div
            key={tab}
            className={`px-3 py-1.5 text-[11px] font-semibold rounded-t-md ${
              i === 0 ? "bg-background border border-b-0 border-border text-foreground" : "text-muted-foreground"
            }`}
          >
            {tab}
          </div>
        ))}
      </div>

      {/* Editable content */}
      <div className="space-y-1">
        {reportLines.map((line, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 + i * 0.06 }}
            className={`relative px-3 py-1 rounded ${
              line.highlight
                ? "bg-sky-500/10 border-l-2 border-sky-500"
                : ""
            }`}
          >
            <p className="text-[11px] text-foreground leading-relaxed font-mono">{line.text}</p>
            {line.highlight && (
              <motion.div
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.6 }}
                className="absolute -right-1 top-1/2 -translate-y-1/2 flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-500 text-white text-[8px] font-bold uppercase shadow-sm"
              >
                <Edit3 size={8} /> Editable
              </motion.div>
            )}
          </motion.div>
        ))}
      </div>

      {/* Highlighted controls */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
        className="rounded-lg border-2 border-sky-500/30 bg-sky-500/5 p-3 space-y-2"
      >
        <div className="absolute -top-2.5 left-3 px-2 bg-card text-[9px] font-bold text-sky-500 uppercase tracking-wider">
          You Stay In Control
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-background border border-border text-[10px] font-medium text-foreground">
            <Edit3 size={10} className="text-sky-500" /> Edit any section
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-background border border-border text-[10px] font-medium text-foreground">
            <RotateCcw size={10} className="text-sky-500" /> Version history
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-background border border-border text-[10px] font-medium text-foreground">
            <Shield size={10} className="text-sky-500" /> Audit logged
          </div>
        </div>
      </motion.div>
    </div>
  );
}
