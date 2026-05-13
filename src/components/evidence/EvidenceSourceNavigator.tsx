import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { EvidenceReference } from "./types";

interface EvidenceSourceNavigatorProps {
  references: EvidenceReference[];
  currentIndex: number;
  onNavigate: (index: number) => void;
}

export default function EvidenceSourceNavigator({
  references,
  currentIndex,
  onNavigate,
}: EvidenceSourceNavigatorProps) {
  if (references.length <= 1) return null;

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="icon"
        className="h-7 w-7"
        disabled={currentIndex === 0}
        onClick={() => onNavigate(currentIndex - 1)}
      >
        <ChevronLeft size={14} />
      </Button>
      <span className="text-xs text-muted-foreground whitespace-nowrap">
        Source <span className="font-semibold text-foreground">{currentIndex + 1}</span> of{" "}
        <span className="font-semibold text-foreground">{references.length}</span>
      </span>
      <Button
        variant="outline"
        size="icon"
        className="h-7 w-7"
        disabled={currentIndex === references.length - 1}
        onClick={() => onNavigate(currentIndex + 1)}
      >
        <ChevronRight size={14} />
      </Button>

      {/* Source pills */}
      <div className="flex gap-1 ml-2">
        {references.map((_, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => onNavigate(idx)}
            className={`w-2 h-2 rounded-full transition-colors ${
              idx === currentIndex ? "bg-accent" : "bg-muted-foreground/30 hover:bg-muted-foreground/50"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
