import { supabase } from "@/integrations/supabase/client";

/** Standard folder structure for every case */
export const CASE_FOLDERS = [
  { key: "searches", label: "Searches", description: "Local authority, drainage, water, environmental searches & EPC" },
  { key: "title", label: "Title", description: "Title documents, registers & plans" },
  { key: "contracts", label: "Contract Pack & Protocol Forms", description: "Contracts, TR1, TP1 & protocol forms" },
  { key: "correspondence", label: "Correspondence", description: "Emails, letters & general correspondence" },
  { key: "aml-sow", label: "AML / Source of Wealth", description: "ID verification, bank statements, source of funds evidence" },
  { key: "reports", label: "Reports", description: "AI-generated and manual reports" },
  { key: "hoowla-notes", label: "Hoowla Notes", description: "Notes, alerts & updates synced from Hoowla" },
  { key: "miscellaneous", label: "Miscellaneous", description: "Planning permissions, building regs, certificates, warranties, Gas Safety, NICEIC & other property documents" },
] as const;

/** Add-on folders only created when specific add-ons are enabled */
export const ADDON_FOLDERS: Record<string, { key: string; label: string; description: string }> = {
  "management-pack": { key: "management-pack", label: "Management Pack", description: "LPE1, service charge accounts & management info" },
  "licence-to-alter": { key: "licence-to-alter", label: "Licence to Alter", description: "Alteration licences & related documents" },
};

/** Map from doc_type (used in documents table) to folder key */
export const DOC_TYPE_TO_FOLDER: Record<string, string> = {
  local_authority: "searches",
  drainage_water: "searches",
  environmental: "searches",
  epc: "searches",
  management_pack: "management-pack",
  licence_to_alter: "licence-to-alter",
};

/** Reverse map for writing normalized document records into `documents` */
const FOLDER_TO_DOC_TYPE: Record<string, string> = {
  searches: "searches",
  title: "title",
  contracts: "contracts",
  correspondence: "correspondence",
  "aml-sow": "aml_sow",
  reports: "reports",
  "hoowla-notes": "hoowla_notes",
  miscellaneous: "miscellaneous",
  "management-pack": "management_pack",
  "licence-to-alter": "licence_to_alter",
};

function getDocTypeForFolder(folderKey: string): string {
  return FOLDER_TO_DOC_TYPE[folderKey] || folderKey.replace(/-/g, "_");
}

async function ensureCaseDocumentRecord(params: {
  caseId: string;
  filePath: string;
  fileName: string;
  docType: string;
  uploadedBy: string;
}): Promise<void> {
  const { caseId, filePath, fileName, docType, uploadedBy } = params;

  const { data: existingDoc, error: existingErr } = await supabase
    .from("documents")
    .select("id")
    .eq("case_id", caseId)
    .eq("file_path", filePath)
    .maybeSingle();

  // PGRST116 = no rows found; anything else is unexpected
  if (existingErr && existingErr.code !== "PGRST116") {
    throw existingErr;
  }

  if (existingDoc) return;

  const { error: insertErr } = await supabase.from("documents").insert({
    case_id: caseId,
    doc_type: docType,
    file_name: fileName,
    file_path: filePath,
    uploaded_by: uploadedBy,
  });

  if (insertErr) throw insertErr;
}

/**
 * Create the folder skeleton for a case by uploading .keep placeholder files.
 * Supabase Storage uses path prefixes as "folders".
 */
export async function createCaseFolderSkeleton(
  caseId: string,
  enabledAddOns: string[] = [],
): Promise<{ success: boolean; error?: string }> {
  const folders = [
    ...CASE_FOLDERS.map((f) => f.key),
    ...enabledAddOns
      .filter((a) => ADDON_FOLDERS[a])
      .map((a) => ADDON_FOLDERS[a].key),
  ];

  const keepContent = new Blob([""], { type: "text/plain" });

  const results = await Promise.allSettled(
    folders.map((folder) =>
      supabase.storage
        .from("case-documents")
        .upload(`${caseId}/${folder}/.keep`, keepContent, { upsert: true })
    ),
  );

  const failed = results.filter((r) => r.status === "rejected");
  if (failed.length > 0) {
    console.warn("Some folder placeholders failed:", failed);
    return { success: false, error: `${failed.length} folder(s) failed to create` };
  }

  return { success: true };
}

/** List all folders (prefixes) inside a case's storage */
export async function listCaseFolders(caseId: string): Promise<string[]> {
  const { data, error } = await supabase.storage
    .from("case-documents")
    .list(caseId, { limit: 100, sortBy: { column: "name", order: "asc" } });

  if (error) {
    console.error("Failed to list case folders:", error);
    return [];
  }

  // Folders appear as items with id=null in Supabase storage list
  return (data || [])
    .filter((item) => item.id === null)
    .map((item) => item.name);
}

/** List files inside a specific folder */
export async function listFolderFiles(
  caseId: string,
  folder: string,
): Promise<Array<{ name: string; id: string | null; size: number; createdAt: string }>> {
  const { data, error } = await supabase.storage
    .from("case-documents")
    .list(`${caseId}/${folder}`, {
      limit: 200,
      sortBy: { column: "created_at", order: "desc" },
    });

  if (error) {
    console.error("Failed to list folder files:", error);
    return [];
  }

  return (data || [])
    .filter((item) => item.name !== ".keep")
    .map((item) => ({
      name: item.name,
      id: item.id,
      size: (item.metadata as any)?.size || 0,
      createdAt: item.created_at || "",
    }));
}

/**
 * Download files from a case folder and return them with base64 content.
 * Used to hydrate in-memory file arrays from persisted storage.
 */
/** Pattern matching AI-generated report filenames that should never be re-ingested */
const AI_REPORT_FILENAME_RE = /^WealthVerify-Source-of-Wealth[_\s-].*\.md$/i;

export async function downloadFolderFiles(
  caseId: string,
  folder: string,
  excludeNames?: Set<string>,
  includePattern?: RegExp,
): Promise<Array<{ name: string; base64: string; mimeType: string }>> {
  const listed = await listFolderFiles(caseId, folder);
  const excludeLower = excludeNames
    ? new Set(Array.from(excludeNames).map((n) => n.toLowerCase()))
    : null;

  const toDownload = listed.filter((f) => {
    if (excludeLower?.has(f.name.toLowerCase())) return false;
    // Skip AI-generated reports to prevent circular reasoning
    if (AI_REPORT_FILENAME_RE.test(f.name)) return false;
    if (includePattern && !includePattern.test(f.name)) return false;
    return true;
  });

  if (toDownload.length === 0) return [];

  const results: Array<{ name: string; base64: string; mimeType: string }> = [];
  const MAX_CONCURRENT = 5;
  let active = 0;
  let idx = 0;

  await new Promise<void>((resolve) => {
    const next = () => {
      while (active < MAX_CONCURRENT && idx < toDownload.length) {
        const file = toDownload[idx++];
        active++;
        const filePath = `${caseId}/${folder}/${file.name}`;
        supabase.storage
          .from("case-documents")
          .download(filePath)
          .then(async ({ data, error }) => {
            if (!error && data) {
              const buffer = await data.arrayBuffer();
              const bytes = new Uint8Array(buffer);
              let binary = "";
              for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
              const b64 = btoa(binary);
              const ext = file.name.split(".").pop()?.toLowerCase() || "";
              const mimeMap: Record<string, string> = {
                pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg",
                png: "image/png", tif: "image/tiff", tiff: "image/tiff",
                bmp: "image/bmp", webp: "image/webp", heic: "image/heic",
                doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                csv: "text/csv", txt: "text/plain", eml: "message/rfc822", msg: "application/vnd.ms-outlook",
                rtf: "application/rtf", md: "text/markdown",
              };
              results.push({ name: file.name, base64: b64, mimeType: mimeMap[ext] || "application/octet-stream" });
            } else {
              console.warn(`[downloadFolderFiles] Failed to download ${filePath}:`, error);
            }
          })
          .catch((err) => console.warn(`[downloadFolderFiles] Error downloading ${file.name}:`, err))
          .finally(() => {
            active--;
            if (idx >= toDownload.length && active === 0) resolve();
            else next();
          });
      }
      if (idx >= toDownload.length && active === 0) resolve();
    };
    next();
  });

  return results;
}

/** Count files (excluding .keep) in a specific folder */
export async function countFolderFiles(caseId: string, folder: string): Promise<number> {
  const { data, error } = await supabase.storage
    .from("case-documents")
    .list(`${caseId}/${folder}`, { limit: 200 });
  if (error) return 0;
  return (data || []).filter((item) => item.name !== ".keep").length;
}

/** Count files for all given folders in parallel */
export async function countAllFolderFiles(
  caseId: string,
  folderKeys: string[],
): Promise<Record<string, number>> {
  const results = await Promise.all(
    folderKeys.map(async (key) => ({ key, count: await countFolderFiles(caseId, key) })),
  );
  return Object.fromEntries(results.map((r) => [r.key, r.count]));
}

/** Get a folder's display label */
export function getFolderLabel(folderKey: string): string {
  const core = CASE_FOLDERS.find((f) => f.key === folderKey);
  if (core) return core.label;
  const addon = Object.values(ADDON_FOLDERS).find((f) => f.key === folderKey);
  if (addon) return addon.label;
  // Dynamic folders (e.g. from Hoowla tags) — title-case the key
  return folderKey
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Copy files from an agent's storage bucket into the linked case's folder
 * structure in the `case-documents` bucket.
 *
 * @param sourceBucket - The agent's storage bucket name
 * @param filePaths    - Array of { sourcePath, fileName } entries in the source bucket
 * @param caseId       - The linked case UUID
 * @param targetFolder - The case folder key to file into (e.g. "aml-sow", "contracts")
 */
export async function copyAgentFilesToCaseFolder(
  sourceBucket: string,
  filePaths: { sourcePath: string; fileName: string; docType?: string }[],
  caseId: string,
  targetFolder: string,
): Promise<{ copied: number; failed: number }> {
  if (!caseId || filePaths.length === 0) return { copied: 0, failed: 0 };

  const { data: authUser } = await supabase.auth.getUser();
  const uploaderId = authUser.user?.id;

  let copied = 0;
  let failed = 0;

  // Process in small batches to avoid overwhelming the API
  const BATCH_SIZE = 5;
  for (let i = 0; i < filePaths.length; i += BATCH_SIZE) {
    const batch = filePaths.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async ({ sourcePath, fileName, docType }) => {
        // Download from source bucket
        const { data: blob, error: dlError } = await supabase.storage
          .from(sourceBucket)
          .download(sourcePath);
        if (dlError || !blob) throw dlError || new Error("Download returned no data");

        // Upload to case-documents bucket in the target folder
        const destPath = `${caseId}/${targetFolder}/${fileName}`;
        const { error: upError } = await supabase.storage
          .from("case-documents")
          .upload(destPath, blob, { upsert: true });
        if (upError) throw upError;

        // Keep documents table in sync so Case Workspace can see these files
        if (uploaderId) {
          await ensureCaseDocumentRecord({
            caseId,
            filePath: destPath,
            fileName,
            docType: docType || getDocTypeForFolder(targetFolder),
            uploadedBy: uploaderId,
          });
        }
      }),
    );

    for (const r of results) {
      if (r.status === "fulfilled") copied++;
      else {
        failed++;
        console.warn("[copyAgentFilesToCaseFolder] Failed:", r.reason);
      }
    }
  }

  return { copied, failed };
}

/**
 * Upload in-memory files (base64) directly to a case folder.
 * Used by agents that hold files in memory (e.g. SoW / Olimey AI).
 */
/**
 * Save an agent assessment report as a dated document in the case's "reports" folder.
 * Creates a markdown file labelled by agent name + timestamp.
 *
 * @param caseId     - The case UUID
 * @param agentLabel - Human-readable agent name (e.g. "Olimey AI Source of Wealth")
 * @param content    - Markdown/text content of the report
 * @returns The storage path of the saved file, or null on failure.
 */
export async function saveAssessmentReport(
  caseId: string,
  agentLabel: string,
  content: string,
): Promise<string | null> {
  if (!caseId || !content) return null;

  const { data: authUser } = await supabase.auth.getUser();
  const uploaderId = authUser.user?.id;
  if (!uploaderId) return null;

  const now = new Date();
  // C2 Fix: Use full ISO timestamp with seconds to prevent same-minute overwrites
  const dateStr = now.toISOString().slice(0, 19).replace("T", " ").replace(/:/g, "-");
  const safeLabel = agentLabel.replace(/[™®©]/g, "").replace(/[^a-zA-Z0-9 -]/g, "").trim().replace(/\s+/g, "-");
  const fileName = `${safeLabel}_${dateStr}.md`;
  const filePath = `${caseId}/reports/${fileName}`;

  const blob = new Blob([content], { type: "text/markdown" });

  // C3 Fix: Use upsert to handle duplicate uploads gracefully
  const { error: uploadError } = await supabase.storage
    .from("case-documents")
    .upload(filePath, blob, { upsert: true });

  if (uploadError) {
    console.warn("[saveAssessmentReport] Upload failed:", uploadError.message);
    return null;
  }

  try {
    await ensureCaseDocumentRecord({
      caseId,
      filePath,
      fileName,
      docType: "reports",
      uploadedBy: uploaderId,
    });
  } catch (e: any) {
    console.warn("[saveAssessmentReport] Document record failed:", e.message);
  }

  console.log(`[saveAssessmentReport] Saved: ${filePath}`);
  return filePath;
}

export async function uploadFilesToCaseFolder(
  files: { name: string; base64: string; mimeType: string }[],
  caseId: string,
  targetFolder: string,
): Promise<{ copied: number; failed: number; succeededNames: string[] }> {
  if (!caseId || files.length === 0) return { copied: 0, failed: 0, succeededNames: [] };

  const { data: authUser } = await supabase.auth.getUser();
  const uploaderId = authUser.user?.id;

  let copied = 0;
  let failed = 0;
  const succeededNames: string[] = [];

  const BATCH_SIZE = 5;
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async ({ name, base64, mimeType }) => {
        // Convert base64 to blob
        const byteString = atob(base64);
        const bytes = new Uint8Array(byteString.length);
        for (let j = 0; j < byteString.length; j++) bytes[j] = byteString.charCodeAt(j);
        const blob = new Blob([bytes], { type: mimeType });

        const destPath = `${caseId}/${targetFolder}/${name}`;
        const { error } = await supabase.storage
          .from("case-documents")
          .upload(destPath, blob, { upsert: true });
        if (error) throw error;

        if (uploaderId) {
          await ensureCaseDocumentRecord({
            caseId,
            filePath: destPath,
            fileName: name,
            docType: getDocTypeForFolder(targetFolder),
            uploadedBy: uploaderId,
          });
        }
        return name;
      }),
    );

    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      if (r.status === "fulfilled") {
        copied++;
        succeededNames.push(r.value);
      } else {
        failed++;
        console.warn("[uploadFilesToCaseFolder] Failed:", r.reason);
      }
    }
  }

  return { copied, failed, succeededNames };
}
