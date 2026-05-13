import { useState, useRef, useCallback } from "react";
import { FileText, X, Paperclip, Upload, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

// ── Types ──────────────────────────────────────────────────────────────
export interface AttachedFile {
  id: string;
  name: string;
  mimeType: string;
  base64: string;
  size: number;
  fileHash?: string;
}

// ── Constants ──────────────────────────────────────────────────────────
const ALLOWED_EXTENSIONS = [
  ".pdf", ".txt", ".csv", ".md",
  ".doc", ".docx",
  ".jpg", ".jpeg", ".png", ".tif", ".tiff", ".bmp", ".webp", ".heic",
  ".eml", ".msg",
  ".dwg", ".dxf",
  ".xls", ".xlsx",
  ".rtf",
];
const ALLOWED_MIME_TYPES = [
  "application/pdf", "text/plain", "text/csv", "text/markdown",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg", "image/png", "image/tiff", "image/bmp", "image/webp", "image/heic",
  "message/rfc822", "application/vnd.ms-outlook",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/rtf", "text/rtf",
];
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const MAX_FILES = 100;

// ── Helpers ────────────────────────────────────────────────────────────
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isAllowedFile(file: File): boolean {
  const ext = "." + file.name.split(".").pop()?.toLowerCase();
  return ALLOWED_EXTENSIONS.includes(ext) || ALLOWED_MIME_TYPES.includes(file.type);
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1] || result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function normalizeFileName(name: string): string {
  return name.toLowerCase().trim().replace(/\.[a-z0-9]{1,8}$/i, "").replace(/[^a-z0-9]+/g, "");
}

/** Compute SHA-256 directly from File ArrayBuffer — avoids atob() memory issues on large files */
async function sha256FromFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ── File chip component ────────────────────────────────────────────────
export function FileChip({
  file,
  onRemove,
  disabled,
  ownerName,
}: {
  file: AttachedFile;
  onRemove: () => void;
  disabled?: boolean;
  ownerName?: string;
}) {
  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-muted border border-border text-sm">
      <FileText size={14} className="text-accent shrink-0" />
      <span className="truncate max-w-[180px] text-foreground">{file.name}</span>
      {ownerName && (
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-medium leading-none shrink-0">
          <User size={10} className="shrink-0" />
          {ownerName}
        </span>
      )}
      <span className="text-muted-foreground text-xs">({formatFileSize(file.size)})</span>
      {!disabled && (
        <button
          onClick={onRemove}
          className="ml-1 text-muted-foreground hover:text-destructive transition-colors"
          aria-label="Remove file"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

// ── Multi-file attachment hook ─────────────────────────────────────────
export function useMultiFileAttachment() {
  const { toast } = useToast();
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      const remaining = MAX_FILES - attachedFiles.length;

      if (remaining <= 0) {
        toast({
          title: "Maximum files reached",
          description: `You can attach up to ${MAX_FILES} files.`,
          variant: "destructive",
        });
        return;
      }

      const toProcess = fileArray.slice(0, remaining);
      if (fileArray.length > remaining) {
        toast({
          title: "Some files skipped",
          description: `Only ${remaining} more file(s) can be attached (max ${MAX_FILES}).`,
          variant: "destructive",
        });
      }

      const knownHashes = new Set(
        attachedFiles
          .map((f) => (f.fileHash || "").toLowerCase().trim())
          .filter(Boolean)
      );
      const knownNameSize = new Set(
        attachedFiles.map((f) => `${normalizeFileName(f.name)}::${f.size}`)
      );

      const duplicateNames: string[] = [];
      const newFiles: AttachedFile[] = [];
      for (const file of toProcess) {
        if (!isAllowedFile(file)) {
          toast({
            title: `Unsupported: ${file.name}`,
            description: "Please upload PDF, TXT, CSV, or MD files.",
            variant: "destructive",
          });
          continue;
        }
        if (file.size > MAX_FILE_SIZE) {
          toast({
            title: `Too large: ${file.name}`,
            description: "Maximum file size is 10MB.",
            variant: "destructive",
          });
          continue;
        }
        try {
          const fileHash = await sha256FromFile(file);
          const base64 = await fileToBase64(file);
          const nameSizeKey = `${normalizeFileName(file.name)}::${file.size}`;

          if (knownHashes.has(fileHash) || knownNameSize.has(nameSizeKey)) {
            duplicateNames.push(file.name);
            continue;
          }

          knownHashes.add(fileHash);
          knownNameSize.add(nameSizeKey);

          newFiles.push({
            id: generateId(),
            name: file.name,
            mimeType: file.type || "application/octet-stream",
            base64,
            size: file.size,
            fileHash,
          });
        } catch {
          toast({
            title: "Error",
            description: `Failed to read ${file.name}.`,
            variant: "destructive",
          });
        }
      }

      if (duplicateNames.length > 0) {
        const shown = duplicateNames.slice(0, 3).join(", ");
        const remainingDupes = duplicateNames.length - 3;
        toast({
          title: "Duplicate document skipped",
          description: remainingDupes > 0
            ? `${shown}, and ${remainingDupes} more matched an already attached file.`
            : `${shown} matches an already attached file.`,
          variant: "destructive",
        });
      }

      if (newFiles.length > 0) {
        setAttachedFiles((prev) => [...prev, ...newFiles]);
      }
    },
    [attachedFiles, toast]
  );

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      await processFiles(files);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [processFiles]
  );

  const removeFile = useCallback((id: string) => {
    setAttachedFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const clearFiles = useCallback(() => setAttachedFiles([]), []);

  const addAttachedFiles = useCallback((files: AttachedFile[]) => {
    setAttachedFiles((prev) => [...prev, ...files]);
  }, []);

  return {
    attachedFiles,
    fileInputRef,
    handleFileSelect,
    removeFile,
    clearFiles,
    processFiles,
    addAttachedFiles,
  };
}

// ── Drop zone overlay ──────────────────────────────────────────────────
export function DropZoneOverlay({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="absolute inset-0 z-50 bg-accent/10 border-2 border-dashed border-accent rounded-xl flex flex-col items-center justify-center pointer-events-none backdrop-blur-sm">
      <Upload size={40} className="text-accent mb-3 animate-bounce" />
      <p className="text-accent font-semibold text-lg">Drop documents here</p>
      <p className="text-accent/70 text-sm mt-1">
        PDF, Word, images, Excel, emails, plans — up to 50 files per drop
      </p>
      <p className="text-accent/70 text-xs mt-0.5">
        For larger batches (up to 100 files), use the Upload Folder button
      </p>
    </div>
  );
}

// ── Attached files bar ─────────────────────────────────────────────────
export function AttachedFilesBar({
  files,
  onRemove,
  disabled,
}: {
  files: AttachedFile[];
  onRemove: (id: string) => void;
  disabled?: boolean;
}) {
  if (files.length === 0) return null;
  return (
    <div className="mb-2 flex flex-wrap gap-1.5">
      {files.map((file) => (
        <FileChip
          key={file.id}
          file={file}
          onRemove={() => onRemove(file.id)}
          disabled={disabled}
        />
      ))}
      <span className="text-xs text-muted-foreground self-center ml-1">
        {files.length} file{files.length !== 1 ? "s" : ""} attached
      </span>
    </div>
  );
}
