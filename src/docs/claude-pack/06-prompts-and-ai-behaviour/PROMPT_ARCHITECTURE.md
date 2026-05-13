# Prompt Architecture

> **AI Reader Notes**: The system prompt is 2490 lines in `_shared/wealthVerifyPrompt.ts`. This summarises its structure.

## Main System Prompt: `WEALTH_VERIFY_PROMPT`

**Location**: `supabase/functions/_shared/wealthVerifyPrompt.ts`  
**Size**: 2490 lines  
**Status**: CURRENT  

### Structure Summary

1. **Identity & Scope** (lines 1-11): Defines Olimey AI as buyer-side only AML assistant
2. **Proportionality Principle** (lines 13-23): Critical constraint — only raise necessary enquiries
3. **Reasoning Priority Hierarchy** (lines 25-66): 6-step override hierarchy
   - Step 1: Establish what IS evidenced first
   - Step 2: Identify precise remaining gaps
   - Step 3: Formulate targeted enquiries
   - Step 4: Keep peripheral issues proportionate
   - Step 5: Self-check (co-purchaser, live-to-zero)
   - Step 6: Payment-route-first precedence gate
4. **Output Structure**: Sections A-G covering all report components
5. **LSAG Checklist**: 15-point compliance checklist rules
6. **Document-Specific Rules**: Bank statements, payslips, mortgage offers, gift letters, etc.
7. **Risk Rating Rules**: Green/amber/red classification criteria
8. **Enquiry Rules**: Draft email formatting and tone

### Prompt Injection Points (Runtime)

The prompt is assembled with runtime context:
- Case data (from `resolve-sow-context`)
- Document text (extracted content)
- Knowledge base chunks (from RAG search)
- Firm policy rules (from `policyGovernance`)
- Wave 11 narrative grounding rules (static block in agent-chat)
- Wave 12 report plan prompt block (if grounded findings available)

## Guardrails and Post-Processing

**Location**: `supabase/functions/_shared/deterministicPostProcessing.ts` (2872 lines)

### Key Guardrails
1. **LSAG Enforcement**: Ensures all 15 items present with correct format
2. **Co-purchaser Guard**: Prevents misclassifying co-purchaser funds as gifts
3. **Live-to-zero Guard**: Prevents concluding savings disproved from low balances alone
4. **Overreach Guards** (12 rules): Softens dangerous assertions (certainty language, definitive conclusions)
5. **Section Injection**: Adds missing required sections
6. **Authority Label Correction**: Fixes incorrect regulatory references
7. **Armalytix Re-request Suppression**: Prevents asking for data already in Armalytix report

## Judge Models

**Location**: `supabase/functions/_shared/judgeOrchestration.ts` (454 lines)

| Judge | Model | Purpose | Outcome |
|---|---|---|---|
| Safety | gemini-2.5-flash | Checks for harmful content | PASS/FAIL/ERROR/TIMEOUT |
| Quality | gemini-2.5-flash | Scores output quality (0-10) | PASS/FAIL + structured defects |
| Relevance Gate | gemini-2.5-flash | Filters irrelevant content | PASS + filtered count |

### Quality Fail Severity Classification
- **CRITICAL**: Score < 3 or critical defect → QUARANTINED
- **HIGH**: Score 3-5 with high-severity issues → MANUAL_REVIEW_REQUIRED  
- **MEDIUM/LOW**: Score 5-7 → DEGRADED with caveats

## Input Guardrails

**Location**: `supabase/functions/_shared/inputGuardrails.ts` (218 lines)

- 12 hard-block patterns (jailbreak, role override, prompt reveal)
- Soft-warn patterns (logged but not blocked)
- Document block stripping (only scans user-authored text)
