/**
 * Document processing cache for edge functions.
 * Caches processDocument() output keyed by (bucket, file_path, file_size).
 * On cache hit for text docs: returns cached text, skips parsing entirely.
 * On cache hit for multimodal docs: skips failed PDF parse attempt, goes straight to base64.
 * On cache miss: calls processDocument(), stores result, returns.
 */

import { processDocument, type ProcessedDocument, type ProcessDocumentOptions } from "./documentProcessor.ts";

// ── Base64 encoding (duplicated here to avoid circular import) ────────
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(i, i + chunkSize));
  }
  return btoa(binary);
}

interface CacheRow {
  text_content: string | null;
  is_multimodal: boolean;
  mime_type: string | null;
  notes: string | null;
}

/**
 * Process a document with caching. Downloads the file, checks cache by
 * (bucket, file_path, file_size), and either returns cached result or
 * processes fresh and caches.
 */
export async function processDocumentCached(
  serviceClient: any,
  bucket: string,
  filePath: string,
  fileName: string,
  labelPrefix: string,
  options?: ProcessDocumentOptions
): Promise<{ processed: ProcessedDocument; bytes: Uint8Array | null; cacheHit: boolean }> {
  // 1. Download file (always needed for multimodal base64 or size check)
  const { data: fileData, error: dlErr } = await serviceClient.storage
    .from(bucket)
    .download(filePath);

  if (dlErr || !fileData) {
    return {
      processed: {
        fileName,
        label: `[${labelPrefix} — ${fileName}]`,
        isMultimodal: false,
        textContent: `[${labelPrefix}] ${fileName} — Could not download file.`,
      },
      bytes: null,
      cacheHit: false,
    };
  }

  const bytes = new Uint8Array(await fileData.arrayBuffer());
  const fileSize = bytes.length;

  // 2. Check cache
  const { data: cached } = await serviceClient
    .from("doc_processing_cache")
    .select("text_content, is_multimodal, mime_type, notes")
    .eq("bucket", bucket)
    .eq("file_path", filePath)
    .eq("file_size", fileSize)
    .maybeSingle();

  if (cached) {
    const row = cached as CacheRow;
    const label = `[${labelPrefix} — ${fileName}]`;

    if (!row.is_multimodal && row.text_content) {
      // Cache hit: text document — skip all parsing
      console.log(`[CACHE HIT] ${fileName} — returning cached text (${row.text_content.length} chars)`);
      return {
        processed: {
          fileName,
          label,
          isMultimodal: false,
          textContent: row.text_content,
          notes: row.notes ?? undefined,
        },
        bytes,
        cacheHit: true,
      };
    }

    if (row.is_multimodal) {
      // Cache hit: multimodal document — skip failed PDF parse, go straight to base64
      const maxBase64Length = options?.maxBase64Length ?? 15_000_000;
      const base64 = bytesToBase64(bytes);
      if (base64.length <= maxBase64Length) {
        const mimeType = row.mime_type || "application/octet-stream";
        console.log(`[CACHE HIT] ${fileName} — multimodal, skipping parse (${(bytes.length / 1024).toFixed(0)}KB)`);
        return {
          processed: {
            fileName,
            label,
            isMultimodal: true,
            multimodalContent: { base64, mimeType },
            notes: row.notes ?? undefined,
          },
          bytes,
          cacheHit: true,
        };
      }
      // File grew too large for multimodal — fall through to re-process
    }
  }

  // 3. Cache miss — process fresh
  console.log(`[CACHE MISS] ${fileName} — processing fresh`);
  const processed = await processDocument(fileName, bytes, labelPrefix, options);

  // 4. Store in cache (text_content only, not base64)
  try {
    const ext = fileName.lastIndexOf(".") >= 0
      ? fileName.substring(fileName.lastIndexOf(".")).toLowerCase()
      : "";
    const mimeMap: Record<string, string> = {
      ".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
      ".png": "image/png", ".tif": "image/tiff", ".tiff": "image/tiff",
      ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    };

    await serviceClient
      .from("doc_processing_cache")
      .upsert({
        bucket,
        file_path: filePath,
        file_size: fileSize,
        text_content: processed.isMultimodal ? null : (processed.textContent ?? null),
        is_multimodal: processed.isMultimodal,
        mime_type: mimeMap[ext] || null,
        notes: processed.notes ?? null,
      }, { onConflict: "bucket,file_path,file_size" });
  } catch (e) {
    // Cache write failure is non-fatal
    console.warn(`[CACHE] Failed to write cache for ${fileName}:`, e);
  }

  return { processed, bytes, cacheHit: false };
}
