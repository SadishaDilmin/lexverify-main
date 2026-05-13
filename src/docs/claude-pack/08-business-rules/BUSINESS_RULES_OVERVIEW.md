# Business Rules Overview

> **AI Reader Notes**: Key compliance and business logic rules.

## Lender Consideration Rules
- Spouse funds on sole-name purchase → triggers lender consideration (configurable)
- Company purchaser + director funds → triggers lender consideration (configurable)
- Beneficial interest inferred from funding patterns → triggers lender notification (configurable)
- Third-party contribution above materiality threshold → lender consideration

## MLRO Escalation Rules  
- Unexplained credit above threshold (default configurable) → MLRO consideration
- Multiple contradictions → MLRO consideration
- Adverse external signal → MLRO consideration

## Funding & Contribution Rules
- Co-purchaser funds are CONTRIBUTIONS, not gifts (deterministic guardrail)
- Third-party materiality threshold (configurable per firm)
- Undeclared gift materiality threshold (configurable)
- Funding gap above blocking threshold → blocks readiness

## Evidence Sufficiency
- 5-tier wording: FIRM / SUPPORTED / CAUTIOUS / WEAK / LIMITATION
- Wording must match evidence strength (narrative grounding)
- Contradictions must be preserved, not resolved
- Caveats must be preserved, not dropped

## Policy-Driven Thresholds (Wave 5)
All configurable per firm via `firm_policies.config`:
- `thirdPartyMaterialityThreshold` (default: configurable)
- `spouseFundsAlwaysTriggerLender` (default: true)
- `screenshotsAcceptableAsPrimary` (default: false)
- `fundingGapBlockingThreshold`
- `unexplainedCreditMlroThreshold`
- `contradictionBlockingCount`
- `overreachSofteningLevel` (strict/moderate/permissive)
- `companyDirectorFundsAlwaysTriggerLender`
- `beneficialInterestTriggerLender`
- `undeclaredGiftMaterialityThreshold`

## Overreach Guard Rules (12 deterministic rules)
Softens dangerous AI assertions:
1. Removes "definitive" / "conclusive" language where evidence is partial
2. Downgrades certainty claims unsupported by evidence
3. Prevents false-positive fraud assertions
4. Prevents medical/mental health speculation
5. Prevents immigration status speculation
6. etc.
