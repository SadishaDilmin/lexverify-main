import { type LucideIcon } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

interface Props {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

/** Friendly empty state with icon, message, and optional CTA */
export default function EmptyState({ icon: Icon, title, description, actionLabel, onAction }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col items-center justify-center py-16 px-6 text-center"
    >
      <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mb-5">
        <Icon size={28} className="text-accent" />
      </div>
      <h3
        className="text-lg font-semibold text-foreground mb-2"
        style={{ fontFamily: "'DM Sans', sans-serif" }}
      >
        {title}
      </h3>
      <p className="text-sm text-muted-foreground max-w-sm mb-5 leading-relaxed">
        {description}
      </p>
      {actionLabel && onAction && (
        <Button
          onClick={onAction}
          className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90"
        >
          {actionLabel}
        </Button>
      )}
    </motion.div>
  );
}
