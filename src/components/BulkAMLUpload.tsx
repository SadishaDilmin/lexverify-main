import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload, FileText, Loader2, CheckCircle2, X, AlertTriangle, Copy,
  FolderUp, Sparkles, Eye, EyeOff, ChevronDown, UserCircle, ShieldCheck, ShieldAlert, Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import type { AttachedFile } from "@/components/AgentChatFileAttachment";
import { extractFilesFromDrop } from "@/lib/folderUpload";
import DuplicateDocumentDialog, { type DuplicateCandidate } from "@/components/DuplicateDocumentDialog";
import ClassificationConfirmDialog from "@/components/ClassificationConfirmDialog";
// ── Types ──────────────────────────────────────────────────────────────
export interface ClassifiedFile {
  id: string;
  file: AttachedFile;
  category: string;
  personName: string;
  dateOfBirth: string;
  issueDate?: string;
  description: string;
  confidence: "high" | "medium" | "low";
  readable: boolean;
  readabilityIssue?: string;
  confirmed: boolean;
  judgeOverridden?: boolean;
  judgeNotes?: string;
  /** SHA-256 fingerprint of file bytes for deterministic duplicate detection */
  fileHash?: string;
  /** Number of times a similar document was attempted to be uploaded */
  duplicateAttempts?: number;
}

export const AML_CATEGORIES = [
  "Bank Statement",
  "Payslip",
  "P60 / P45",
  "Tax Return / SA302",
  "Gift Letter / Declaration",
  "Mortgage Offer / Agreement in Principle",
  "ID Document (Passport / Driving Licence)",
  "Proof of Address",
  "Open Banking Report",
  "Purchase Instruction Form",
  "Property Valuation",
  "Savings / ISA Statement",
  "Pension Statement",
  "Investment / Share Certificate",
  "Business Accounts / Company Financials",
  "Solicitor Completion Statement",
  "Tenancy Agreement / Rental Income",
  "Inheritance / Probate Documentation",
  "Compensation / Settlement Agreement",
  "Insurance Policy",
  "Utility Bill",
  "Council Tax Bill",
  "Other / Unknown",
];

const ALLOWED_EXTENSIONS = new Set([
  ".pdf", ".txt", ".csv", ".md", ".doc", ".docx",
  ".jpg", ".jpeg", ".png", ".tif", ".tiff", ".bmp", ".webp", ".heic",
  ".eml", ".msg", ".xls", ".xlsx", ".rtf",
]);

const MAX_FILE_SIZE = 100 * 1024 * 1024;

function isAllowedFile(file: File): boolean {
  const ext = "." + file.name.split(".").pop()?.toLowerCase();
  return ALLOWED_EXTENSIONS.has(ext);
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve((reader.result as string).split(",")[1] || (reader.result as string));
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function sha256FromBase64(base64: string): Promise<string> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

const CONFIDENCE_COLORS: Record<string, string> = {
  high: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  low: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

// ── Extracted form data type ────────────────────────────────────────────
export interface ExtractedFormData {
  propertyAddress: string;
  purchasePrice: string;
  mortgageAmount: string;
  caseReference: string;
  tenure: string;
  stampDuty: string;
  legalFees: string;
  additionalContext: string;
  purchasers: {
    fullName: string;
    role: "Purchaser";
    fundingSource: string;
    contributionAmount: string;
    employmentStatus: string;
    additionalNotes: string;
    relationshipToPurchaser: string;
  }[];
  giftors: {
    fullName: string;
    role: "Giftor";
    fundingSource: string;
    contributionAmount: string;
    employmentStatus: string;
    additionalNotes: string;
    relationshipToPurchaser: string;
  }[];
  hasGiftors: boolean;
  corrections: { field: string; original: string; corrected: string; reason: string }[];
  verificationNotes: string;
  judgeApproved: boolean;
  extractionNotes: string;
}

interface BulkAMLUploadProps {
  onFilesClassified: (files: ClassifiedFile[]) => void;
  onFormExtracted?: (data: ExtractedFormData) => void;
  onBusyChange?: (busy: boolean) => void;
  disabled?: boolean;
}

export default function BulkAMLUpload({ onFilesClassified, onFormExtracted, onBusyChange, disabled }: BulkAMLUploadProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const [classifiedFiles, setClassifiedFiles] = useState<ClassifiedFile[]>([]);
  const classifiedFilesRef = useRef<ClassifiedFile[]>([]);
  classifiedFilesRef.current = classifiedFiles;
  const [classifying, setClassifying] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);
  const [showUnreadable, setShowUnreadable] = useState(true);
  const [extractingForm, setExtractingForm] = useState(false);
  const [nameWarnings, setNameWarnings] = useState<Array<{ severity: string; message: string; files: string[]; names: string[] }>>([]);
  const [nameJudgeSummary, setNameJudgeSummary] = useState<{ isFraudRisk: boolean; summary: string; mostImpactful: { message: string; files: string[]; names: string[] } | null } | null>(null);
  const [dobWarnings, setDobWarnings] = useState<Array<{ severity: string; message: string; files: string[]; datesOfBirth: string[] }>>([]);
  const [idWarnings, setIdWarnings] = useState<Array<{ severity: string; message: string; files: string[]; issueDate: string; personName: string }>>([]);
  const [duplicateCandidates, setDuplicateCandidates] = useState<DuplicateCandidate[]>([]);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [showClassifyConfirm, setShowClassifyConfirm] = useState(false);

  // Notify parent when busy state changes
  const isBusy = classifying || extractingForm;
  const prevBusy = useRef(isBusy);
  if (prevBusy.current !== isBusy) {
    prevBusy.current = isBusy;
    onBusyChange?.(isBusy);
  }

  const CLASSIFY_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/classify-aml-docs`;
  const EXTRACT_FORM_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/extract-form-from-docs`;

  const processAndClassify = useCallback(async (rawFiles: File[]) => {
    const invalid = rawFiles.filter((f) => !isAllowedFile(f));
    const tooLarge = rawFiles.filter((f) => f.size > MAX_FILE_SIZE);
    const valid = rawFiles.filter((f) => isAllowedFile(f) && f.size <= MAX_FILE_SIZE);

    if (invalid.length > 0) {
      toast({
        title: `${invalid.length} unsupported file(s) skipped`,
        description: invalid.slice(0, 3).map((f) => f.name).join(", ") + (invalid.length > 3 ? "…" : ""),
        variant: "destructive",
      });
    }
    if (tooLarge.length > 0) {
      toast({
        title: `${tooLarge.length} file(s) too large`,
        description: "Files must be under 100MB each.",
        variant: "destructive",
      });
    }
    if (valid.length === 0) return;

    const MAX_BATCH = 100;
    const filesToProcess = valid.slice(0, MAX_BATCH);
    if (valid.length > MAX_BATCH) {
      toast({
        title: `Processing first ${MAX_BATCH} of ${valid.length} files`,
        description: `${valid.length - MAX_BATCH} file(s) were not included. Split into smaller batches for the rest.`,
      });
    }

    setClassifying(true);
    setProgress({ current: 0, total: filesToProcess.length });

    // Convert files to base64
    const prepared: Array<{ id: string; name: string; base64: string; mimeType: string; fileHash: string; file: AttachedFile }> = [];
    for (const file of filesToProcess) {
      try {
        const base64 = await fileToBase64(file);
        const fileHash = await sha256FromBase64(base64);
        const id = genId();
        prepared.push({
          id,
          name: file.name,
          base64,
          fileHash,
          mimeType: file.type || "application/octet-stream",
          file: { id, name: file.name, mimeType: file.type || "application/octet-stream", base64, size: file.size },
        });
      } catch {
        toast({ title: "Error", description: `Failed to read ${file.name}`, variant: "destructive" });
      }
    }

    if (prepared.length === 0) {
      setClassifying(false);
      return;
    }

    // Send to classification endpoint in batches of 5
    const BATCH = 5;
    const allClassified: ClassifiedFile[] = [];
    const allNameWarnings: Array<{ severity: string; message: string; files: string[]; names: string[] }> = [];
    const allDobWarnings: Array<{ severity: string; message: string; files: string[]; datesOfBirth: string[] }> = [];
    const allIdWarnings: Array<{ severity: string; message: string; files: string[]; issueDate: string; personName: string }> = [];
    let latestNameJudgeSummary: typeof nameJudgeSummary = null;
    const allDuplicateFileIds = new Set<string>();
    const allDuplicateCandidates: DuplicateCandidate[] = [];
    let processed = 0;
    let totalClassificationsCached = 0;

    for (let i = 0; i < prepared.length; i += BATCH) {
      const batch = prepared.slice(i, i + BATCH);
      try {
        const resp = await fetch(CLASSIFY_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            files: batch.map((f) => ({ id: f.id, name: f.name, base64: f.base64, mimeType: f.mimeType, fileHash: f.fileHash })),
            existingFiles: [
              ...classifiedFilesRef.current.map((cf) => ({
                name: cf.file.name,
                category: cf.category,
                personName: cf.personName,
                description: cf.description,
                fileHash: cf.fileHash || "",
              })),
              // Include files classified earlier in this same run
              ...allClassified.map((cf) => ({
                name: cf.file.name,
                category: cf.category,
                personName: cf.personName,
                description: cf.description,
                fileHash: cf.fileHash || "",
              })),
            ],
          }),
        });

        if (!resp.ok) {
          const errBody = await resp.json().catch(() => null);
          throw new Error(errBody?.error || `Classification failed (${resp.status})`);
        }

        const data = await resp.json();

        // Collect warnings from this batch
        if (data.nameWarnings?.length) {
          allNameWarnings.push(...data.nameWarnings);
        }
        // Capture judge summary (last batch wins — only final batch has full cross-doc context)
        if (data.nameJudgeSummary) {
          latestNameJudgeSummary = data.nameJudgeSummary;
        }
        if (data.dobWarnings?.length) {
          allDobWarnings.push(...data.dobWarnings);
        }
        if (data.idWarnings?.length) {
          allIdWarnings.push(...data.idWarnings);
        }
        if (data.classifications_cached > 0) {
          totalClassificationsCached += data.classifications_cached;
        }

        // Collect duplicate flags
        const dupFileIds = new Set<string>();
        if (data.duplicates?.length) {
          for (const dup of data.duplicates) {
            dupFileIds.add(dup.fileId);
            allDuplicateFileIds.add(dup.fileId);
          }
        }

        for (const classification of data.classifications || []) {
          const prep = prepared.find((p) => p.id === classification.fileId);
          if (!prep) continue;
          const cf: ClassifiedFile = {
            id: classification.fileId,
            file: prep.file,
            category: classification.category || "Other / Unknown",
            personName: classification.personName || "",
            dateOfBirth: classification.dateOfBirth || "",
            issueDate: classification.issueDate || "",
            description: classification.description || "",
            confidence: classification.confidence || "low",
            readable: classification.readable !== false,
            readabilityIssue: classification.readabilityIssue,
            confirmed: false,
            judgeOverridden: classification.judgeOverridden || false,
            judgeNotes: classification.judgeNotes || undefined,
            fileHash: prep.fileHash,
          };
          allClassified.push(cf);

          // Build duplicate candidate if flagged
          if (dupFileIds.has(classification.fileId)) {
            const dupInfo = data.duplicates.find((d: any) => d.fileId === classification.fileId);
            if (dupInfo) {
              allDuplicateCandidates.push({
                classified: cf,
                matchedFileName: dupInfo.matchedFileName,
                reason: dupInfo.reason,
              });
            }
          }
        }
      } catch (err: any) {
        // Mark failed batch files as unreadable
        for (const f of batch) {
          allClassified.push({
            id: f.id,
            file: f.file,
            category: "Other / Unknown",
            personName: "",
            dateOfBirth: "",
            description: "Classification failed",
            confidence: "low",
            readable: false,
            readabilityIssue: err.message || "Classification service unavailable. Please try again.",
            confirmed: false,
          });
        }
      }

      processed += batch.length;
      setProgress({ current: processed, total: prepared.length });
    }

    // Separate duplicates from clean classifications
    const cleanClassified = allClassified.filter((f) => !allDuplicateFileIds.has(f.id));

    // Increment duplicateAttempts on existing files that were matched
    const matchedOriginalNames = new Set(allDuplicateCandidates.map((d) => d.matchedFileName));
    setClassifiedFiles((prev) => [
      ...prev.map((f) =>
        matchedOriginalNames.has(f.file.name)
          ? { ...f, duplicateAttempts: (f.duplicateAttempts || 0) + 1 }
          : f
      ),
      ...cleanClassified,
    ]);
    setNameWarnings(allNameWarnings);
    setNameJudgeSummary(latestNameJudgeSummary);
    setDobWarnings(allDobWarnings);
    setIdWarnings(allIdWarnings);
    setClassifying(false);

    // Show duplicate dialog if any
    if (allDuplicateCandidates.length > 0) {
      setDuplicateCandidates(allDuplicateCandidates);
      setShowDuplicateDialog(true);
      toast({
        title: `${allDuplicateCandidates.length} duplicate(s) detected`,
        description: "Review and rename or skip duplicate documents.",
      });
    }

    const unreadableCount = cleanClassified.filter((f) => !f.readable).length;
    if (unreadableCount > 0) {
      toast({
        title: `${unreadableCount} document(s) could not be fully read`,
        description: "Review the flagged items below for suggested solutions.",
        variant: "destructive",
      });
    } else if (cleanClassified.length > 0) {
      const cacheNote = totalClassificationsCached > 0 ? ` ⚡ ${totalClassificationsCached} from cache` : "";
      toast({
        title: `${cleanClassified.length} document(s) classified`,
        description: `Please review the labels below and confirm.${cacheNote}`,
      });
    }
  }, [toast, CLASSIFY_URL, classifiedFiles]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDragging(false);

    toast({ title: "Scanning dropped folder…", description: "Detecting files, please wait." });

    const result = await extractFilesFromDrop(e);

    // Handle DnD cap exceeded or timeout guidance
    if (result.guidanceMessage) {
      toast({
        title: result.limitExceeded
          ? `Too many files (${result.detectedCount} detected)`
          : "Upload issue",
        description: result.guidanceMessage,
        variant: "destructive",
      });
      return;
    }

    if (result.zipErrors.length > 0) {
      toast({
        title: "Upload issue",
        description: result.zipErrors[0],
        variant: "destructive",
      });
    }

    if (result.files.length > 0) {
      toast({ title: `${result.files.length} file(s) found`, description: "Starting AI classification…" });
      await processAndClassify(result.files);
    } else if (result.zipErrors.length === 0) {
      toast({ title: "No supported files found", description: "The folder may be empty or contain unsupported file types.", variant: "destructive" });
    }
  }, [processAndClassify, toast]);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await processAndClassify(Array.from(e.target.files));
    }
    e.target.value = "";
  }, [processAndClassify]);

  const updateClassification = useCallback((id: string, updates: Partial<ClassifiedFile>) => {
    setClassifiedFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, ...updates } : f))
    );
  }, []);

  const removeClassifiedFile = useCallback((id: string) => {
    setClassifiedFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const confirmAll = useCallback(() => {
    const confirmed = classifiedFiles.map((f) => ({ ...f, confirmed: true }));
    setClassifiedFiles(confirmed);
    onFilesClassified(confirmed);
    toast({ title: "Labels confirmed", description: `${confirmed.length} document(s) added to the assessment.` });
  }, [classifiedFiles, onFilesClassified, toast]);

  // ── Auto-fill form extraction ────────────────────────────────────
  const extractFormData = useCallback(async () => {
    if (!onFormExtracted) return;
    const readable = classifiedFiles.filter((f) => f.readable);
    if (readable.length === 0) {
      toast({ title: "No readable documents", description: "Upload documents first.", variant: "destructive" });
      return;
    }

    setExtractingForm(true);
    try {
      const filesToSend = readable.map((cf) => ({
        name: cf.file.name,
        base64: cf.file.base64,
        mimeType: cf.file.mimeType,
      }));

      const classifications = readable.map((cf) => ({
        fileName: cf.file.name,
        category: cf.category,
        personName: cf.personName,
        confidence: cf.confidence,
      }));

      const resp = await fetch(EXTRACT_FORM_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ files: filesToSend, classifications }),
      });

      if (!resp.ok) {
        const errBody = await resp.json().catch(() => null);
        throw new Error(errBody?.error || `Extraction failed (${resp.status})`);
      }

      const data: ExtractedFormData = await resp.json();
      onFormExtracted(data);

      const correctionCount = data.corrections?.length || 0;
      toast({
        title: data.judgeApproved
          ? "Form data extracted & verified ✓"
          : `Form data extracted — ${correctionCount} correction(s) applied`,
        description: "Please review and confirm the pre-filled fields below.",
      });
    } catch (err: any) {
      toast({ title: "Form extraction failed", description: err.message, variant: "destructive" });
    } finally {
      setExtractingForm(false);
    }
  }, [classifiedFiles, onFormExtracted, toast, EXTRACT_FORM_URL]);

  // Handle resolved duplicates from the dialog
  const handleDuplicateResolve = useCallback((accepted: ClassifiedFile[]) => {
    if (accepted.length > 0) {
      setClassifiedFiles((prev) => [...prev, ...accepted]);
      toast({ title: `${accepted.length} renamed file(s) added` });
    }
    setDuplicateCandidates([]);
  }, [toast]);

  const unreadableFiles = classifiedFiles.filter((f) => !f.readable);
  const readableFiles = classifiedFiles.filter((f) => f.readable);
  const allConfirmed = classifiedFiles.length > 0 && classifiedFiles.every((f) => f.confirmed);

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        className={`rounded-xl border-2 border-dashed p-5 transition-all duration-300 ${
          isDragging
            ? "border-accent bg-accent/10 scale-[1.01]"
            : "border-accent/40 bg-accent/5"
        }`}
        onDragEnter={(e) => {
          e.preventDefault();
          e.stopPropagation();
          dragCounter.current += 1;
          if (e.dataTransfer.types.includes("Files")) setIsDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          dragCounter.current -= 1;
          if (dragCounter.current <= 0) {
            dragCounter.current = 0;
            setIsDragging(false);
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDrop={handleDrop}
      >
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center">
              <Sparkles size={18} className="text-accent" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Bulk AML Document Upload</h3>
              <p className="text-xs text-muted-foreground">
                Drop files or entire folders — AI will read, categorise &amp; label each document
              </p>
            </div>
          </div>

          {isDragging ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-2 py-4 text-accent font-medium"
            >
              <Upload size={24} className="animate-bounce" />
              <span>Drop files or folders here</span>
            </motion.div>
          ) : (
            <div className="flex items-center gap-2 flex-wrap justify-center">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled || classifying}
              >
                <Upload size={14} />
                Upload Files
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => folderInputRef.current?.click()}
                disabled={disabled || classifying}
              >
                <FolderUp size={14} />
                Upload Folder
              </Button>
              <span className="text-[10px] text-muted-foreground">
                Drag-and-drop: up to 50 files · Upload Folder: up to 100 files · 100MB each
              </span>
            </div>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.txt,.csv,.doc,.docx,.jpg,.jpeg,.png,.tif,.tiff,.bmp,.webp,.heic,.eml,.msg,.xls,.xlsx,.rtf"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />
        <input
          ref={folderInputRef}
          type="file"
          // @ts-ignore -- webkitdirectory is a non-standard attribute
          webkitdirectory=""
          directory=""
          multiple
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* Classification progress */}
      {classifying && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="rounded-lg border border-accent/30 bg-accent/5 p-4 space-y-2"
        >
          <div className="flex items-center gap-2 text-sm text-foreground font-medium">
            <Loader2 size={16} className="animate-spin text-accent" />
            Classifying documents… {progress.current} of {progress.total}
          </div>
          <Progress value={(progress.current / Math.max(progress.total, 1)) * 100} className="h-1.5" />
          <p className="text-xs text-muted-foreground">
            Reading each document using AI — scanned PDFs and images are processed with visual analysis
          </p>
        </motion.div>
      )}

      {/* Name consistency — LLM-judged summary (benign variations) */}
      {nameWarnings.length === 0 && nameJudgeSummary && !nameJudgeSummary.isFraudRisk && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-lg border border-border bg-muted/30 p-3 space-y-1"
        >
          <div className="flex items-center gap-2 text-muted-foreground">
            <ShieldAlert size={16} />
            <span className="text-sm font-semibold text-foreground">Name Consistency — No Fraud Concern</span>
          </div>
          <p className="text-xs text-muted-foreground pl-6">
            {nameJudgeSummary.summary}
          </p>
        </motion.div>
      )}

      {/* Name consistency — fraud risk flagged (most impactful only) */}
      {nameWarnings.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2"
        >
          <div className="flex items-center gap-2 text-destructive">
            <ShieldAlert size={16} />
            <span className="text-sm font-semibold">
              Name Consistency — Fraud Risk Flagged
            </span>
          </div>
          {nameJudgeSummary && (
            <p className="text-xs text-foreground pl-6 font-medium">
              {nameJudgeSummary.summary}
            </p>
          )}
          {nameWarnings.map((w, idx) => (
            <div key={idx} className="text-xs space-y-0.5 pl-6">
              <p className="text-foreground font-medium">
                🔴 {w.message}
              </p>
              <p className="text-muted-foreground">
                Files: {w.files.join(" • ")}
              </p>
            </div>
          ))}
          <p className="text-xs text-muted-foreground pl-6 italic">
            Please verify the identity documents for this individual before proceeding.
          </p>
        </motion.div>
      )}

      {/* DOB consistency warnings */}
      {dobWarnings.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2"
        >
          <div className="flex items-center gap-2 text-destructive">
            <ShieldAlert size={16} />
            <span className="text-sm font-semibold">
              Date of Birth {dobWarnings.length === 1 ? "Mismatch" : `Mismatches (${dobWarnings.length})`} — Red Flag
            </span>
          </div>
          {dobWarnings.map((w, idx) => (
            <div key={idx} className="text-xs space-y-0.5 pl-6">
              <p className="text-foreground font-medium">
                {w.message}
              </p>
              <p className="text-muted-foreground">
                Files: {w.files.join(" • ")}
              </p>
            </div>
          ))}
          <p className="text-xs text-destructive pl-6 font-medium">
            ⚠️ A DOB mismatch across identity and financial documents is a serious AML red flag. Investigate before proceeding.
          </p>
        </motion.div>
      )}

      {/* Recently-issued ID warnings */}
      {idWarnings.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2"
        >
          <div className="flex items-center gap-2 text-destructive">
            <ShieldAlert size={16} />
            <span className="text-sm font-semibold">
              Recently Issued ID {idWarnings.length === 1 ? "Document" : `Documents (${idWarnings.length})`} — Identity Fraud Risk
            </span>
          </div>
          {idWarnings.map((w, idx) => (
            <div key={idx} className="text-xs space-y-0.5 pl-6">
              <p className="text-foreground font-medium">
                {w.message}
              </p>
            </div>
          ))}
          <p className="text-xs text-destructive pl-6 font-medium">
            ⚠️ An ID document issued less than 1 year ago may indicate the person obtained a new identity to commit fraud. Investigate thoroughly.
          </p>
        </motion.div>
      )}

      {unreadableFiles.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2"
        >
          <button
            type="button"
            className="flex items-center gap-2 w-full text-left"
            onClick={() => setShowUnreadable(!showUnreadable)}
          >
            <AlertTriangle size={16} className="text-destructive shrink-0" />
            <span className="text-sm font-medium text-destructive flex-1">
              {unreadableFiles.length} document(s) could not be fully read
            </span>
            <ChevronDown
              size={14}
              className={`text-destructive transition-transform ${showUnreadable ? "rotate-180" : ""}`}
            />
          </button>
          <AnimatePresence>
            {showUnreadable && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="space-y-2 overflow-hidden"
              >
                {unreadableFiles.map((f) => (
                  <div key={f.id} className="flex items-start gap-2 p-2 rounded bg-background border border-border">
                    <EyeOff size={12} className="text-destructive mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{f.file.name}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {f.readabilityIssue || "Document content could not be extracted."}
                      </p>
                      <p className="text-[11px] text-accent mt-1 font-medium">
                        💡 Try: Convert to a high-resolution PDF or clear image (300+ DPI). If handwritten, consider typing the content.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeClassifiedFile(f.id)}
                      className="text-muted-foreground hover:text-destructive shrink-0"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Classified files list */}
      {readableFiles.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-lg border border-border bg-muted/30 p-3 space-y-2"
        >
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-sm font-medium text-foreground flex items-center gap-2">
              <Eye size={14} className="text-accent" />
              {readableFiles.length} document(s) classified
            </span>
            <div className="flex items-center gap-2">
              {onFormExtracted && readableFiles.length > 0 && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={extractFormData}
                  disabled={disabled || extractingForm || classifying}
                >
                  {extractingForm ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Extracting form data…
                    </>
                  ) : (
                    <>
                      <Sparkles size={14} />
                      Auto-fill Form from Documents
                    </>
                  )}
                </Button>
              )}
              {!allConfirmed && readableFiles.length > 0 && (
                <Button
                  type="button"
                  size="sm"
                  className="gap-1.5 bg-accent text-accent-foreground hover:bg-accent/90"
                  onClick={() => setShowClassifyConfirm(true)}
                  disabled={disabled}
                >
                  <CheckCircle2 size={14} />
                  Confirm All Labels
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
            <AnimatePresence>
              {readableFiles.map((cf) => (
                <motion.div
                  key={cf.id}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  className={`flex items-center gap-2 p-2 rounded-lg border transition-colors ${
                    cf.confirmed
                      ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20"
                      : "border-border bg-background"
                  }`}
                >
                  <FileText size={13} className="text-accent shrink-0" />

                  {/* File name */}
                  <div className="min-w-0 flex-shrink">
                    <p className="text-xs font-medium text-foreground truncate max-w-[120px]" title={cf.file.name}>
                      {cf.file.name}
                    </p>
                  </div>

                  {/* Category selector */}
                  <Select
                    value={cf.category}
                    onValueChange={(val) => updateClassification(cf.id, { category: val })}
                    disabled={cf.confirmed}
                  >
                    <SelectTrigger className="h-7 text-[11px] w-[180px] shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AML_CATEGORIES.map((cat) => (
                        <SelectItem key={cat} value={cat} className="text-xs">
                          {cat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Person name */}
                  {cf.confirmed ? (
                    cf.personName && (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 shrink-0">
                        <UserCircle size={10} /> {cf.personName}
                      </span>
                    )
                  ) : (
                    <Input
                      placeholder="Person name…"
                      value={cf.personName}
                      onChange={(e) => updateClassification(cf.id, { personName: e.target.value })}
                      className="h-7 text-[11px] w-[110px] shrink-0"
                    />
                  )}

                  {/* Issue date for ID documents */}
                  {cf.issueDate && (
                    (() => {
                      const isRecent = (() => {
                        try {
                          const parts = cf.issueDate!.split("/");
                          const d = parts.length === 3
                            ? new Date(+parts[2], +parts[1] - 1, +parts[0])
                            : new Date(cf.issueDate!);
                          const oneYearAgo = new Date();
                          oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
                          return !isNaN(d.getTime()) && d > oneYearAgo;
                        } catch { return false; }
                      })();
                      return (
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span
                                className={`text-[10px] flex items-center gap-0.5 shrink-0 cursor-help ${
                                  isRecent
                                    ? "text-destructive font-semibold"
                                    : "text-muted-foreground"
                                }`}
                              >
                                {isRecent ? <ShieldAlert size={10} /> : <Calendar size={10} />}
                                {cf.issueDate}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent
                              side="top"
                              className="max-w-[280px] text-xs leading-relaxed"
                            >
                              {isRecent ? (
                                <div className="space-y-1">
                                  <p className="font-semibold text-destructive">⚠️ Recently Issued ID — Fraud Risk</p>
                                  <p>This document was issued less than 12 months ago. Under LSAG guidance, recently issued identity documents may indicate identity fraud, particularly where:</p>
                                  <ul className="list-disc pl-3 space-y-0.5">
                                    <li>The person has no prior ID history on file</li>
                                    <li>Other documents show a different name or DOB</li>
                                    <li>The transaction involves a high-value purchase</li>
                                  </ul>
                                  <p className="font-medium">Action: Verify the reason for recent issuance with the client and document your findings.</p>
                                </div>
                              ) : (
                                <p>Document issue date — no fraud indicators detected for this document's issuance timeline.</p>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      );
                    })()
                  )}

                  {/* Confidence badge */}
                  <Badge
                    variant="outline"
                    className={`text-[9px] px-1.5 py-0 shrink-0 ${CONFIDENCE_COLORS[cf.confidence]}`}
                  >
                    {cf.confidence}
                  </Badge>

                  {/* Judge verification badge */}
                  {cf.judgeOverridden ? (
                    <Badge
                      variant="outline"
                      className="text-[9px] px-1.5 py-0 shrink-0 border-amber-300 text-amber-700 dark:text-amber-400 cursor-help"
                      title={cf.judgeNotes || "Classification was corrected by quality review"}
                    >
                      <ShieldAlert size={9} className="mr-0.5" />
                      Corrected
                    </Badge>
                  ) : cf.judgeNotes ? (
                    <Badge
                      variant="outline"
                      className="text-[9px] px-1.5 py-0 shrink-0 border-emerald-300 text-emerald-700 dark:text-emerald-400 cursor-help"
                      title={cf.judgeNotes || "Classification verified by quality review"}
                    >
                      <ShieldCheck size={9} className="mr-0.5" />
                      Verified
                    </Badge>
                  ) : null}

                  {/* Duplicate attempts indicator */}
                  {(cf.duplicateAttempts || 0) > 0 && (
                    <TooltipProvider delayDuration={200}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge
                            variant="outline"
                            className="text-[9px] px-1.5 py-0 shrink-0 border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-700 dark:bg-orange-950/30 dark:text-orange-400 cursor-help"
                          >
                            <Copy size={9} className="mr-0.5" />
                            {cf.duplicateAttempts}× dup
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs max-w-[220px]">
                          A similar document was uploaded {cf.duplicateAttempts} time{cf.duplicateAttempts !== 1 ? "s" : ""} and blocked as a duplicate.
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}

                  {cf.confirmed ? (
                    <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
                  ) : (
                    <button
                      type="button"
                      onClick={() => removeClassifiedFile(cf.id)}
                      className="text-muted-foreground hover:text-destructive shrink-0"
                    >
                      <X size={12} />
                    </button>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {allConfirmed && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 pt-1">
              <CheckCircle2 size={12} />
              All labels confirmed — documents will be included in the assessment
            </p>
          )}
        </motion.div>
      )}
      {/* Duplicate resolution dialog */}
      <DuplicateDocumentDialog
        open={showDuplicateDialog}
        onOpenChange={setShowDuplicateDialog}
        duplicates={duplicateCandidates}
        existingFiles={classifiedFiles.map((cf) => ({
          name: cf.file.name,
          category: cf.category,
          personName: cf.personName,
          description: cf.description,
        }))}
        onResolve={handleDuplicateResolve}
      />
      {/* Classification confirmation dialog */}
      <ClassificationConfirmDialog
        open={showClassifyConfirm}
        onOpenChange={setShowClassifyConfirm}
        onConfirm={() => { setShowClassifyConfirm(false); confirmAll(); }}
        documentCount={readableFiles.length}
        agentName="Olimey AI"
      />
    </div>
  );
}
