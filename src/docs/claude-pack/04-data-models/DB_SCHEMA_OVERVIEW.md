# Database Schema Overview

> **AI Reader Notes**: 120+ tables, 8 views, 18 enums. This document categorises them by domain.

## Table Count Summary

| Domain | Tables | Views |
|---|---|---|
| Core case management | ~15 | 1 |
| AI analysis & reports | ~8 | 0 |
| Documents & intelligence | ~10 | 0 |
| Benchmark & calibration | ~16 | 5 |
| Review & governance | ~8 | 2 |
| Knowledge base | ~4 | 0 |
| User management & auth | ~8 | 0 |
| Credits & billing | ~3 | 0 |
| External intelligence | ~5 | 0 |
| CMS integration | ~5 | 0 |
| Legacy/misc | ~15+ | 0 |

## Key Enums

| Enum | Values | Used By |
|---|---|---|
| `app_role` | super_admin, admin, support_admin, auditor, user | `user_roles` |
| `review_status` | (matches ReviewStatus enum in code) | `review_queue` |
| `review_disposition` | (matches ReviewDisposition enum) | `review_audit_trail` |
| `task_status` | open, in_progress, blocked, resolved, superseded, closed_no_action, cancelled, duplicate | `follow_up_tasks` |
| `task_priority` | critical, high, medium, low | `follow_up_tasks` |
| `task_owner_role` | (role-based task routing) | `follow_up_tasks` |
| `task_origin_type` | (finding, review, external, document, financial) | `follow_up_tasks` |
| `calibration_signal_status` | open, under_review, accepted, rejected, deferred, implemented | `calibration_signals` |
| `governance_disposition` | accepted, rejected, deferred | `calibration_governance_decisions` |
| `oversight_status` | (oversight queue states) | `benchmark_cases` |
| `benchmark_lock_type` | (system lock types) | `benchmark_system_locks` |
| `judge_calibration_verdict` | (judge audit verdicts) | `benchmark_judge_calibration` |
| `observability_severity` | info, warning, error, critical | `observability_events` |
| `ingestion_status` | (document ingestion states) | document tables |
| `ingestion_file_type` | (file type classification) | document tables |
| `extraction_failure_type` | (extraction failure categories) | `extraction_failure_logs` |
| `triage_priority` | (proactive triage levels) | `proactive_triage_rules` |
| `user_status` | (user lifecycle states) | `user_status_history` |

## Source-of-Truth Tables

| Table | Domain | Is Source of Truth For |
|---|---|---|
| `cases` | Case management | Case metadata, status, financial details |
| `case_parties` | Case management | People involved in the transaction |
| `ai_reports` | Analysis | AI-generated reports and raw outputs |
| `documents` | Documents | Document metadata |
| `firm_policies` | Governance | Per-firm policy configuration |
| `user_roles` | Auth | User role assignments |
| `profiles` | Auth | User profile data |
| `review_queue` | Review | Review items |
| `follow_up_tasks` | Tasks | Follow-up actions |
| `calibration_signals` | Calibration | Threshold adjustment recommendations |

## Derived / Read Model Tables & Views

| Entity | Type | Derives From |
|---|---|---|
| `case_operational_summary` | View | cases, ai_reports, follow_up_tasks, review_queue |
| `reviewer_queue_view` | View | benchmark_cases, benchmark_comparisons |
| `governance_queue_view` | View | calibration_signals, calibration_governance_decisions |
| `governance_decision_history` | View | calibration_governance_decisions |
| `calibration_signal_overview` | View | calibration_signals, calibration_governance_decisions |
| `evaluation_with_summary` | View | benchmark_evaluations |
| `policy_change_traceability` | View | calibration_policy_links, firm_policies |
| `policy_change_audit_trail` | View | firm_policy_history |
