/**
 * Utility to extract files from drag-and-dropped folders
 * using the File System Access API (webkitGetAsEntry),
 * and to extract files from ZIP archives.
 */

import JSZip from "jszip";

/** Broad set of extensions accepted across all agents */
const ACCEPTED_EXTENSIONS =
  /\.(pdf|doc|docx|jpg|jpeg|png|tif|tiff|bmp|webp|heic|txt|csv|md|rtf|eml|msg|xls|xlsx|dwg|dxf|zip)$/i;

const ACCEPTED_MIME_PREFIXES = ["image/"];
const ACCEPTED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/csv",
  "text/markdown",
  "application/rtf",
  "message/rfc822",
  "application/vnd.ms-outlook",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/zip",
  "application/x-zip-compressed",
]);

// ── Limits ────────────────────────────────────────────────────────────
/** Max files accepted via drag-and-drop (kept low for browser reliability) */
export const DRAG_DROP_MAX_FILES = 50;

/** Timeout (ms) for the entire drag-and-drop extraction before giving up */
const DROP_EXTRACTION_TIMEOUT_MS = 15_000;

// ── Structured result types ───────────────────────────────────────────
export interface ExtractionResult {
  files: File[];
  zipErrors: string[];
  /** True when the detected file count exceeded the DnD cap */
  limitExceeded?: boolean;
  /** Total files detected before the cap was applied */
  detectedCount?: number;
  /** User-facing guidance message (e.g. "use Upload Folder instead") */
  guidanceMessage?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────

function getCandidateFileName(file: File): string {
  const source = file.name || (file as File & { webkitRelativePath?: string }).webkitRelativePath || "";
  const tail = source.split(/[\\/]/).pop() || source;
  return tail.trim();
}

function hasAcceptedExtension(name: string): boolean {
  return ACCEPTED_EXTENSIONS.test(name.trim());
}

function hasAcceptedMimeType(file: File): boolean {
  const type = (file.type || "").toLowerCase().trim();
  if (!type) return false;
  if (ACCEPTED_MIME_TYPES.has(type)) return true;
  return ACCEPTED_MIME_PREFIXES.some((prefix) => type.startsWith(prefix));
}

/** Check if a single file passes the extension/mime filter */
export function isAcceptedFile(file: File): boolean {
  const fileName = getCandidateFileName(file);
  return hasAcceptedExtension(fileName) || hasAcceptedMimeType(file);
}

/** Recursively read all files from a FileSystemDirectoryEntry */
function readDirectoryEntries(dirEntry: FileSystemDirectoryEntry): Promise<File[]> {
  return new Promise((resolve) => {
    const reader = dirEntry.createReader();
    const allFiles: File[] = [];

    const readBatch = () => {
      reader.readEntries(async (entries) => {
        if (entries.length === 0) {
          resolve(allFiles);
          return;
        }

        for (const entry of entries) {
          try {
            if (entry.isFile) {
              const file = await new Promise<File>((res, rej) =>
                (entry as FileSystemFileEntry).file(res, rej)
              );
              if (isAcceptedFile(file)) {
                allFiles.push(file);
              }
            } else if (entry.isDirectory) {
              const nested = await readDirectoryEntries(entry as FileSystemDirectoryEntry);
              allFiles.push(...nested);
            }
          } catch (err) {
            console.warn("[folderUpload] Skipping unreadable entry:", entry.name, err);
          }
        }

        // readEntries may return results in batches
        readBatch();
      });
    };

    readBatch();
  });
}

async function readDirectoryHandle(dirHandle: any): Promise<File[]> {
  const allFiles: File[] = [];

  for await (const entry of dirHandle.values()) {
    try {
      if (entry.kind === "file") {
        const file = await entry.getFile();
        if (isAcceptedFile(file)) allFiles.push(file);
      } else if (entry.kind === "directory") {
        const nested = await readDirectoryHandle(entry);
        allFiles.push(...nested);
      }
    } catch (err) {
      console.warn("[folderUpload] Skipping unreadable handle entry:", err);
    }
  }

  return allFiles;
}

// ── ZIP extraction ────────────────────────────────────────────────────

/** Extract individual files from a ZIP archive, filtering by accepted extensions */
async function extractFilesFromZip(zipFile: File): Promise<{ files: File[]; error?: string }> {
  try {
    const zip = await JSZip.loadAsync(zipFile);
    const extracted: File[] = [];

    const allEntries = Object.entries(zip.files).filter(([, entry]) => !entry.dir);
    const matchedEntries = allEntries.filter(([, entry]) => hasAcceptedExtension(entry.name));

    if (allEntries.length > 0 && matchedEntries.length === 0) {
      const sampleNames = allEntries.slice(0, 3).map(([p]) => p.split("/").pop() || p).join(", ");
      console.warn(`[folderUpload] ZIP contains ${allEntries.length} file(s) but none matched accepted extensions. Samples: ${sampleNames}`);
      return { files: [], error: `ZIP contains ${allEntries.length} file(s) but none have supported extensions.` };
    }

    for (const [path, entry] of matchedEntries) {
      const blob = await entry.async("blob");
      const fileName = path.split("/").pop() || path;
      const file = new File([blob], fileName, {
        type: blob.type || "application/octet-stream",
        lastModified: entry.date?.getTime() || Date.now(),
      });
      extracted.push(file);
    }
    return { files: extracted };
  } catch (e) {
    console.error("ZIP extraction failed:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { files: [], error: `Could not read ZIP archive: ${msg}` };
  }
}

// ── Public API ────────────────────────────────────────────────────────

/**
 * Process a list of files: extract ZIP contents, filter by accepted extensions.
 * Use this for file-input and drag-and-drop handlers.
 */
export async function processUploadedFiles(rawFiles: FileList | File[]): Promise<ExtractionResult> {
  const files: File[] = [];
  const zipErrors: string[] = [];

  for (const file of Array.from(rawFiles)) {
    if (/\.zip$/i.test(file.name)) {
      const result = await extractFilesFromZip(file);
      files.push(...result.files);
      if (result.error) zipErrors.push(result.error);
    } else if (isAcceptedFile(file)) {
      files.push(file);
    }
  }

  return { files, zipErrors };
}

/**
 * Apply the DnD file-count cap. Returns an ExtractionResult with guidance if exceeded.
 */
function applyDndCap(result: ExtractionResult): ExtractionResult {
  if (result.files.length <= DRAG_DROP_MAX_FILES) return result;

  return {
    files: [],
    zipErrors: result.zipErrors,
    limitExceeded: true,
    detectedCount: result.files.length,
    guidanceMessage:
      `This folder contains ${result.files.length} supported files. ` +
      `Drag-and-drop supports up to ${DRAG_DROP_MAX_FILES} files for reliability. ` +
      `Please use the "Upload Folder" button for larger batches (up to 100 files at a time).`,
  };
}

/**
 * Race a promise against a timeout. Returns the timeout result if exceeded.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

/**
 * Extract all valid files from a drop event, including files nested inside folders and ZIP archives.
 * Falls back to e.dataTransfer.files if the browser doesn't support entries API.
 * Enforces a DnD file-count cap and extraction timeout.
 */
export async function extractFilesFromDrop(e: React.DragEvent): Promise<ExtractionResult> {
  const doExtract = async (): Promise<ExtractionResult> => {
    const transfer = e.dataTransfer;
    const items = transfer.items;

    if (!items || items.length === 0) {
      const result = await processUploadedFiles(transfer.files);
      return applyDndCap(result);
    }

    const rawFiles: File[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      try {
        const maybeGetHandle = (item as DataTransferItem & {
          getAsFileSystemHandle?: () => Promise<any>;
        }).getAsFileSystemHandle;

        // Modern API (Chromium): getAsFileSystemHandle
        if (typeof maybeGetHandle === "function") {
          try {
            const handle = await maybeGetHandle.call(item);
            if (handle?.kind === "file") {
              const file = await handle.getFile();
              rawFiles.push(file);
              continue;
            }
            if (handle?.kind === "directory") {
              const nested = await readDirectoryHandle(handle);
              rawFiles.push(...nested);
              continue;
            }
          } catch (err) {
            console.warn("[folderUpload] getAsFileSystemHandle failed, falling back:", err);
          }
        }

        // Legacy API: webkitGetAsEntry / getAsEntry
        const entry =
          (item as DataTransferItem & { getAsEntry?: () => FileSystemEntry | null }).getAsEntry?.() ||
          item.webkitGetAsEntry?.();

        if (entry?.isFile) {
          const file = await new Promise<File>((res, rej) =>
            (entry as FileSystemFileEntry).file(res, rej)
          );
          rawFiles.push(file);
          continue;
        }

        if (entry?.isDirectory) {
          const nested = await readDirectoryEntries(entry as FileSystemDirectoryEntry);
          rawFiles.push(...nested);
          continue;
        }

        // Plain file fallback
        const file = item.getAsFile();
        if (file) rawFiles.push(file);
      } catch (err) {
        console.warn("[folderUpload] Failed to read dropped item:", err);
      }
    }

    const processed =
      rawFiles.length > 0
        ? await processUploadedFiles(rawFiles)
        : await processUploadedFiles(transfer.files);

    // Browser provided drag items but no readable files
    if (processed.files.length === 0 && items.length > 0 && transfer.files.length === 0) {
      return {
        ...processed,
        zipErrors: [
          ...processed.zipErrors,
          "This browser did not expose files from the dropped folder. Please use the 'Upload Folder' button.",
        ],
      };
    }

    return applyDndCap(processed);
  };

  const timeoutResult: ExtractionResult = {
    files: [],
    zipErrors: [],
    limitExceeded: false,
    guidanceMessage:
      "Folder scanning timed out. The folder may be too large or deeply nested. " +
      'Please use the "Upload Folder" button instead.',
  };

  return withTimeout(doExtract(), DROP_EXTRACTION_TIMEOUT_MS, timeoutResult);
}
