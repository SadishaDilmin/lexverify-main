import { motion } from "framer-motion";
import { File, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface UploadItem {
  name: string;
  status: "pending" | "uploading" | "done" | "error";
  progress?: number; // 0-100
  error?: string;
}

interface Props {
  items: UploadItem[];
  className?: string;
}

/** Shows file-by-file upload progress with status icons */
export default function UploadProgress({ items, className }: Props) {
  if (items.length === 0) return null;

  const done = items.filter((i) => i.status === "done").length;
  const total = items.length;
  const overallPct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className={cn("rounded-xl border border-border/40 bg-card overflow-hidden", className)}>
      {/* Overall progress bar */}
      <div className="px-4 py-2.5 border-b border-border/30 flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">
          Uploading {done}/{total} files
        </span>
        <span className="text-xs text-muted-foreground">{overallPct}%</span>
      </div>
      <div className="h-1 bg-muted/30">
        <motion.div
          className="h-full bg-accent"
          initial={{ width: 0 }}
          animate={{ width: `${overallPct}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      {/* File list */}
      <div className="max-h-48 overflow-y-auto divide-y divide-border/20">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2.5 px-4 py-2">
            {item.status === "done" ? (
              <CheckCircle2 size={14} className="text-green-500 shrink-0" />
            ) : item.status === "error" ? (
              <AlertCircle size={14} className="text-destructive shrink-0" />
            ) : item.status === "uploading" ? (
              <Loader2 size={14} className="text-accent shrink-0 animate-spin" />
            ) : (
              <File size={14} className="text-muted-foreground shrink-0" />
            )}
            <span className="text-xs text-foreground truncate flex-1">{item.name}</span>
            {item.status === "uploading" && item.progress !== undefined && (
              <span className="text-[10px] text-muted-foreground">{item.progress}%</span>
            )}
            {item.error && (
              <span className="text-[10px] text-destructive truncate max-w-[120px]">{item.error}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
