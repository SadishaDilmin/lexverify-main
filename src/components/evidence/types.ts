/** Relationship between a report item and its source document */
export type EvidenceRelationship =
  | "direct_extraction"
  | "corroborating_source"
  | "derived_summary"
  | "cross_document_match"
  | "cross_document_discrepancy"
  | "inferred_from_multiple_sources";

/** A single evidence reference linking a report item to a source document */
export interface EvidenceReference {
  id: string;
  ai_report_id: string;
  case_id: string;
  section_heading: string;
  item_label: string;
  item_text: string;
  document_name: string;
  document_path: string;
  page_number: number | null;
  source_snippet: string;
  anchor_text: string | null;
  relationship_type: EvidenceRelationship;
  is_primary: boolean;
  confidence_score: number | null;
  sort_order: number;
  created_at: string;
}

/** Parsed evidence map entry from AI output */
export interface EvidenceMapEntry {
  section: string;
  item: string;
  document: string;
  page?: number;
  snippet: string;
  relationship: EvidenceRelationship;
  confidence?: number;
}

/** Labels for relationship types */
export const RELATIONSHIP_LABELS: Record<EvidenceRelationship, string> = {
  direct_extraction: "Directly extracted",
  corroborating_source: "Corroborating source",
  derived_summary: "Derived from document",
  cross_document_match: "Cross-document match",
  cross_document_discrepancy: "Discrepancy identified",
  inferred_from_multiple_sources: "Inferred from multiple sources",
};

/** Styles for relationship badges */
export const RELATIONSHIP_STYLES: Record<EvidenceRelationship, { bg: string; text: string }> = {
  direct_extraction: { bg: "bg-risk-green/10", text: "text-risk-green" },
  corroborating_source: { bg: "bg-accent/10", text: "text-accent" },
  derived_summary: { bg: "bg-muted", text: "text-muted-foreground" },
  cross_document_match: { bg: "bg-accent/10", text: "text-accent" },
  cross_document_discrepancy: { bg: "bg-destructive/10", text: "text-destructive" },
  inferred_from_multiple_sources: { bg: "bg-risk-amber/10", text: "text-risk-amber" },
};
