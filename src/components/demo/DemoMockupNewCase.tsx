import { motion } from "framer-motion";
import { Home, MapPin } from "lucide-react";

export default function DemoMockupNewCase() {
  return (
    <div className="space-y-4">
      {/* Case ref highlight */}
      <div>
        <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Your Case Reference</label>
        <div className="h-9 rounded-lg border border-border bg-background px-3 flex items-center gap-2 text-sm text-foreground">
          <span className="font-mono font-semibold">SL-2026-00312</span>
          <span className="text-[10px] text-muted-foreground ml-auto">Enter your firm's reference</span>
        </div>
      </div>

      {/* Property address */}
      <div>
        <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Property Address</label>
        <div className="h-9 rounded-lg border border-border bg-background px-3 flex items-center gap-2 text-sm text-foreground">
          <MapPin size={12} className="text-muted-foreground shrink-0" />
          14 Elm Grove, London SW4 7QP
        </div>
      </div>

      {/* Highlighted form section */}
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.35 }}
        className="relative rounded-lg border-2 border-accent/40 bg-accent/5 p-3 space-y-3"
      >
        <div className="absolute -top-2.5 left-3 px-2 bg-card text-[9px] font-bold text-accent uppercase tracking-wider">
          Case Details
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-md bg-background border border-border p-2 text-center">
            <p className="text-[9px] text-muted-foreground uppercase">Type</p>
            <p className="text-xs font-semibold text-foreground mt-0.5">Purchase</p>
          </div>
          <div className="rounded-md bg-background border border-border p-2 text-center">
            <p className="text-[9px] text-muted-foreground uppercase">Tenure</p>
            <p className="text-xs font-semibold text-foreground mt-0.5">Freehold</p>
          </div>
          <div className="rounded-md bg-background border border-border p-2 text-center">
            <p className="text-[9px] text-muted-foreground uppercase">Property</p>
            <p className="text-xs font-semibold text-foreground mt-0.5 flex items-center justify-center gap-1"><Home size={10} /> House</p>
          </div>
        </div>
      </motion.div>

      {/* Buyer details */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Buyer Name</label>
          <div className="h-9 rounded-lg border border-border bg-background px-3 flex items-center text-sm text-foreground">
            Jane Smith
          </div>
        </div>
        <div>
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Buyer Type</label>
          <div className="h-9 rounded-lg border border-border bg-background px-3 flex items-center text-sm text-foreground">
            First-time buyer
          </div>
        </div>
      </div>

      <div className="h-10 rounded-lg bg-accent flex items-center justify-center text-sm font-semibold text-accent-foreground">
        Create Case →
      </div>
    </div>
  );
}
