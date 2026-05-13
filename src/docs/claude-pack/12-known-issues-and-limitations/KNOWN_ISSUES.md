# Known Issues

> **AI Reader Notes**: Honest list of known open issues.

## Critical / Active

1. **Consolidation reliability** — Background finalisation via `waitUntil` intermittently fails due to edge runtime timeouts. Status: IN RECOVERY.

2. **Large document set context limits** — Cases with 20+ documents may exceed 180K char consolidation cap, causing truncated or failed consolidation.

## Medium

3. **External intelligence partial** — Sanctions screening and adverse media are scaffolded but not deeply integrated into the analysis pipeline.

4. **No end-to-end browser tests** — Testing relies on unit/regression tests; no automated UI tests exist.

5. **Legacy tables not cleaned up** — `draft_reviews`, `exchange_guard_*` tables still exist but are unused.

## Low

6. **Prompt size** — 2490-line system prompt creates context pressure on smaller models.

7. **Regex-based section parsing** — Deterministic post-processing relies on regex patterns that may break with unexpected model output formatting.

## Limitations

- Buyer-side only — no seller analysis
- England and Wales jurisdiction only
- Single agent (Olimey AI) — no other compliance agents
- Credit-based usage — requires credit purchase for analysis
- No offline mode — requires internet connectivity
- No mobile-optimised layout (desktop-first)

## Technical Debt

- agent-chat/index.ts remains 3815 lines despite module extraction
- Some shared modules have circular-ish dependency patterns
- Knowledge base embedding uses 256-dimension vectors (may need upgrading)
- Rate limiting is basic (time-window based)
