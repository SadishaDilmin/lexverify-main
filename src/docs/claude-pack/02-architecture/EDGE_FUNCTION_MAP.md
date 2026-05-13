# Edge Function Map

> **AI Reader Notes**: Complete list of all edge functions with purpose and status.

| Function | Purpose | Auth | Status |
|---|---|---|---|
| `agent-chat` | Main Olimey AI orchestration — streaming SSE | JWT | CURRENT |
| `sow-chunk-worker` | Per-domain document batch analysis | JWT | CURRENT |
| `sow-finalise` | Background consolidation of chunk outputs | JWT | CURRENT (recovery) |
| `sow-section-validator` | Post-generation section validation | JWT | CURRENT |
| `resolve-sow-context` | Context assembly for SoW analysis | JWT | CURRENT |
| `classify-aml-docs` | AI document classification | JWT | CURRENT |
| `ingest-file-to-text` | Document text extraction (OCR + native) | JWT | CURRENT |
| `extract-armalytix` | Armalytix report JSON parsing | JWT | CURRENT |
| `smart-ocr-routing` | OCR escalation routing | JWT | CURRENT |
| `search-knowledge` | Semantic knowledge chunk search | JWT | CURRENT |
| `search-knowledge-base` | Knowledge base content search | JWT | CURRENT |
| `embed-knowledge` | Generate embeddings for knowledge docs | JWT | CURRENT |
| `classify-knowledge-docs` | Knowledge document classification | JWT | CURRENT |
| `export-knowledge-csv` | Knowledge base CSV export | JWT | CURRENT |
| `review-actions` | Review disposition + audit trail | JWT | CURRENT |
| `companies-house-lookup` | Companies House API proxy | JWT | CURRENT |
| `fca-register-check` | FCA Register API proxy | JWT | CURRENT |
| `ofsi-sanctions-check` | OFSI sanctions screening | JWT | CURRENT |
| `fatf-jurisdiction-check` | FATF jurisdiction risk check | JWT | CURRENT |
| `fatf-refresh` | FATF list data refresh | JWT | CURRENT |
| `profile-intelligence` | Profile enrichment orchestration | JWT | CURRENT |
| `sync-hoowla` | Hoowla CMS matter sync | JWT | CURRENT |
| `sync-hoowla-docs` | Hoowla document sync | JWT | CURRENT |
| `sync-hoowla-messages` | Hoowla message/correspondence sync | JWT | CURRENT |
| `sync-hoowla-notes` | Hoowla notes sync | JWT | CURRENT |
| `validate-hoowla` | Hoowla API key validation | JWT | CURRENT |
| `generate-agent-context` | Pre-analysis AI context generation | JWT | CURRENT |
| `generate-compliance-report` | Compliance report generation | JWT | CURRENT |
| `extract-case-fields` | Case field extraction from docs | JWT | CURRENT |
| `extract-doc-summaries` | Document summary extraction | JWT | CURRENT |
| `extract-form-from-docs` | Form data extraction | JWT | CURRENT |
| `benchmark-compare` | Benchmark comparison execution | JWT | CURRENT |
| `benchmark-analyze-patterns` | Failure pattern analysis | JWT | CURRENT |
| `benchmark-worker` | Benchmark batch job processing | JWT | CURRENT |
| `generate-prompt-patches` | AI-generated prompt improvements | JWT | CURRENT |
| `verify-prompt-deploy` | Prompt deployment verification | JWT | CURRENT |
| `generate-synthetic-case` | Synthetic test case generation | JWT | CURRENT |
| `run-regression-test` | Regression test execution | JWT | CURRENT |
| `stress-test-sow` | SoW stress testing | JWT | CURRENT |
| `confidence-recalibration` | Confidence threshold recalibration | JWT | CURRENT |
| `regulatory-audit-worker` | Regulatory audit processing | JWT | CURRENT |
| `clause-pattern-healing` | Clause pattern memory healing | JWT | CURRENT |
| `rename-document` | Document rename in storage | JWT | CURRENT |
| `check-duplicate-doc` | Duplicate document detection | JWT | CURRENT |
| `admin-user-actions` | Admin user management actions | JWT | CURRENT |
| `create-checkout` | Stripe checkout session creation | JWT | CURRENT |
| `verify-payment` | Stripe payment verification | JWT | CURRENT |
| `send-welcome-email` | Welcome email via Resend | JWT | CURRENT |
| `send-referral-invite` | Referral invitation email | JWT | CURRENT |
| `article-tts` | Article text-to-speech | JWT | CURRENT |
| `support-chat` | Support chat endpoint | JWT | CURRENT |
| `ai-case-search` | AI-powered case search | JWT | CURRENT |
| `agent-query` | Agent query endpoint | JWT | CURRENT |
| `dms-listener` | Document management system listener | JWT | CURRENT |
| `ingest-replies` | Enquiry reply ingestion | JWT | CURRENT |
| `manage-cms-integration` | CMS integration management | JWT | CURRENT |
| `check-cms-integration` | CMS integration status check | JWT | CURRENT |
| `pre-sow-checks` | Wave 15.1 deterministic source-to-funds sufficiency arithmetic; runs before AI | JWT | CURRENT |
| `detect-title-defects` | LEGACY (LexTitle) | JWT | DEPRECATED |
