/**
 * Client-side detection of password-protected / IRM-encrypted files.
 *
 * PDF:  Scans the first 8 KB for the "/Encrypt" dictionary key.
 * DOCX: A valid .docx is a ZIP (PK header). Password-protected Office files
 *       are wrapped in OLE2 Compound Binary (0xD0CF11E0) with an
 *       "EncryptedPackage" stream — they lack the PK header entirely.
 * DOC:  Legacy .doc is always OLE2, so we look for the "EncryptedPackage"
 *       stream name inside the first 4 KB.
 */

const PK_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // ZIP local file header
const OLE2_MAGIC = [0xd0, 0xcf, 0x11, 0xe0]; // OLE2 Compound Binary

function startsWith(buf: Uint8Array, magic: number[]): boolean {
  if (buf.length < magic.length) return false;
  return magic.every((b, i) => buf[i] === b);
}

/** Decode a slice of bytes to ASCII, ignoring non-printable chars */
function bytesToAscii(buf: Uint8Array): string {
  let s = "";
  for (let i = 0; i < buf.length; i++) {
    const c = buf[i];
    if (c >= 0x20 && c < 0x7f) s += String.fromCharCode(c);
  }
  return s;
}

export type ProtectedFileResult = {
  isProtected: boolean;
  reason?: string;
};

/**
 * Check if a file appears to be password-protected or IRM-encrypted.
 * Reads only the first few KB — fast and non-blocking.
 */
export async function detectProtectedFile(file: File): Promise<ProtectedFileResult> {
  const name = file.name.toLowerCase();

  // Only check supported document types
  if (!/\.(pdf|doc|docx)$/i.test(name)) {
    return { isProtected: false };
  }

  // Read first 8 KB — enough for header inspection
  const SCAN_SIZE = 8192;
  const slice = file.slice(0, Math.min(file.size, SCAN_SIZE));
  const buf = new Uint8Array(await slice.arrayBuffer());

  if (name.endsWith(".pdf")) {
    return detectProtectedPdf(buf);
  }

  if (name.endsWith(".docx")) {
    return detectProtectedDocx(buf);
  }

  if (name.endsWith(".doc")) {
    return detectProtectedDoc(buf);
  }

  return { isProtected: false };
}

function detectProtectedPdf(buf: Uint8Array): ProtectedFileResult {
  const ascii = bytesToAscii(buf);
  if (ascii.includes("/Encrypt")) {
    return {
      isProtected: true,
      reason: "This PDF is password-protected or encrypted. Please remove protection before uploading.",
    };
  }
  return { isProtected: false };
}

function detectProtectedDocx(buf: Uint8Array): ProtectedFileResult {
  // Valid .docx files start with PK (ZIP) header
  if (startsWith(buf, PK_MAGIC)) {
    return { isProtected: false };
  }

  // Password-protected Office files are OLE2 containers
  if (startsWith(buf, OLE2_MAGIC)) {
    return {
      isProtected: true,
      reason: "This Word document appears password-protected or IRM-encrypted. Please remove protection before uploading.",
    };
  }

  // Unknown format — let it through, extraction will handle errors
  return { isProtected: false };
}

function detectProtectedDoc(buf: Uint8Array): ProtectedFileResult {
  // .doc files are always OLE2 — look for EncryptedPackage stream
  const ascii = bytesToAscii(buf);
  if (ascii.includes("EncryptedPackage") || ascii.includes("StrongEncryptionDataSpace")) {
    return {
      isProtected: true,
      reason: "This .doc file is encrypted. Please remove password protection before uploading.",
    };
  }
  return { isProtected: false };
}
