import { memo } from "react";
import { motion } from "framer-motion";

interface RingChartProps {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  label?: string;
  sublabel?: string;
}

function getAutoColor(pct: number): string {
  if (pct >= 70) return "hsl(35, 90%, 50%)";   // amber-ish
  if (pct >= 40) return "hsl(45, 90%, 50%)";   // yellow-ish
  return "hsl(145, 60%, 45%)";                  // green
}

const RingChart = memo(function RingChart({
  value,
  max = 100,
  size = 64,
  strokeWidth = 3.5,
  color,
  label,
  sublabel,
}: RingChartProps) {
  const pct = Math.min((value / max) * 100, 100);
  const strokeColor = color ?? getAutoColor(pct);

  return (
    <div className="flex items-center gap-3">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
          <path
            d="M18 2.0845a 15.9155 15.9155 0 0 1 0 31.831a 15.9155 15.9155 0 0 1 0 -31.831"
            fill="none"
            stroke="hsl(var(--muted))"
            strokeWidth={strokeWidth}
          />
          <motion.path
            d="M18 2.0845a 15.9155 15.9155 0 0 1 0 31.831a 15.9155 15.9155 0 0 1 0 -31.831"
            fill="none"
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            initial={{ strokeDasharray: "0, 100" }}
            animate={{ strokeDasharray: `${pct}, 100` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />
        </svg>
        {!label && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-sm font-bold text-foreground">{value}</span>
          </div>
        )}
      </div>
      {(label || sublabel) && (
        <div className="min-w-0">
          {label && <p className="text-sm font-semibold text-foreground leading-tight">{label}</p>}
          {sublabel && <p className="text-[11px] text-muted-foreground">{sublabel}</p>}
        </div>
      )}
    </div>
  );
});

export default RingChart;
