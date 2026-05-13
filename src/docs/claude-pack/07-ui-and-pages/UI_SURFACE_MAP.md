# UI Surface Map

> **AI Reader Notes**: Major user-facing pages and their data sources.

## Public Pages
| Route | Page | Purpose |
|---|---|---|
| `/` | Index | Landing page |
| `/login` | Login | Authentication |
| `/signup` | Signup | Registration |
| `/ai-agents` | AIAgents | Agent showcase (Olimey AI only) |
| `/insights` | Insights | Articles/blog |
| `/pricing` | Pricing | Pricing plans |
| `/glossary` | Glossary | AML terminology |
| `/sdlt-calculator` | SDLTCalculator | Stamp duty calculator |
| `/portal/:token` | ClientPortal | Token-based client view |

## Protected Pages
| Route | Page | Data Source |
|---|---|---|
| `/dashboard` | Dashboard | `cases` table, user's cases |
| `/case/new` | CaseNew | Create new case |
| `/case/:id` | CaseWorkspace | Case details, tabs for reports/docs/parties |
| `/agent/source-of-wealth` | AgentChat | Olimey AI SoW form |
| `/dashboard/oversight-queue` | OversightQueue | `review_queue` + views |
| `/settings` | Settings | `profiles` table |
| `/buy-credits` | BuyCredits | Stripe checkout |

## Admin Pages (25+)
| Route | Page | Purpose |
|---|---|---|
| `/admin/users` | AdminUsers | User management |
| `/audit-log` | AuditLog | `audit_log` table |
| `/admin/knowledge-base` | AdminKnowledgeBase | Knowledge document management |
| `/admin/benchmark-vault` | AdminBenchmarkVault | Benchmark cases |
| `/admin/benchmark-dashboard` | AdminBenchmarkDashboard | Benchmark analytics |
| `/admin/prompt-management` | AdminPromptManagement | Prompt versions |
| `/admin/compliance-dashboard` | AdminComplianceDashboard | Compliance overview |
| `/admin/sow-validation` | AdminSoWValidation | SoW validation runs |
| `/admin/self-healing` | AdminSelfHealing | Self-healing/recovery |
