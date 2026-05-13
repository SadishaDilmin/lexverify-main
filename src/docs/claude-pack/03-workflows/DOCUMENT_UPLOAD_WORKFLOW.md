# Document Upload Workflow

> **AI Reader Notes**: This covers the entire document ingestion pipeline from upload to classification.

## Trigger
User uploads files via `DocumentUpload` component or bulk upload, or files are synced from Hoowla CMS.

## Inputs
- File(s) (PDF, images, DOCX)
- Case ID
- Target folder (optional — auto-classified if omitted)

## Steps

1. **Upload to Storage** → `case-documents` bucket, path: `{caseId}/{folder}/{filename}`
2. **Create document record** → `documents` table
3. **Text Extraction** → `ingest-file-to-text` edge function
   - Native text extraction for PDFs with text layer
   - OCR for scanned documents
   - Vision model for image-only documents
   - Smart escalation via `smart-ocr-routing`
4. **Document Intelligence** (Wave 9) → `buildDocumentIntelligence()`
   - Quality assessment (high/medium/low/degraded/unreadable)
   - Extraction confidence tracking
   - Visual type classification (text_native/clean_scan/noisy_scan/screenshot/photo)
   - Completeness assessment
   - Entity extraction (person, company, bank, jurisdiction, account, employer)
5. **AI Classification** → `classify-aml-docs` edge function
   - Classifies into 25+ categories (see `classificationMapping.ts`)
   - Maps categories to case folders (aml-sow, contracts, miscellaneous)
   - Confidence level (high/medium/low)
6. **Duplicate Detection** → `check-duplicate-doc`
   - Content-hash based deduplication
7. **Entity Linking** (Wave 9) → `linkEntities()`
   - Cross-document entity matching (exact/partial/heuristic)
8. **Cache Results** → `doc_classification_cache`, `doc_processing_cache`, `document_intelligence` tables

## Outputs
- File stored in case-documents bucket
- Document record in `documents` table
- Classification in `doc_classification_cache`
- Intelligence metadata in `document_intelligence` table
- Extracted entities in `extracted_entities` table
- Entity links in `entity_links` table

## Failure Points
- OCR failure → degraded extraction, flagged as low quality
- Classification timeout → file placed in uncategorised
- Storage upload failure → user-visible error, retry available

## Status: CURRENT, STABLE
