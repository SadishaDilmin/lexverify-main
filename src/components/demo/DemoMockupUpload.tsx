import { motion } from "framer-motion";
import { Upload, FileText, CheckCircle2, Landmark, Droplets, TreePine, Zap, ChevronDown } from "lucide-react";

const files = [
  { name: "Search Report Pack.pdf", pages: 12, assigned: true, type: "Local Authority Search", icon: Landmark },
  { name: "Water Search.pdf", pages: 8, assigned: true, type: "Drainage & Water Search", icon: Droplets },
  { name: "Env Report.pdf", pages: 6, assigned: true, type: "Environmental Search", icon: TreePine },
  { name: "Certificate.pdf", pages: 4, assigned: false, type: "Select type…", icon: null },
];

export default function DemoMockupUpload() {
  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15 }}
        className="border-2 border-dashed border-accent/40 rounded-xl p-5 flex flex-col items-center gap-2 bg-accent/5"
      >
        <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center">
          <Upload size={18} className="text-accent" />
        </div>
        <p className="text-xs font-semibold text-foreground">Drag & drop files here</p>
        <p className="text-[10px] text-muted-foreground">PDF, DOC, DOCX, TXT, PNG, JPG — up to 20 MB each</p>
      </motion.div>

      {/* File list with manual type selectors */}
      <div className="space-y-2">
        {files.map((f, i) => {
          const Icon = f.icon;
          return (
            <motion.div
              key={f.name}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.25 + i * 0.1 }}
              className="flex items-center gap-3 p-2.5 rounded-lg border border-border bg-background"
            >
              <FileText size={14} className="text-accent shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground truncate">{f.name}</p>
                <p className="text-[10px] text-muted-foreground">{f.pages} pages</p>
              </div>
              {/* Simulated dropdown selector */}
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.5 + i * 0.12 }}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-md border text-[10px] font-medium ${
                  f.assigned
                    ? "border-accent/30 bg-accent/5 text-accent"
                    : "border-border bg-muted/30 text-muted-foreground"
                }`}
              >
                {Icon && <Icon size={10} className="shrink-0" />}
                <span className="whitespace-nowrap">{f.type}</span>
                <ChevronDown size={9} className="shrink-0 opacity-50" />
              </motion.div>
              {f.assigned && (
                <CheckCircle2 size={13} className="text-risk-green shrink-0" />
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Annotation */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="rounded-lg border-2 border-accent/30 bg-accent/5 px-3 py-2 flex items-start gap-2"
      >
        <div className="text-[9px] font-bold text-accent uppercase tracking-wider whitespace-nowrap mt-0.5">Manual Selection</div>
        <p className="text-[11px] text-muted-foreground leading-snug">Choose the correct document type for each file using the dropdown — one document per type.</p>
      </motion.div>
    </div>
  );
}
