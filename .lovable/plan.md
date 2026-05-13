## Corrected diagnosis

I was wrong in my previous reply. This is real cross-case data leakage. I have evidenced it.

What I verified directly in the database:

- The leaked tokens — "NKEM STEWART", "EVANGELIA GKATA", "CASSANDRA O'CONNOR" plus specific dates and amounts — belong to case `3202f6f3-…` (client Evangelia Gkata, Armalytix file `Armalytix_Source_of_Funds_Report-Evangelia_Gkata.pdf`). They are not generic names a model would invent.
- Across **all 20 historical AI-report rows** for case `cdb9cabe-…` (Anna O'Connor), the columns `internal_report`, `client_report`, and `chunk_output_raw` contain **zero** occurrences of any of those tokens.
- The leaked tokens were placed into Anna O'Connor's case **only inside the `ai_output` JSON** of two `ai_addressed` resolutions, both produced by `sow-finding-resolution` calling `google/gemini-2.5-flash` via the Lovable AI Gateway.
- They subsequently propagated into Anna O'Connor's `draft_email` (the leaked credit appears at offset 7,407) when the reviewer clicked "Add to Draft Email" / "Merge into Report".
- Both cases share the same `conveyancer_id`. Case `3202f6f3` was processed through the same Lovable Gateway path before this incident.
- Code review of `sow-finding-resolution` confirms it loads only the requested `ai_report_id` row and only passes that row's text to the model. There is no cross-case query in the function.

The leak therefore did not originate in our DB layer. It originated **above our function**, at the model / AI-gateway layer — context from a prior call for a different case bled into this call's response. Whether that is model-side caching, gateway-side context reuse, or another mechanism, I cannot determine from read-only inspection. But that does not change what we must do: **our edge function must refuse to persist any AI output that references identifiers, amounts, dates or narratives that are not present in the requesting case's own evidence.** Defence-in-depth at our boundary is the only safe response.

So the previous plan still applies, but the framing changes: this is **leak containment**, not hallucination cleanup.

## Plan

### 1. Mandatory cite-or-quarantine validator on every AI-drafted resolution

In `supabase/functions/sow-finding-resolution/index.ts`, after the model returns and before the resolution is persisted:

a. Build a **per-case evidence corpus** by reading, scoped strictly with `.eq('case_id', report.case_id)`:
   - `ai_reports.internal_report`, `client_report`, `chunk_output_raw` for this case
   - `armalytix_reports.raw_json` for this case
   - `extracted_entities.raw_text` and `normalised_text` for this case
   - `knowledge_base_content.raw_text` where `file_path LIKE <case_id>/%`

b. Run a deterministic, text-only validator over `added_enquiry`, `report_amendment` and `decision_log_entry`:
   - Extract every quoted string (`'…'` or `"…"`), every monetary amount (`£\d[\d,]*(?:\.\d{2})?`), every date (DD Month YYYY, DD/MM/YYYY, ISO), and every Capitalised Person-Name token sequence of length ≥ 2 (e.g. `NKEM STEWART`).
   - For each token, perform a normalised substring match (whitespace-collapsed, case-insensitive) against the case-scoped corpus.
   - If any token is unmatched, classify the draft as `ungrounded_output`.

c. When `ungrounded_output`, **persist the resolution with**:
   ```
   ai_output: {
     error: "ungrounded_output",
     unverified_tokens: [...],
     diagnostic: "AI draft referenced names, amounts or dates that do not appear in this case's own evidence."
   }
   ```
   The existing UI already disables Merge/Add-to-Email when `ai_output.error` is present, so the bad draft cannot reach the report or the draft email.

This is a hard wall regardless of where the leak originated upstream.

### 2. Tighten the resolution prompt to actively suppress fabrication

In the same function, change the system prompt so the model is explicitly told:
- It must not output any name, account, amount, date or narrative unless that exact string appears in the EVIDENCE block supplied below.
- If the evidence block contains no transactions matching the finding, it must return `added_enquiry: ""` and a `report_amendment` saying transaction-level evidence has not yet been supplied.
- Banned outputs include any name not present in the evidence block.

The validator in step 1 is the enforcement; the prompt change is the cooperation.

### 3. Pass the case-scoped evidence to the model

Today the prompt is given only the narrative `internal_report`. That is too thin and forces the model to either decline or improvise. Pass the same case-scoped evidence corpus assembled in step 1 (truncated to a token budget) as a clearly labelled, case-tagged block:
```
=== EVIDENCE FOR CASE <case_id> ONLY ===
…
=== END EVIDENCE ===
```
Combined with the "cite-or-decline" rule in step 2, the model is given exactly what it is allowed to quote.

### 4. Move `sow-finding-resolution` onto the routed AI gateway helper

`_shared/DIRECT_GATEWAY_CALLERS.md` already lists `sow-finding-resolution` as in-scope for migration off the direct Lovable-Gateway `fetch` and onto `_shared/aiGateway.ts` (Vertex EU path with provenance logging). Migrate this single call site as part of this fix. This gives us:
- per-call provenance (model, region, request id) recorded against the resolution
- the same residency/auditability posture as the migrated SoW reasoner
- a defensible answer to the question "where did the request go and what model serviced it" if a leak recurs

This does not change behaviour in the success path; it materially helps post-incident forensics if it happens again.

### 5. Clean up the contaminated artefacts on this case

One-off migration, scoped tightly:
- For `ai_report_id = fd9c00fe-9cdd-4f21-abbf-0f242a5db36b`:
  - Mark resolutions `bdb58bf6-…` and `522f3a16-…` as `quarantined: true` in their JSON, with a reason field, so the UI hides their content rather than just the merge button.
  - Strip the `<!-- ai-merge: enquiry-for=c22382df… -->…` block from `draft_email` to remove the leaked NKEM STEWART line at offset 7,407.
  - Soft-cancel any `enquiry_items` row whose `source_resolution_id` matches the two quarantined resolutions and which the reviewer has not yet touched (no reply, no evidence, status still `open`).
- Append an `audit_log` event of type `cross_case_contamination_quarantined` recording the affected case, the source case (`3202f6f3-…`), the affected resolution ids and the contaminated tokens.

### 6. One-off audit sweep across all `ai_reports`

Read-only SQL across `ai_reports.section_compliance` to find any other `ai_addressed` resolution where the `ai_output` text contains a token (Capitalised name pair, large amount, or unique narrative) not present in that report's own `internal_report` / `client_report` / `chunk_output_raw` / case-scoped evidence corpus. Output is a CSV at `/mnt/documents/cross_case_resolution_audit.csv` listing `case_id, ai_report_id, resolution_id, suspect_tokens`. We do not auto-quarantine the wider set in this batch — the user reviews the CSV and decides.

### 7. Regression test

Add `src/tests/regression/finding-resolution-cross-case-isolation.test.ts`:
- Mocks the AI gateway to return a draft containing a name and amount not present in the supplied evidence block.
- Asserts `sow-finding-resolution` persists the resolution as `ai_output.error === "ungrounded_output"` and lists the offending tokens.
- Asserts no field on `ai_reports` was mutated.

## Out of scope

- Fixing the upstream leak source (gateway / model). I cannot confirm the mechanism from inside the project. The escalation note will be added to memory and to `DIRECT_GATEWAY_CALLERS.md` so it is visible the next time we touch the gateway routing layer.
- Retroactively quarantining contaminated artefacts on cases other than `cdb9cabe-…`. Step 6 surfaces them; the user decides batch action separately.

## Honest completion posture

I will be able to runtime-test the validator (step 1) deterministically with a unit test. I will runtime-test the cleanup migration (step 5) by re-querying the affected case after the migration runs. I will **not** be able to prove the upstream leak is fixed — only that contaminated AI output can no longer be persisted into a case's report or draft email. I will say so plainly when reporting back.

## Files to change

- `supabase/functions/sow-finding-resolution/index.ts` — evidence loading, prompt tightening, post-call validator, optional gateway migration
- `supabase/functions/_shared/aiGateway.ts` — only if step 4 needs a small helper added
- `supabase/migrations/<new>.sql` — quarantine the two contaminated resolutions, scrub `draft_email`, audit log entry, soft-cancel orphaned enquiry items
- `src/tests/regression/finding-resolution-cross-case-isolation.test.ts` — new test
- `supabase/functions/_shared/DIRECT_GATEWAY_CALLERS.md` — note the incident and update migration row

## Memory follow-up

Add a Core memory entry: "AI-drafted resolutions must be cite-or-quarantine validated against the requesting case's own evidence corpus before persistence. Cross-case token leakage observed 2026-04-28 (cases 3202f6f3 → cdb9cabe). Defence-in-depth at our boundary is mandatory regardless of upstream gateway behaviour."
