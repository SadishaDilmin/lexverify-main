import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface InfoTooltipProps {
  title: string;
  children: React.ReactNode;
  className?: string;
}

export default function InfoTooltip({ title, children, className = "" }: InfoTooltipProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors focus:outline-none ${className}`}
          aria-label={`Info: ${title}`}
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="center" className="max-w-xs text-left p-3">
        <p className="font-semibold text-sm mb-1">{title}</p>
        <div className="text-xs text-muted-foreground space-y-1">{children}</div>
      </PopoverContent>
    </Popover>
  );
}
