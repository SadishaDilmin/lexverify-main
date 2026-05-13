# Component Map

> **AI Reader Notes**: Maps shared backend modules to their wave and responsibility.

## Shared Module Dependency Graph

## Shared Modules

| Module | Wave | Responsibility | Lines |
|---|---|---|---|
| `financialReconciliation.ts` | Wave 15 | Pure-function deterministic arithmetic — sufficiency check in 15.1; bank-statement and payslip reconciliation in 15.2/15.3 | 103 |

```
aiGateway ← (all edge functions that call AI)
    ← vertexClient (Google-specific)
    ← vertexAuth (service account auth)

evidenceEngine (W2)
    ← compliancePolicy (W4) [uses MaterialFinding types]
    ← operationalEngine (W3) [uses findings, LSAG types]
    ← narrativeGrounding (W11) [uses evidence anchors]
    ← groundedReportPlan (W12) [uses findings, anchors]
    ← calibrationBenchmarking (W13) [uses MaterialFindingCategory]
    ← deterministicPostProcessing [uses LSAG, evidence types]

compliancePolicy (W4)
    ← policyGovernance (W5) [extends with DB persistence]
    ← agent-chat [uses Wave4 pipeline]
    ← deterministicPostProcessing [uses overreach guards]

reviewEngine (W6)
    ← taskLifecycleEngine (W8) [uses ReviewDisposition]
    ← externalIntelligence (W7) [uses ObservabilityEvent types]
    ← agent-chat [uses review queue logic]

documentIntelligence (W9)
    ← transactionExtraction (W10) [uses DocumentIntelligence types]
    ← agent-chat [uses during ingestion]

narrativeGrounding (W11)
    ← groundedReportPlan (W12) [uses GroundedFinding, WordingTier]
    ← calibrationBenchmarking (W13) [uses WordingTier]

judgeOutcomes (W1)
    ← judgeOrchestration [uses JudgeOutcome, ValidationStatus]
    ← agent-chat [uses validation state model]

inputGuardrails
    ← agent-chat [uses injection detection]

deterministicPostProcessing
    ← compliancePolicy, operationalEngine, evidenceEngine, policyGovernance
    ← agent-chat [main post-processing pipeline]
```

## Frontend Component Map

### Core Workflow Components

| Component | Location | Purpose |
|---|---|---|
| `SoWFormUI` | `src/components/SoWFormUI.tsx` | Main Olimey AI submission form |
| `useSoWSubmit` | `src/hooks/useSoWSubmit.ts` | Submission orchestration hook (1582 lines) |
| `CaseWorkspace` | `src/pages/CaseWorkspace.tsx` | Main case view with tabs |
| `CaseFileBrowser` | `src/components/CaseFileBrowser.tsx` | Document file browser |
| `DocumentUpload` | `src/components/DocumentUpload.tsx` | Upload component |
| `EditableReportTab` | `src/components/EditableReportTab.tsx` | Report viewing/editing |
| `AgentChat` | `src/pages/AgentChat.tsx` | Agent interaction page |

### Admin Components

| Component | Purpose |
|---|---|
| `AdminRoute` | Role-based route guard |
| `AdminBenchmarkVault` | Benchmark case management |
| `AdminBenchmarkDashboard` | Benchmark analytics |
| `AdminKnowledgeBase` | Knowledge document management |
| `AdminPromptManagement` | Prompt version management |
| `AdminUsers` | User management |
| `AdminComplianceDashboard` | Compliance overview |
| `OversightQueue` | Human review queue |
