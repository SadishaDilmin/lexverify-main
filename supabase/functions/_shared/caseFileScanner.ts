/**
 * Shared utility to list and discover files in the case-documents storage bucket.
 * Edge functions use this to pull documents directly from the Case Files folder structure.
 * Supports version-aware filtering: when document_versions records exist, only the
 * latest version of each document is included for AI extraction.
 */

export interface CaseFile {
  fileName: string;
  filePath: string;
  folder: string;
}

/**
 * List all files in a case's folder structure from the `case-documents` bucket.
 *
 * @param supabase - Supabase admin/service client
 * @param caseId   - Case UUID
 * @param folders  - Optional array of folder names to scan (e.g. ["searches", "title"]).
 *                   If omitted, scans all folders.
 * @returns Array of discovered files with their paths and folder names.
 */
export async function listAllCaseFiles(
  supabase: any,
  caseId: string,
  folders?: string[],
): Promise<CaseFile[]> {
  // List top-level items under the case prefix (these are folders)
  const { data: topLevel, error: listErr } = await supabase.storage
    .from("case-documents")
    .list(caseId, { limit: 100, sortBy: { column: "name", order: "asc" } });

  if (listErr) {
    console.error("[caseFileScanner] Failed to list case folders:", listErr.message);
    return [];
  }

  // Folders appear as items with id === null in Supabase storage
  const folderNames = (topLevel || [])
    .filter((item: any) => item.id === null)
    .map((item: any) => item.name)
    .filter((name: string) => !folders || folders.includes(name));

  const allFiles: CaseFile[] = [];

  for (const folder of folderNames) {
    const { data: files, error: filesErr } = await supabase.storage
      .from("case-documents")
      .list(`${caseId}/${folder}`, { limit: 200, sortBy: { column: "created_at", order: "desc" } });

    if (filesErr) {
      console.warn(`[caseFileScanner] Failed to list files in ${folder}:`, filesErr.message);
      continue;
    }

    for (const file of files || []) {
      // Skip placeholder files and sub-folders
      if (file.name === ".keep" || file.id === null) continue;
      allFiles.push({
        fileName: file.name,
        filePath: `${caseId}/${folder}/${file.name}`,
        folder,
      });
    }
  }

  console.log(`[caseFileScanner] Found ${allFiles.length} files across ${folderNames.length} folders for case ${caseId}`);
  return allFiles;
}

/**
 * Query the document_versions table to find file_paths that have been
 * superseded by a newer version. Returns a Set of file_path strings
 * that should be EXCLUDED from AI extraction.
 *
 * Logic: For each document_id that has multiple versions, only the row
 * with the highest version_number is kept; all other file_paths are
 * added to the superseded set.
 */
export async function getSupersededFilePaths(
  supabase: any,
  caseId: string,
): Promise<Set<string>> {
  const superseded = new Set<string>();

  const { data: versions, error } = await supabase
    .from("document_versions")
    .select("document_id, version_number, file_path")
    .eq("case_id", caseId)
    .order("version_number", { ascending: false });

  if (error || !versions || versions.length === 0) {
    // No versioning data — nothing to exclude
    return superseded;
  }

  // Group by document_id; the first entry per group is the latest (sorted desc)
  const latestByDocId = new Map<string, string>(); // document_id → latest file_path
  for (const v of versions) {
    if (!latestByDocId.has(v.document_id)) {
      latestByDocId.set(v.document_id, v.file_path);
    } else {
      // This is an older version — mark as superseded
      superseded.add(v.file_path);
    }
  }

  if (superseded.size > 0) {
    console.log(`[caseFileScanner] ${superseded.size} superseded file(s) will be excluded from extraction`);
  }

  return superseded;
}

/** Folders relevant to Title Defect Detection */
export const TITLE_DEFECT_FOLDERS = ["title", "contracts", "searches", "local_authority", "drainage_water", "environmental", "epc", "miscellaneous"];
