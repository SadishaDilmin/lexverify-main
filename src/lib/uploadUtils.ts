/**
 * Shared upload utilities for Olimey AI document handling.
 */

// ── Constants ──────────────────────────────────────────────────────────
export const MAX_UPLOAD_FILE_SIZE = 100 * 1024 * 1024; // 100 MB
export const MAX_BATCH_FILES = 100;

export const ALLOWED_UPLOAD_EXTENSIONS = new Set([
  ".pdf", ".txt", ".csv", ".md", ".doc", ".docx",
  ".jpg", ".jpeg", ".png", ".tif", ".tiff", ".bmp", ".webp", ".heic",
  ".eml", ".msg", ".xls", ".xlsx", ".rtf",
]);

// ── Helpers ────────────────────────────────────────────────────────────

/** SHA-256 fingerprint of a File (computed from raw bytes). */
export async function sha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Normalise a file name for metadata-level dedup (lowercase, strip extension). */
export function normalizeFileName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9]/g, "");
}

/** Check whether a file has an allowed extension. */
export function isAllowedUploadFile(file: File): boolean {
  const ext = "." + file.name.split(".").pop()?.toLowerCase();
  return ALLOWED_UPLOAD_EXTENSIONS.has(ext);
}

/** Convert a File to base64 (data-URL stripped). */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve((reader.result as string).split(",")[1] || (reader.result as string));
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── Batch validation ───────────────────────────────────────────────────

export interface BatchValidationResult {
  valid: File[];
  rejected: { file: File; reason: string }[];
}

/** Validate a batch of files for size and extension. */
export function validateBatch(files: File[]): BatchValidationResult {
  const valid: File[] = [];
  const rejected: { file: File; reason: string }[] = [];

  for (const file of files) {
    if (file.size > MAX_UPLOAD_FILE_SIZE) {
      rejected.push({ file, reason: `Exceeds ${MAX_UPLOAD_FILE_SIZE / 1024 / 1024}MB limit` });
    } else if (!isAllowedUploadFile(file)) {
      rejected.push({ file, reason: "Unsupported file type" });
    } else {
      valid.push(file);
    }
  }

  return { valid, rejected };
}

// ── Deduplication ──────────────────────────────────────────────────────

export interface DeduplicationResult {
  unique: File[];
  duplicates: File[];
}

/** Hash-based client-side duplicate detection. */
export async function deduplicateFiles(
  newFiles: File[],
  existingHashes: Set<string>,
): Promise<DeduplicationResult> {
  const unique: File[] = [];
  const duplicates: File[] = [];
  const seenInBatch = new Set<string>();

  for (const file of newFiles) {
    try {
      const hash = await sha256(file);
      if (existingHashes.has(hash) || seenInBatch.has(hash)) {
        duplicates.push(file);
      } else {
        seenInBatch.add(hash);
        unique.push(file);
      }
    } catch {
      // If hashing fails, let the file through
      unique.push(file);
    }
  }

  return { unique, duplicates };
}

// ── Semaphore ──────────────────────────────────────────────────────────

export class Semaphore {
  private queue: (() => void)[] = [];
  private active = 0;
  constructor(private max: number) {}
  async acquire(): Promise<void> {
    if (this.active < this.max) {
      this.active++;
      return;
    }
    return new Promise<void>((resolve) => this.queue.push(resolve));
  }
  release(): void {
    this.active--;
    const next = this.queue.shift();
    if (next) {
      this.active++;
      next();
    }
  }
}

// ── Parallel upload ────────────────────────────────────────────────────

/**
 * Run upload functions in parallel with concurrency control.
 * Uses Promise.allSettled so one failure doesn't abort the batch.
 */
export async function parallelUpload<T>(
  items: T[],
  fn: (item: T) => Promise<any>,
  concurrency = 5,
): Promise<PromiseSettledResult<any>[]> {
  const sem = new Semaphore(concurrency);

  const tasks = items.map(async (item) => {
    await sem.acquire();
    try {
      return await fn(item);
    } finally {
      sem.release();
    }
  });

  return Promise.allSettled(tasks);
}
