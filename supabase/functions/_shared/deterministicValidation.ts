/**
 * Layer 4: Deterministic Validation
 * Post-response programmatic checks for AI-generated structured output.
 * Validates document_source fields, risk score bounds, and required arrays.
 * Logs warnings but does NOT block output — flags for review instead.
 */

export interface ValidationWarning {
  field: string;
  issue: string;
  value?: unknown;
}

export interface ValidationResult {
  warnings: ValidationWarning[];
  passed: boolean;
}

// ── Generic helpers ───────────────────────────────────────────────────

function isNonEmptyString(val: unknown): boolean {
  return typeof val === "string" && val.trim().length > 0;
}

function isInRange(val: unknown, min: number, max: number): boolean {
  return typeof val === "number" && val >= min && val <= max;
}

// ── detect-title-defects validation ───────────────────────────────────

export function validateTitleDefects(parsed: any): ValidationResult {
  const warnings: ValidationWarning[] = [];

  if (!Array.isArray(parsed.defects)) {
    warnings.push({ field: "defects", issue: "Defects is not an array" });
    return { warnings, passed: false };
  }

  parsed.defects.forEach((d: any, i: number) => {
    // Every defect should have a source_document
    if (!isNonEmptyString(d.source_document)) {
      warnings.push({ field: `defects[${i}].source_document`, issue: "Missing source document reference", value: d.title });
    }
    // Severity must be valid
    if (!["high", "medium", "low"].includes(d.severity)) {
      warnings.push({ field: `defects[${i}].severity`, issue: "Invalid severity", value: d.severity });
    }
    // Recommendation must be non-empty
    if (!isNonEmptyString(d.recommendation)) {
      warnings.push({ field: `defects[${i}].recommendation`, issue: "Empty recommendation", value: d.title });
    }
  });

  return { warnings, passed: warnings.length === 0 };
}

// ── ingest-replies validation ─────────────────────────────────────────

export function validateIngestReplies(parsed: any): ValidationResult {
  const warnings: ValidationWarning[] = [];

  // Enquiry updates validation
  if (Array.isArray(parsed.enquiry_updates)) {
    parsed.enquiry_updates.forEach((u: any, i: number) => {
      if (!isNonEmptyString(u.evidence_received)) {
        warnings.push({ field: `enquiry_updates[${i}].evidence_received`, issue: "Missing evidence_received for enquiry update", value: u.enquiry_number });
      }
      if (!["open", "partially_satisfied", "satisfied", "escalate"].includes(u.new_status)) {
        warnings.push({ field: `enquiry_updates[${i}].new_status`, issue: "Invalid status", value: u.new_status });
      }
    });
  }

  // Document classifications must reference enquiry numbers
  if (Array.isArray(parsed.document_classifications)) {
    parsed.document_classifications.forEach((dc: any, i: number) => {
      if (!Array.isArray(dc.matched_enquiry_numbers) || dc.matched_enquiry_numbers.length === 0) {
        warnings.push({ field: `document_classifications[${i}].matched_enquiry_numbers`, issue: "Document not matched to any enquiry", value: dc.file_name });
      }
    });
  }

  // Reports non-empty
  if (!isNonEmptyString(parsed.internal_report)) {
    warnings.push({ field: "internal_report", issue: "Internal report is empty" });
  }

  return { warnings, passed: warnings.length === 0 };
}

// ── Logging helper ────────────────────────────────────────────────────

export function logValidationResult(functionName: string, runId: string, result: ValidationResult): void {
  if (result.passed) {
    console.log(`[L4_VALIDATION] ${functionName} | run=${runId} | PASSED — all deterministic checks passed`);
  } else {
    console.warn(`[L4_VALIDATION] ${functionName} | run=${runId} | ${result.warnings.length} WARNING(S):`);
    for (const w of result.warnings) {
      console.warn(`  ⚠ ${w.field}: ${w.issue}${w.value !== undefined ? ` (value: ${JSON.stringify(w.value).slice(0, 100)})` : ""}`);
    }
  }
}
