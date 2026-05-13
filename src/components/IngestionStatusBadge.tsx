import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Loader2, CheckCircle2, AlertCircle, Clock, Film, Mic, Eye } from "lucide-react";

type IngestionStatus = "pending" | "processing" | "completed" | "error" | "unknown";

interface IngestionStatusBadgeProps {
  status: IngestionStatus;
  fileType?: string;
  visualSummary?: string;
  verified?: boolean;
  className?: string;
}

const config: Record<IngestionStatus, { label: string; icon: typeof Clock; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Queued", icon: Clock, variant: "outline" },
  processing: { label: "Transcribing…", icon: Loader2, variant: "secondary" },
  completed: { label: "Ready for AI", icon: CheckCircle2, variant: "default" },
  error: { label: "Extract Failed", icon: AlertCircle, variant: "destructive" },
  unknown: { label: "Not Indexed", icon: Clock, variant: "outline" },
};

// Media-specific labels during processing
const mediaProcessingLabels: Record<string, { label: string; icon: typeof Mic }> = {
  audio: { label: "Transcribing Audio…", icon: Mic },
  video: { label: "Analyzing Media…", icon: Film },
};

export default function IngestionStatusBadge({ status, fileType, visualSummary, verified, className }: IngestionStatusBadgeProps) {
  // Use media-specific labels when processing audio/video
  const isMediaProcessing = status === "processing" && fileType && mediaProcessingLabels[fileType];
  const mediaConfig = isMediaProcessing ? mediaProcessingLabels[fileType!] : null;

  const c = config[status] ?? config.unknown;
  const Icon = mediaConfig?.icon ?? c.icon;
  const label = mediaConfig?.label ?? c.label;

  const badge = (
    <Badge variant={c.variant} className={className}>
      <Icon size={12} className={`mr-1 ${status === "processing" ? "animate-spin" : ""}`} />
      {label}
      {status === "completed" && verified === false && (
        <AlertCircle size={10} className="ml-1 text-amber-500" />
      )}
      {status === "completed" && visualSummary && (
        <Eye size={10} className="ml-1 text-primary" />
      )}
    </Badge>
  );

  // Wrap with tooltip if there's a visual summary
  if (visualSummary && status === "completed") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent side="top" className="max-w-sm text-xs">
          <p className="font-semibold mb-1 flex items-center gap-1">
            <Film size={12} /> Visual Summary
          </p>
          <p className="text-muted-foreground whitespace-pre-line line-clamp-6">
            {visualSummary.slice(0, 500)}{visualSummary.length > 500 ? "…" : ""}
          </p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return badge;
}
