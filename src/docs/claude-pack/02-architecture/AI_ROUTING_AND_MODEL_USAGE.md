# AI Routing and Model Usage

> **AI Reader Notes**: All AI calls go through `_shared/aiGateway.ts`. This is the single routing point.

## Hybrid AI Gateway

The gateway routes based on payload characteristics:

### Routing Decision Tree

1. **`anthropic/*` model?** → Vertex Anthropic (europe-west4, EU). **No safe gateway fallback exists** for `anthropic/*` (see "Critical: No Anthropic Gateway Fallback" below). If Vertex is unavailable for `anthropic/*` models, the call **fails** rather than silently falling back.
2. **Streaming requested?** → Lovable Gateway (non-anthropic only)
3. **Tool calling requested?** → Lovable Gateway (Vertex format differs; non-anthropic only)
4. **Non-Google model?** → Lovable Gateway
5. **Google model not in mapping?** → Lovable Gateway
6. **Otherwise** → Vertex AI (europe-west4, EU)
7. **Vertex failure (Gemini only)** → Automatic fallback to Lovable Gateway

### Critical: No Anthropic Gateway Fallback (Operational Reality)

**The Lovable AI Gateway does not accept `anthropic/*` model strings.** A request to the gateway with `model: "anthropic/claude-opus-4.7"` returns `400 Bad Request: invalid model`. Confirmed via runtime probe on 2026-04-25.

This collapses the operational matrix to a binary:

- **Opus path operational** ⇔ `OPUS_PRIMARY_REASONER_ENABLED=true` **AND** `VERTEX_ANTHROPIC_ENABLED=true` **AND** `VERTEX_SA_CREDENTIALS` present and parseable as a valid service-account JSON with `client_email`, `private_key`, and `project_id`.
- **Any other state** → the SoW pipeline must be on the rollback path (`OPUS_PRIMARY_REASONER_ENABLED=false`), which routes to `openai/gpt-5` (agent-chat) and `google/gemini-2.5-pro` (sow-chunk-worker). Both are valid Lovable Gateway model strings.

**There is no graceful middle path.** Disabling `VERTEX_ANTHROPIC_ENABLED` while leaving `OPUS_PRIMARY_REASONER_ENABLED=true` is **structurally unsafe** — every primary SoW reasoner call will 400 at the gateway. Future operators must not turn Vertex Anthropic off thinking they have a fallback. If Vertex Anthropic must be disabled (creds rotation, region issue, publisher allowlist change), `OPUS_PRIMARY_REASONER_ENABLED` must be flipped to `false` in the same operation.

### Feature Flags

| Flag | Default | Operational default (current) | Purpose |
|---|---|---|---|
| `OPUS_PRIMARY_REASONER_ENABLED` | `true` (code default when unset) | **`false`** (pinned 2026-04-25 pending Vertex SA creds fix) | Master switch for the SoW primary reasoner swap to `anthropic/claude-opus-4.7`. When `false`, restores byte-for-byte prior behaviour: `openai/gpt-5` for agent-chat SoW, `google/gemini-2.5-pro` for sow-chunk-worker, no `max_tokens`/`thinking` in consolidation bodies. **Must be `false` whenever `VERTEX_ANTHROPIC_ENABLED=false` or Vertex SA creds are absent/broken.** |
| `VERTEX_ANTHROPIC_ENABLED` | `true` | `true` | Routes `anthropic/*` models through Vertex Anthropic (`europe-west4`). When `false`, **`OPUS_PRIMARY_REASONER_ENABLED` must also be `false`** — there is no gateway fallback for `anthropic/*` strings. |

### Model Usage by Function

| Use Case | Model (flag-ON, default) | Model (flag-OFF, rollback) | Why |
|---|---|---|---|
| Main SoW analysis (agent-chat) | `anthropic/claude-opus-4.7` | `openai/gpt-5` | Primary reasoner; deeper compliance reasoning |
| Chunk worker analysis (sow-chunk-worker) | `anthropic/claude-opus-4.7` | `google/gemini-2.5-pro` | Per-domain SoW analysis with adaptive thinking |
| **Consolidation calls (plural — both quality-regen and relevance-cleanup)** | `anthropic/claude-opus-4.7` (carried via `model` variable) + `max_tokens: 8000` + `thinking: { type: "adaptive", effort: "high" }` + `thinking_display: "summarized"` injected | `openai/gpt-5`, body of `{model, messages, stream}` only | Two full-report regenerations: `regenerateWithImprovements` (quality-judge fail) and `cleanUpFindings` (relevance-gate fail) |
| Safety judge | `google/gemini-2.5-flash` | (unchanged) | Fast, adequate for safety |
| Quality judge | `google/gemini-2.5-flash` | (unchanged) | Balanced speed/quality |
| Relevance gate | `google/gemini-2.5-flash` | (unchanged) | Fast filtering |
| Document classification | `google/gemini-2.5-flash-lite` | (unchanged) | Simple classification task |
| Agent context generation | `google/gemini-2.5-flash-lite` | (unchanged) | Simple summarisation |
| Knowledge embedding | N/A (Supabase pgvector) | N/A | Vector similarity search |
| Benchmark comparison | `google/gemini-2.5-flash` | (unchanged) | Structured comparison |

### Vertex AI Configuration (Gemini)

- **Project**: Configured via `VERTEX_PROJECT_ID` secret
- **Region**: `europe-west4` (EU data residency)
- **Auth**: Service account via `VERTEX_SA_CREDENTIALS` secret
- **Format conversion**: Gateway OpenAI format ↔ Vertex `generateContent` format handled in `vertexClient.ts`

### Vertex Anthropic Configuration

- **Endpoint**: `https://europe-west4-aiplatform.googleapis.com/v1/projects/{PROJECT}/locations/europe-west4/publishers/anthropic/models/claude-opus-4-7:rawPredict` (and `:streamRawPredict` for streaming)
- **API version**: `anthropic_version: "vertex-2023-10-16"` injected automatically by `vertexAnthropicClient.ts`
- **Auth**: same service-account flow as Gemini Vertex
- **Region**: `europe-west4` — preserves EU data residency
- **Format conversion**: `aiGateway.ts` converts OpenAI Chat Completions → Anthropic Messages format. System messages are hoisted to the top-level `system` field. Gemini-only generation parameters are stripped.
- **Streaming SSE rules**:
  - `content_block` events of type `"thinking"` are buffered into `thinking_summary` and surfaced via the streaming meta promise. They are **never** emitted as user-visible chat.completion.chunk deltas.
  - Only `"text"` content blocks are translated to OpenAI-format text deltas for downstream consumers.
  - This rule applies to all callers via `aiGateway.chatStream()`, which routes `anthropic/*` streams to `streamVertexAnthropic` when the flag is on.

### SoW Pipeline Routing Compliance

All four SoW primary-reasoner call sites are routed through `aiGateway.chat()` / `aiGateway.chatStream()` (no raw `fetch()` to the Lovable Gateway URL):

1. **agent-chat main SoW stream** (`agent-chat/index.ts` ~7199) — `chatStream()` with transient 502/503 retry wrapper.
2. **agent-chat MIME-fallback retry** (`agent-chat/index.ts` ~7311) — `chatStream()` after stripping multimodal parts.
3. **agent-chat `regenerateWithImprovements`** (consolidation call A) — `chatStream()` with adaptive thinking when flag-on.
4. **agent-chat `cleanUpFindings`** (consolidation call B) — `chatStream()` with adaptive thinking when flag-on.
5. **sow-chunk-worker** (`sow-chunk-worker/index.ts`) — `chatStream()` with transient 502/503 retry and MIME fallback.

**Out-of-scope direct callers retained in agent-chat** (judges and RAG embedding — not primary reasoner): `judgeOutput` (~4841), `judgeAgentQuality` (~4963), `judgeFindingsRelevance` (~5109), RAG embedding query (~5385). These remain on the Lovable Gateway intentionally.

**Documented exceptions** (other edge functions calling Lovable Gateway directly): `extract-doc-summaries`, `extract-armalytix`. All other functions listed in the rg audit are non-SoW workloads (classification, ingestion, knowledge embedding, etc.) and are not in scope for this routing migration.

### Provenance & Audit Logging

For each call routed through the gateway, the AI run row records:

- `routed_via`: `"vertex"` | `"vertex-anthropic"` | `"lovable-gateway"`
- `reason` (when `lovable-gateway` was a fallback or flag-disabled choice)
- `resolved_vertex_version` (from Anthropic response `model` field)
- `prompt_tokens` / `completion_tokens` (translated from Anthropic `input_tokens` / `output_tokens` for non-Anthropic-aware consumers)
- `thinking_summary` (stored separately; never in the user-visible content field)

### Parallel Chat

`parallelChat()` supports concurrent AI calls with configurable concurrency:
```typescript
const responses = await parallelChat(requests, { maxConcurrency: 4, logContext: "my-function" });
```

### Token/Cost Tracking

Usage tokens are logged per call. The gateway returns `_routed_via: "vertex" | "lovable-gateway"` for observability. Anthropic-routed calls log a `[TOKEN_USAGE]` line including the Anthropic-resolved model and translated token counts.
