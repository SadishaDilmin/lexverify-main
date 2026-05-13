import { motion } from "framer-motion";

export default function DemoMockupSignup() {
  return (
    <div className="space-y-4">
      {/* Form fields */}
      <div className="space-y-3">
        <div>
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Full Name</label>
          <div className="h-9 rounded-lg border border-border bg-background px-3 flex items-center text-sm text-foreground">
            Jane Smith
          </div>
        </div>
        <div>
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Work Email</label>
          <div className="h-9 rounded-lg border border-border bg-background px-3 flex items-center text-sm text-foreground">
            jane@smithlaw.co.uk
          </div>
          <p className="text-[9px] text-muted-foreground mt-0.5">Only Law Society / CLC registered firm domains accepted</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Firm Name</label>
            <div className="h-9 rounded-lg border border-border bg-background px-3 flex items-center text-sm text-foreground truncate">
              Smith & Partners LLP
            </div>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Position</label>
            <div className="h-9 rounded-lg border border-border bg-background px-3 flex items-center text-sm text-foreground truncate">
              Licensed Conveyancer
            </div>
          </div>
        </div>
        <div>
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Password</label>
          <div className="h-9 rounded-lg border border-border bg-background px-3 flex items-center text-sm text-muted-foreground tracking-widest">
            ••••••••••
          </div>
        </div>
      </div>

      {/* Highlight: free credits callout */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.4, duration: 0.4 }}
        className="relative rounded-lg border-2 border-accent bg-accent/5 p-3"
      >
        <div className="absolute -top-2.5 left-3 px-2 bg-card text-[9px] font-bold text-accent uppercase tracking-wider">
          Included Free
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">100 Free Credits</p>
            <p className="text-[11px] text-muted-foreground">No credit card required</p>
          </div>
          <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center text-accent font-bold text-sm">
            🎁
          </div>
        </div>
      </motion.div>

      {/* CTA button */}
      <div className="h-10 rounded-lg bg-accent flex items-center justify-center text-sm font-semibold text-accent-foreground">
        Create Account
      </div>
    </div>
  );
}
