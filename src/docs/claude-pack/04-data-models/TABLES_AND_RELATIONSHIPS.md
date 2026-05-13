# Tables and Relationships

> **AI Reader Notes**: Core tables with key columns. Full schema available in `13-machine-readable-json/db_schema.json`.

## Core Case Tables

### `cases`
Primary case record. One per property transaction.
- PK: `id` (uuid)
- Key columns: `case_reference`, `property_address`, `transaction_type`, `tenure`, `property_type`, `purchase_price`, `status`, `risk_level`, `conveyancer_id`, `conveyancer_email`
- Financial: `purchase_price`, `stamp_duty`, `legal_fees`, `mortgage_amount`, `total_balance_available`, `excess_shortfall`, `amount_to_prove`
- Flags: `case_flags` (text[]), `gifts_involved`, `first_time_buyer`, `mortgage_required`, `mortgage_offer_in_place`
- AI: `ai_context_notes` (jsonb)
- CMS: `hoowla_matter_id`

### `case_parties`
People involved in the transaction.
- FK: `case_id` → `cases.id`
- Key: `full_name`, `role`, `email`, `buyer_type`, `pep_status`, `contribution_amount`, `on_mortgage`, `outside_uk`

### `case_notes`
User notes on cases.
- FK: `case_id` → `cases.id`
- Supports threading via `parent_id`
- Supports targeting via `target_type` + `target_id`

### `case_correspondence`
Synced correspondence from Hoowla.
- FK: `case_id` → `cases.id`
- Key: `hoowla_message_id`, `subject`, `from_email`, `to_recipients`, `sent_at`

## AI Analysis Tables

### `ai_reports`
AI-generated analysis outputs. One or more per case (versioned).
- FK: `case_id` → `cases.id`
- Key: `ai_run_id`, `internal_report`, `client_report`, `draft_email`, `chunk_output_raw`
- Status: `finalisation_status`, `confidence_level`
- Versioning: `version`, `modification_count`, `modified_by`, `modified_at`
- Downstream: `downstream_status` (jsonb)

### `evidence_references`
Evidence map entries linking report items to source documents.
- FK: `ai_report_id` → `ai_reports.id`, `case_id` → `cases.id`
- Key: `section_heading`, `item_label`, `document_name`, `page_number`, `source_snippet`, `relationship_type`, `confidence_score`

## Document Tables

### `documents`
Document metadata records.
- FK: `case_id`
- Key: `file_name`, `file_path`, `file_type`, `bucket`

### `document_intelligence`
Wave 9 extraction quality and confidence metadata.
- Key: `extraction_mode`, `document_quality`, `visual_type`, `completeness`, `confidence_score`

### `extracted_entities`
Entities extracted from documents.
- Key: `entity_type`, `entity_value`, `document_id`

### `entity_links`
Cross-document entity links.
- Key: `source_entity_id`, `target_entity_id`, `link_type`, `confidence`

## Review & Governance Tables

### `review_queue`
Items requiring human review.
- FK: `case_id`
- Key: `status`, `review_reasons`, `assigned_to`

### `review_audit_trail`
Audit trail of review actions.
- Key: `review_queue_id`, `disposition`, `reviewer_id`, `notes`

### `follow_up_tasks`
Follow-up actions from analysis.
- FK: `case_id`
- Key: `title`, `description`, `status`, `priority`, `owner_role`, `origin_type`

### `task_status_history`
Task status change audit trail.

### `observability_events`
Structured monitoring events.
- Key: `event_type`, `severity`, `case_id`, `ai_run_id`, `metadata`

## Policy & Calibration Tables

### `firm_policies`
Per-firm policy configuration (JSONB).
- Key: `firm_name`, `config` (jsonb), `policy_version`, `changed_by`, `change_note`

### `firm_policy_history`
Append-only policy version history (trigger-managed).

### `calibration_signals`
Threshold adjustment recommendations.
- Key: `risk_class`, `direction`, `target_policy_area`, `status`, `signal_strength`

### `calibration_governance_decisions`
Human governance decisions on calibration signals.

### `calibration_policy_links`
Links calibration decisions to actual policy changes.

### `structured_disagreements`
Structured human-AI disagreement records.

## Benchmark Tables

### `benchmark_cases`
Curated test cases for evaluation.

### `benchmark_documents`
Documents associated with benchmark cases.

### `benchmark_comparisons`
AI vs human comparison runs.

### `benchmark_comparison_items`
Per-item comparison results.

### `benchmark_evaluations`
Evaluation summaries with precision/recall scores.

### `benchmark_evaluation_items`
Per-risk-class evaluation items.

## User & Auth Tables

### `profiles`
User profile data.
- Key: `user_id` (FK to auth.users), `full_name`, `email`, `position`, `firm_name`, `active`

### `user_roles`
Role assignments (separate from profiles for security).
- Key: `user_id`, `role` (app_role enum)

### `user_credits`
Credit balances.
- Key: `user_id`, `balance`, `is_free_trial`, `trial_credits_granted`

### `credit_transactions`
Credit usage/grant history.

## Knowledge Base Tables

### `knowledge_bases`
Knowledge base definitions.

### `knowledge_documents`
Documents within knowledge bases.

### `knowledge_chunks`
Chunked content with embeddings for semantic search.

### `knowledge_base_content`
Alternative knowledge content with vector embeddings.
