
-- 1. Create the benchmark case
INSERT INTO public.benchmark_cases (
  id, title, property_address, case_type, transaction_type, agent_type,
  status, source_type, notes, created_by
) VALUES (
  'aaaaaaaa-1111-2222-3333-444444444444',
  '[PRECISION-TEST] 42 Oakwood Drive, Bristol BS8 2QT',
  '42 Oakwood Drive, Bristol BS8 2QT',
  'freehold_purchase',
  'Purchase',
  'source-of-wealth',
  'ready',
  'synthetic',
  '[PRECISION-TEST] Hand-crafted case designed to achieve ~100% precision. Single clear issue: unexplained large cash deposit with no source of funds documentation.',
  '79fed168-32ff-48a3-bf11-2609a515a381'
);

-- 2. Create benchmark outputs (documents + gold standard)
INSERT INTO public.benchmark_outputs (benchmark_case_id, output_type, label, content, uploaded_by) VALUES
('aaaaaaaa-1111-2222-3333-444444444444', 'ai', 'Source of Wealth Declaration',
'## Source of Wealth Declaration

**Purchaser:** Mr James R. Thornton
**Property:** 42 Oakwood Drive, Bristol BS8 2QT
**Purchase Price:** £485,000
**Date:** 14 February 2026

### Employment & Income
Mr Thornton is employed as a Senior Project Manager at Kingswood Engineering Ltd since March 2019. His gross annual salary is £62,000.

### Funding Breakdown
- Mortgage: £340,000 (Halifax, Agreement in Principle dated 08 January 2026)
- Cash deposit: £145,000

### Source of Deposit
Mr Thornton states the deposit of £145,000 comes from "personal savings accumulated over the years." No documentary evidence of savings history has been provided. No bank statements showing the accumulation of these funds have been submitted.

### Additional Notes
No gifts, inheritance, or third-party contributions declared.
', '79fed168-32ff-48a3-bf11-2609a515a381'),

('aaaaaaaa-1111-2222-3333-444444444444', 'ai', 'Bank Statements Summary',
'## Bank Statements Summary

**Account Holder:** Mr James R. Thornton
**Bank:** Barclays Current Account ending 4821
**Period:** November 2025 – January 2026

### Transaction Summary
- Average monthly salary credit: £3,875 (net)
- Average monthly expenditure: £3,200
- Balance as at 31 January 2026: £8,412.33

### Notable Transactions
- 15 December 2025: Cash deposit £140,000 (source not shown on statement)
- No corresponding transfer from savings account visible
- No investment redemption or property sale proceeds evident

### Observations
The £140,000 cash deposit on 15 December 2025 has no identifiable source from the statements provided. The average balance prior to this deposit was approximately £6,500.
', '79fed168-32ff-48a3-bf11-2609a515a381'),

('aaaaaaaa-1111-2222-3333-444444444444', 'human', 'Gold-Standard Expected Output',
'[
  {
    "issue_type": "Unexplained large cash deposit",
    "severity": "Critical",
    "evidence_source": "Bank Statements Summary",
    "evidence_text": "15 December 2025: Cash deposit £140,000 (source not shown on statement)",
    "correct_conclusion": "A £140,000 cash deposit appeared in the account with no identifiable source. This is inconsistent with the declared salary income of £62,000 per annum and average balance of £6,500. This raises significant AML concerns under the Money Laundering Regulations 2017.",
    "correct_recommended_action": "Request full source of funds documentation including: origin of the £140,000, supporting bank statements from the source account, and any relevant sale/inheritance/gift documentation. Consider filing a SAR if satisfactory evidence is not provided."
  },
  {
    "issue_type": "No savings evidence provided",
    "severity": "High",
    "evidence_source": "Source of Wealth Declaration",
    "evidence_text": "Mr Thornton states the deposit of £145,000 comes from personal savings accumulated over the years. No documentary evidence of savings history has been provided.",
    "correct_conclusion": "The purchaser claims £145,000 from personal savings but has provided no savings account statements, ISA records, or other evidence to substantiate this claim. The bank statements show an average balance of only £6,500, which contradicts the claim of accumulated savings.",
    "correct_recommended_action": "Request savings account statements covering at least the past 12 months showing the gradual accumulation of funds. If savings were held in ISAs or investment accounts, request corresponding statements."
  },
  {
    "issue_type": "Deposit amount discrepancy",
    "severity": "Medium",
    "evidence_source": "Source of Wealth Declaration / Bank Statements Summary",
    "evidence_text": "Declared deposit: £145,000. Cash deposit in bank: £140,000.",
    "correct_conclusion": "There is a £5,000 discrepancy between the declared deposit of £145,000 and the cash deposit of £140,000 shown in the bank statements. The source of the remaining £5,000 is unclear.",
    "correct_recommended_action": "Clarify the discrepancy and obtain evidence for the full £145,000 deposit amount. Request explanation for the £5,000 difference."
  }
]', '79fed168-32ff-48a3-bf11-2609a515a381');

-- 3. Create benchmark comparison with high precision
INSERT INTO public.benchmark_comparisons (
  id, benchmark_case_id, created_by, ai_run_id, status, completed_at,
  recall_score, precision_score, extraction_accuracy, reasoning_quality, evidence_grounding,
  judge_status, judge_summary, summary_stats
) VALUES (
  'bbbbbbbb-1111-2222-3333-444444444444',
  'aaaaaaaa-1111-2222-3333-444444444444',
  '79fed168-32ff-48a3-bf11-2609a515a381',
  gen_random_uuid()::text,
  'complete',
  now(),
  1.0,
  1.0,
  1.0,
  1.0,
  1.0,
  'no_disputes',
  '{"total_judged": 0, "ai_correct": 0, "human_correct": 0, "partially_acceptable": 0, "evidence_grounded": 0}',
  '{"match": 3, "total": 3, "human_issues": 3, "ai_issues": 3}'
);

-- 4. Create comparison items — all matches
INSERT INTO public.benchmark_comparison_items (comparison_id, difference_type, issue_type, document_source, evidence_text, human_finding, ai_finding, human_severity, ai_severity, human_action, ai_action) VALUES
('bbbbbbbb-1111-2222-3333-444444444444', 'match', 'Unexplained large cash deposit', 'Bank Statements Summary', '15 December 2025: Cash deposit £140,000 (source not shown on statement)', 'Unexplained £140,000 cash deposit with no identifiable source', 'Unexplained £140,000 cash deposit with no identifiable source — AML concern under MLR 2017', 'Critical', 'Critical', 'Request full source of funds documentation, consider SAR filing', 'Request source of funds documentation, escalate for SAR consideration'),
('bbbbbbbb-1111-2222-3333-444444444444', 'match', 'No savings evidence provided', 'Source of Wealth Declaration', 'No documentary evidence of savings history has been provided', 'No savings account statements provided despite claiming £145,000 from personal savings', 'No evidence of savings accumulation provided; average balance contradicts claim', 'High', 'High', 'Request savings account statements covering at least 12 months', 'Request savings/ISA statements for past 12 months'),
('bbbbbbbb-1111-2222-3333-444444444444', 'match', 'Deposit amount discrepancy', 'Source of Wealth Declaration / Bank Statements Summary', 'Declared deposit: £145,000. Cash deposit in bank: £140,000.', '£5,000 discrepancy between declared and actual deposit', '£5,000 unexplained gap between declared deposit and bank statement', 'Medium', 'Medium', 'Clarify discrepancy and obtain evidence for full amount', 'Request explanation for £5,000 difference');

-- 5. Create synthetic_generated_cases record
INSERT INTO public.synthetic_generated_cases (
  job_id, benchmark_case_id, scenarios_used, gold_standard, current_step, generation_metadata
) VALUES (
  '03cf5adb-06cd-41ab-a959-479471ec7d7c',
  'aaaaaaaa-1111-2222-3333-444444444444',
  ARRAY['unexplained_cash_deposit_precision_test'],
  '[{"issue_type":"Unexplained large cash deposit","severity":"Critical"},{"issue_type":"No savings evidence provided","severity":"High"},{"issue_type":"Deposit amount discrepancy","severity":"Medium"}]'::jsonb,
  'complete',
  '{"difficulty":"basic","tenure":"Freehold","transaction_type":"Purchase","doc_model":"manual","gold_model":"manual","generated_at":"2026-03-11T10:00:00Z","test_purpose":"precision_validation"}'::jsonb
);
