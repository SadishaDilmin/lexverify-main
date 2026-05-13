# User Roles and Actors

> **AI Reader Notes**: Roles are stored in `public.user_roles` table (not on profiles). Checked via `has_role()` security definer function.

## Database Enum: `app_role`

| Role | Description | UI Access |
|---|---|---|
| `super_admin` | Platform owner, full access | All pages including admin |
| `admin` | Firm administrator | All admin pages, all cases |
| `support_admin` | Support/operations staff | UNKNOWN — likely similar to admin |
| `auditor` | Read-only audit access | UNKNOWN — likely read-only case/audit views |
| `user` | Standard conveyancer/fee earner | Dashboard, own cases, agents, settings |

## Frontend Role Type (src/types/index.ts)

```typescript
type UserRole = "super_admin" | "admin" | "support_admin" | "auditor" | "user";
```

## Route Protection

- **Public routes**: Landing, login, signup, pricing, glossary, insights, calculators
- **Protected routes** (`ProtectedRoute`): Dashboard, case workspace, agent chat, settings, credits
- **Admin routes** (`AdminRoute`): All `/admin/*` paths — server-side role check via `has_role()`

## Key Actors in Workflows

| Actor | Role in System |
|---|---|
| **Conveyancer** | Creates cases, uploads documents, runs Olimey AI, reviews outputs |
| **Compliance Officer** | Reviews AI outputs, makes review dispositions, MLRO escalation decisions |
| **MLRO** | Receives escalation recommendations, makes final SAR decisions |
| **Admin** | Manages users, domains, knowledge base, prompt management, benchmarks |
| **System (AI)** | Runs analysis, generates reports, creates review items, emits observability events |

## User Provisioning

1. User signs up → `handle_new_user()` trigger creates profile + assigns `user` role
2. Email domain checked against `approved_domains` → sets `active` flag
3. Trial credits provisioned via `provision_trial_credits()` trigger (100 credits)
4. Admin can manually change roles via admin user management
