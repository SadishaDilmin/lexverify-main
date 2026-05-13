import { useState, useCallback, useRef, type DragEvent, type ReactNode } from "react";
import { Upload, FileCheck } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface Props {
  onFiles: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  maxSizeMB?: number;
  children?: ReactNode;
  className?: string;
  disabled?: boolean;
}

/**
 * Drag-and-drop file upload zone with visual feedback.
 * Wraps children or renders default prompt.
 */
export default function DropZone({
  onFiles,
  accept,
  multiple = true,
  maxSizeMB = 100,
  children,
  className,
  disabled,
}: Props) {
  const [dragOver, setDragOver] = useState(false);
  const [recentDrop, setRecentDrop] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrag = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragIn = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer?.items?.length) setDragOver(true);
  }, []);

  const handleDragOut = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const processFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList) return;
      const maxBytes = maxSizeMB * 1024 * 1024;
      const valid = Array.from(fileList).filter((f) => f.size <= maxBytes);
      if (valid.length > 0) {
        onFiles(valid);
        setRecentDrop(true);
        setTimeout(() => setRecentDrop(false), 1500);
      }
    },
    [onFiles, maxSizeMB]
  );

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      if (disabled) return;
      processFiles(e.dataTransfer?.files);
    },
    [disabled, processFiles]
  );

  const handleClick = () => {
    if (!disabled) inputRef.current?.click();
  };

  return (
    <div
      onDragEnter={handleDragIn}
      onDragLeave={handleDragOut}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      onClick={handleClick}
      className={cn(
        "relative rounded-xl border-2 border-dashed transition-all duration-200 cursor-pointer",
        dragOver
          ? "border-accent bg-accent/5 scale-[1.01]"
          : "border-border/50 hover:border-border hover:bg-muted/20",
        recentDrop && "border-green-500/50 bg-green-50/5",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => processFiles(e.target.files)}
      />

      <AnimatePresence mode="wait">
        {dragOver ? (
          <motion.div
            key="drag"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center py-10 px-6"
          >
            <Upload size={32} className="text-accent mb-2 animate-bounce" />
            <p className="text-sm font-medium text-accent">Drop files here</p>
          </motion.div>
        ) : recentDrop ? (
          <motion.div
            key="done"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center py-10 px-6"
          >
            <FileCheck size={28} className="text-green-500 mb-2" />
            <p className="text-sm font-medium text-green-600">Files added!</p>
          </motion.div>
        ) : children ? (
          <motion.div key="custom" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {children}
          </motion.div>
        ) : (
          <motion.div
            key="default"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-10 px-6"
          >
            <div className="w-12 h-12 rounded-xl bg-muted/50 flex items-center justify-center mb-3">
              <Upload size={20} className="text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground mb-1">
              Drag & drop files here
            </p>
            <p className="text-xs text-muted-foreground">
              or click to browse · max {maxSizeMB}MB per file
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
