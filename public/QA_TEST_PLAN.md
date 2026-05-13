# Olimey AI — Comprehensive QA Test Plan

**Version:** 1.0  
**Date:** 14 March 2026  
**Platform:** https://lexsentinel-insight.lovable.app  
**Prepared for:** QA Specialist  

---

## Table of Contents

1. [Test Environment & Preconditions](#1-test-environment--preconditions)
2. [Public Pages (Unauthenticated)](#2-public-pages-unauthenticated)
3. [Authentication & Account Setup](#3-authentication--account-setup)
4. [AI Disclaimer & Onboarding](#4-ai-disclaimer--onboarding)
5. [Dashboard](#5-dashboard)
6. [Case Management](#6-case-management)
7. [Case Workspace Tabs](#7-case-workspace-tabs)
8. [AI Agents — Overview](#8-ai-agents--overview)
9. [Olimey AI Agent (Source of Wealth)](#9-wealthverify-agent-source-of-wealth)
10. [TitleShield™ Agent (Draft Review)](#10-titleshield-agent-draft-review)
11. [TerraGuard™ Agent (Search Review)](#11-terraguard-agent-search-review)
12. [ExchangeGuard™ Agent (Pre-Exchange)](#12-exchangeguard-agent-pre-exchange)
13. [Beta Agents (Chat & Form)](#13-beta-agents-chat--form)
14. [Credits & Billing](#14-credits--billing)
15. [User Management (Admin)](#15-user-management-admin)
16. [Admin Tools & Dashboards](#16-admin-tools--dashboards)
17. [Settings & Account](#17-settings--account)
18. [Tools & Calculators](#18-tools--calculators)
19. [Content Pages](#19-content-pages)
20. [Global UI Components](#20-global-ui-components)
21. [Security & Access Control](#21-security--access-control)
22. [Network Resilience & Error Handling](#22-network-resilience--error-handling)
23. [Performance & Responsiveness](#23-performance--responsiveness)
24. [Accessibility](#24-accessibility)
25. [Cross-Browser & Device Testing](#25-cross-browser--device-testing)

---

## 1. Test Environment & Preconditions

### Required Test Accounts
| Account | Role | Purpose |
|---------|------|---------|
| Admin account | `admin` | Full access to all admin features |
| Support Admin account | `support_admin` | Test limited admin access |
| Auditor account | `auditor` | Test read-only admin access |
| Standard user account | `user` | Test regular user flows |
| Inactive/pending user | `user` (inactive) | Test blocked access flow |
| Second firm user | `user` | Test firm-level isolation |

### Browsers to Test
- Chrome (latest) — Desktop & Mobile
- Safari (latest) — Desktop & Mobile (iOS)
- Firefox (latest) — Desktop
- Edge (latest) — Desktop

### Preconditions
- [ ] Confirm all test accounts exist and can log in
- [ ] Confirm at least one approved domain exists in the system
- [ ] Confirm credits are available for the admin and standard user accounts
- [ ] Prepare test documents: PDF searches, draft contracts, bank statements, payslips

---

## 2. Public Pages (Unauthenticated)

### 2.1 Landing Page (`/`)
- [ ] Page loads without errors
- [ ] All navigation links in header work (AI Agents, Insights, Pricing, About, etc.)
- [ ] CTA buttons ("Get Started", "Request Access") navigate correctly
- [ ] Page is responsive on mobile
- [ ] SEO: Verify `<title>`, `<meta description>`, single `<h1>`

### 2.2 AI Agents Page (`/ai-agents`)
- [ ] All agent cards render with correct names, descriptions, icons
- [ ] Available agents show correct credit cost
- [ ] Unavailable/upcoming agents show "Coming Soon" or equivalent
- [ ] Category filter works
- [ ] Search filter works
- [ ] "Register Interest" buttons work for unavailable agents
- [ ] Beta agents display beta badge

### 2.3 Pricing Page (`/pricing`)
- [ ] Pricing tiers display correctly
- [ ] CTA buttons link to signup or contact

### 2.4 About Us (`/about`)
- [ ] Team photos and bios load
- [ ] Page renders without console errors

### 2.5 Insights / Blog (`/insights`)
- [ ] Articles list renders
- [ ] Clicking an article navigates to `/insights/:slug`
- [ ] Article page renders full content
- [ ] Audio player appears (if TTS is available for article)
- [ ] Download button works
- [ ] Social sharing / copy link works

### 2.6 Glossary (`/glossary`)
- [ ] Terms list renders with search/filter
- [ ] Clicking a term expands its definition
- [ ] Analytics tracking fires on term views (check network tab)

### 2.7 Demo Page (`/demo`)
- [ ] All demo mockup tabs render (Signup, New Case, Upload, Report, Export, Edit, Agents)
- [ ] Interactive elements respond to clicks

### 2.8 SDLT Calculator (`/sdlt-calculator`)
- [ ] Price input works
- [ ] First-time buyer toggle works
- [ ] Additional property surcharge toggle works
- [ ] Calculation produces correct results
- [ ] PDF download generates valid document

### 2.9 Profitability Calculator (`/calculator`)
- [ ] Input fields accept values
- [ ] Calculation results display
- [ ] PDF export works

### 2.10 Legal Pages
- [ ] Terms & Conditions (`/terms`) — renders, scrollable
- [ ] Privacy Policy (`/privacy`) — renders, scrollable

### 2.11 404 Page
- [ ] Navigating to `/nonexistent-page` shows branded 404 page
- [ ] "Go Home" or "Back" link works

---

## 3. Authentication & Account Setup

### 3.1 Signup (`/signup`)
- [ ] Form validates required fields (full name, email, password, firm name, position)
- [ ] Password validation enforces minimum strength requirements
- [ ] Turnstile CAPTCHA renders and must be completed
- [ ] Submit with valid data creates account
- [ ] Email confirmation is sent (check inbox)
- [ ] User cannot log in until email is confirmed
- [ ] Duplicate email shows appropriate error
- [ ] Link to Login page works
- [ ] Link to Request Access works

### 3.2 Login (`/login`)
- [ ] Form validates email and password fields
- [ ] Turnstile CAPTCHA renders and must be completed
- [ ] Valid credentials → redirect to `/dashboard`
- [ ] Invalid credentials → error toast shown
- [ ] Unconfirmed email → appropriate error message
- [ ] "Forgot password?" link navigates to `/forgot-password`
- [ ] "Create account" link navigates to `/signup`
- [ ] "Request access" link navigates to `/request-access`
- [ ] Dev-only "Fill demo credentials" button appears only in dev mode
- [ ] Already authenticated user visiting `/login` → redirected to `/dashboard`

### 3.3 Forgot Password (`/forgot-password`)
- [ ] Email field validates
- [ ] Submitting sends password reset email
- [ ] Success message displayed
- [ ] Link back to login works

### 3.4 Reset Password (`/reset-password`)
- [ ] Page loads when accessed via email link with `type=recovery` hash
- [ ] Password field validates
- [ ] Submitting updates password
- [ ] Success confirmation shown
- [ ] Can log in with new password

### 3.5 Request Access (`/request-access`)
- [ ] Form fields render (name, email, position, reason)
- [ ] Submit creates access request
- [ ] Success message displayed
- [ ] Admin can see pending requests in admin panel

### 3.6 Free Trial Request (`/request-trial`)
- [ ] Form renders
- [ ] Submit creates trial request
- [ ] Confirmation shown

### 3.7 Domain-Based Access Control
- [ ] User with unapproved email domain → sees "Account pending approval" screen
- [ ] Approved domain user → proceeds to disclaimer then dashboard
- [ ] Admin can add/remove approved domains via `/admin/approved-domains`

---

## 4. AI Disclaimer & Onboarding

### 4.1 AI Disclaimer Dialog
- [ ] First login after signup → AI Disclaimer dialog appears
- [ ] Dialog cannot be dismissed without clicking "Accept"
- [ ] Accepting logs timestamp to user profile
- [ ] Accepting logs event to audit trail
- [ ] Subsequent logins (same session) → dialog does NOT appear
- [ ] Clearing localStorage → dialog re-appears (then syncs from DB)
- [ ] Cross-tab: accepting in one tab reflects in another on refresh

### 4.2 Onboarding Tour
- [ ] Dashboard tour triggers on first visit (if implemented)
- [ ] Tour highlights key navigation elements
- [ ] Tour can be dismissed/skipped

---

## 5. Dashboard

### 5.1 Layout & Navigation
- [ ] Sidebar renders with all navigation groups
- [ ] Sidebar collapse/expand toggle works
- [ ] Collapsed sidebar shows tooltips on hover
- [ ] Mobile hamburger menu opens/closes
- [ ] Active route is highlighted in sidebar
- [ ] User avatar/initials display in sidebar footer
- [ ] Credit balance shows in sidebar
- [ ] "Sign out" button works
- [ ] Notification bell icon present and clickable
- [ ] Referral widget present

### 5.2 Dashboard Content
- [ ] Case list/cards render
- [ ] Cases show correct status badges (open, review_ready, completed, etc.)
- [ ] Cases show risk level badges (green, amber, red)
- [ ] Search/filter cases works
- [ ] Clicking a case navigates to `/case/:id`
- [ ] "New Case" button navigates to `/case/new`
- [ ] Ring chart / analytics widgets render
- [ ] Recent activity timeline renders
- [ ] Hovering over a case card prefetches the workspace chunk (verify in Network tab)

### 5.3 Oversight Queue (`/dashboard/oversight-queue`)
- [ ] Queue renders pending oversight items
- [ ] Filter/search works
- [ ] Can approve/reject items
- [ ] Actions logged to audit trail

---

## 6. Case Management

### 6.1 Create New Case (`/case/new`)
- [ ] Form renders all fields: case reference, property address, transaction type, tenure, property type, fee earner, lender
- [ ] Required fields are validated
- [ ] Transaction type dropdown: Purchase / Sale
- [ ] Tenure dropdown: Freehold / Leasehold / Commonhold / Unknown
- [ ] Property type dropdown: House / Flat / Maisonette / Other / Unknown
- [ ] Tool chooser (CaseToolChooser) renders available agents
- [ ] Submitting creates case and redirects to workspace
- [ ] Case appears in dashboard list

### 6.2 Case Duplication
- [ ] Navigating to `/case/new?duplicateId=<id>` pre-fills metadata from source case
- [ ] Ownership validation: attempting to duplicate another firm's case → "Case not found or access denied" error
- [ ] Duplicated case creates new ID with pre-filled fields

### 6.3 Case Banner
- [ ] CaseBanner shows case reference and property address on all case-related pages
- [ ] Banner is persistent across tab navigation in workspace

---

## 7. Case Workspace Tabs

**Route:** `/case/:id`

### 7.1 General
- [ ] All tabs render and are navigable
- [ ] Each tab is wrapped in its own ErrorBoundary (crash in one tab doesn't break others)
- [ ] Suspense fallback shows loading state for lazy-loaded tabs
- [ ] Tab state persists when switching between tabs

### 7.2 Overview Tab
- [ ] Case details display
- [ ] Status and risk level shown
- [ ] Edit case details works
- [ ] Editable parties (EditableParties) — add, edit, remove parties
- [ ] Document completeness card shows progress

### 7.3 Documents / Files Tab
- [ ] Document upload works (drag-and-drop and click-to-browse)
- [ ] Multiple file upload works
- [ ] Folder upload works
- [ ] Upload progress indicator shows
- [ ] Duplicate document detection dialog appears when appropriate
- [ ] File browser (CaseFileBrowser) lists uploaded documents
- [ ] Document viewer dialog opens documents
- [ ] Document classification (auto-categorisation) runs after upload
- [ ] Protected file detection warns about encrypted/password-protected files
- [ ] Document rename works
- [ ] Document version history shows versions
- [ ] Ingestion status badges show processing state

### 7.4 AI Review / Risk Score Tab
- [ ] Triggering AI review works (deducts credits)
- [ ] Risk score displays after review completes
- [ ] Risk score breakdown shows per-category scores
- [ ] Risk score trend chart renders historical data
- [ ] Evidence chips link to source documents
- [ ] Confidence calibration panel shows AI confidence levels
- [ ] Structured report tab renders formatted report
- [ ] Reports can be edited (EditableReportTab)
- [ ] Reports can be exported (PDF / DOCX)

### 7.5 Enquiry Tracker Tab
- [ ] Enquiries list renders
- [ ] Can add/edit/delete enquiries
- [ ] Enquiry status tracking works
- [ ] Follow-up reminder panel shows scheduled reminders

### 7.6 Draft Review Tab (TitleShield™)
- [ ] Draft review results render
- [ ] HMLR disclosure panel shows
- [ ] Draft review status card displays
- [ ] Classification confirm dialog works
- [ ] Results show evidence citations

### 7.7 Agent Chat Tab
- [ ] Chat interface renders
- [ ] Can send messages
- [ ] Agent responses stream in
- [ ] File attachments in chat work
- [ ] Chat history persists
- [ ] Evidence source navigator works
- [ ] AI usage disclosure button visible

### 7.8 Collaborative Notes Tab
- [ ] Can create notes
- [ ] Notes support threading (replies)
- [ ] Notes can be pinned
- [ ] Notes show author name and timestamp
- [ ] Voice note recorder works (if supported by browser)

### 7.9 Audit Log Tab
- [ ] Case-specific audit events display
- [ ] Export audit trail works
- [ ] Events include timestamps, user info, and event types

### 7.10 QA Check Tab
- [ ] QA checklist renders
- [ ] Items can be checked/unchecked
- [ ] Progress indicator updates

### 7.11 Additional Workspace Features
- [ ] Conflict check panel works
- [ ] Cross-case risk patterns display
- [ ] Title defect detection works
- [ ] Smart doc pre-read works
- [ ] Lender rules warning displays when applicable
- [ ] Case archive export generates downloadable file
- [ ] Client portal manager — create/revoke portal tokens
- [ ] Client portal upload works via token-based access
- [ ] Incremental re-analysis works
- [ ] Batch analysis panel works
- [ ] GDPR data export panel works
- [ ] MFA enforcement card displays
- [ ] Regulatory report panel works

---

## 8. AI Agents — Overview

### 8.1 Agent Selection
- [ ] `/ai-agents` page shows all agents with correct availability status
- [ ] Credit costs displayed per agent
- [ ] "Use Agent" / "Start" buttons link to correct flows
- [ ] Case-review agents link to `/case/new` or specific workspace
- [ ] Chat agents link to `/agent/:agentId`
- [ ] Form agents render inline form

### 8.2 Agent Chat (`/agent/:agentId`)
- [ ] Requires authentication (redirects to login if not authenticated)
- [ ] Case picker dialog appears to select a case
- [ ] Chat interface loads
- [ ] Messages send and receive
- [ ] Streaming responses work
- [ ] File attachment works
- [ ] AI disclaimer/disclosure visible
- [ ] Credits deducted per interaction

---

## 9. Olimey AI Agent (Source of Wealth)

### 9.1 Intake Wizard
- [ ] Step 1 — Property Details: Purchase price, address, transaction type fields work
- [ ] Step 2 — Funding Sources: Mortgage, deposit, savings, gift fields work
- [ ] Step 3 — Risk Context: PEP status, buyer type, relationship fields work
- [ ] Step 4 — Additional Context: Free-text context field works
- [ ] Form auto-saves to sessionStorage on every step change (verify via DevTools > Application > Session Storage)
- [ ] Resuming after page refresh restores form state
- [ ] Wizard navigation: Next, Back, Submit buttons work
- [ ] Validation prevents advancing with missing required fields

### 9.2 Document Upload
- [ ] Upload bank statements, payslips, gift letters, mortgage offers
- [ ] Bulk upload (BulkAMLUpload) works
- [ ] AML document classification runs automatically
- [ ] Document types correctly identified
- [ ] Upload progress shown
- [ ] Duplicate detection works

### 9.3 Analysis & Results
- [ ] Triggering analysis deducts credits (20 credits)
- [ ] Analysis progress shown (multi-pass parallel processing)
- [ ] Results page renders:
  - [ ] Risk rating (High / Medium / Low)
  - [ ] Funding gap calculation
  - [ ] Sankey funding flow map
  - [ ] Person-document attribution
  - [ ] Evidence citations with document references
  - [ ] Structured enquiries
  - [ ] AML check summary
- [ ] Funding gap calculator (SoWFundingGapCalculator) shows surplus/deficit
- [ ] Risk guidance panel provides regulatory references
- [ ] Missing documents panel identifies gaps
- [ ] SoW comparison view works
- [ ] Post-analysis actions available

### 9.4 Reports & Export
- [ ] Internal report generates
- [ ] Client report generates (with internal notes redacted)
- [ ] Lender-ready PDF export works
- [ ] Report includes compliance footer with SRA/CLC firm number
- [ ] Reports include evidence citations
- [ ] Reports include AI confidence levels

### 9.5 SoW Workspace Features
- [ ] SoW case header displays
- [ ] SoW case progress tracker shows workflow steps
- [ ] SoW action sidebar provides quick actions
- [ ] Document completeness card updates
- [ ] Transaction dialog works
- [ ] Incremental re-analysis after new documents

### 9.6 Stress Testing (Admin Only)
- [ ] `/admin/stress-test` loads adversarial test cases
- [ ] UK adversarial SoW dataset loads
- [ ] Olimey AI UK stress test dataset loads
- [ ] Running stress tests produces results with correct assessments
- [ ] Scoring against ground truth works

---

## 10. TitleShield™ Agent (Draft Review)

### 10.1 Document Upload & Classification
- [ ] Upload draft contracts, TR1, title docs, leases, protocol forms
- [ ] Auto-classification identifies document types
- [ ] Classification confirmation dialog allows corrections

### 10.2 Review Execution
- [ ] Triggering review deducts credits (15 credits)
- [ ] Review processes all uploaded documents
- [ ] Results render in DraftReviewWorkspace
- [ ] Draft review results show categorised findings
- [ ] HMLR disclosure panel displays compliance info
- [ ] Evidence references link to source documents

### 10.3 Reply Ingestion
- [ ] Uploading seller's replies costs 1 additional credit
- [ ] Re-analysis incorporates replies
- [ ] Updated results display

---

## 11. TerraGuard™ Agent (Search Review)

### 11.1 Document Upload
- [ ] Upload local authority searches, environmental reports, drainage & water, EPCs
- [ ] Document classification identifies search types

### 11.2 Review & Results
- [ ] Triggering review deducts credits (7 credits)
- [ ] Risk-scored findings display with evidence citations
- [ ] Client report auto-generates
- [ ] Draft enquiry email auto-generates
- [ ] Full audit trail recorded

---

## 12. ExchangeGuard™ Agent (Pre-Exchange)

### 12.1 Setup
- [ ] Navigate to `/exchange-guard`
- [ ] Case selection works
- [ ] Form auto-saves state (useFormDraft integration)

### 12.2 Document Upload
- [ ] Bulk file ingestion works
- [ ] Auto-classification and indexing runs
- [ ] Missing document detection based on transaction type and lender

### 12.3 Analysis
- [ ] Triggering analysis deducts credits (25 credits)
- [ ] Exchange readiness report generates
- [ ] Risk ratings: Green / Amber / Red / Critical
- [ ] Exchange decision support provided
- [ ] Further enquiries generated with document references
- [ ] Workspace at `/exchange-guard/:id` displays results

---

## 13. Beta Agents (Chat & Form)

### 13.1 Contract Clause Analyser
- [ ] Form renders: clause text, context dropdown, concern field
- [ ] Submit analyses clause and returns structured breakdown
- [ ] Credits deducted (2 credits)
- [ ] Beta badge visible

### 13.2 Regulatory Compliance Checker
- [ ] Chat interface loads
- [ ] Can ask compliance questions
- [ ] Responses reference SRA, CLC, LSAG
- [ ] Credits deducted (2 credits)

### 13.3 Case Law Research Assistant
- [ ] Chat interface loads
- [ ] Can search for case law
- [ ] Responses include case references
- [ ] Credits deducted (3 credits)

### 13.4 Legal Document Summariser
- [ ] Form renders: document text, document type, focus areas
- [ ] Submit returns structured summary
- [ ] Credits deducted (2 credits)

### 13.5 Statute Lookup Tool
- [ ] Chat interface loads
- [ ] Can look up statutory provisions
- [ ] Responses reference specific Acts and sections
- [ ] Credits deducted (1 credit)

---

## 14. Credits & Billing

### 14.1 Buy Credits (`/buy-credits`)
- [ ] Credit packages display with prices
- [ ] Selecting a package initiates Stripe checkout
- [ ] Payment success redirects to `/payment-success`
- [ ] Credits added to account after payment
- [ ] Credit balance updates in sidebar

### 14.2 Payment Success (`/payment-success`)
- [ ] Success confirmation displays
- [ ] Credit balance reflects new credits

### 14.3 Transaction History (`/transactions`)
- [ ] All credit transactions listed
- [ ] Shows: date, type (purchase, deduction, refund), amount, balance after
- [ ] Case-linked transactions show case reference
- [ ] Pagination works for long lists

### 14.4 Credit Deduction
- [ ] Each agent run deducts correct credit amount
- [ ] Insufficient credits → appropriate error message (prevent run)
- [ ] Credit badge in sidebar updates in real-time
- [ ] Free trial badge shows for trial accounts

---

## 15. User Management (Admin)

### 15.1 User Directory (`/admin/users`)
- [ ] User list renders with: name, email, position, firm, role, status
- [ ] Search by name/email works
- [ ] Filter by role works
- [ ] Filter by status works
- [ ] Sort columns work
- [ ] Pagination works

### 15.2 Create User
- [ ] "Create User" button opens dialog
- [ ] Form validates: email, full name, position, firm, role
- [ ] Only assignable roles shown (based on current user's role)
- [ ] Creating user sends invitation email
- [ ] New user appears in directory with "pending_invite" status

### 15.3 User Invitations
- [ ] Admin can invite users by email
- [ ] Duplicate invite prevention (cannot invite same email twice if active)
- [ ] Resend invitation button works
- [ ] Cancel invitation button works
- [ ] Invitation status tracking: pending, accepted, expired, cancelled

### 15.4 Edit User
- [ ] Clicking user opens detail panel
- [ ] Can edit: full name, position, firm name, role
- [ ] Role dropdown only shows roles at or below current user's rank
- [ ] Save updates user profile
- [ ] Changes logged to audit trail

### 15.5 User Status Management
- [ ] Activate user (inactive → active)
- [ ] Deactivate user (active → inactive)
- [ ] Suspend user (with reason) → user sees suspension message on login
- [ ] Unlock user (locked → active)
- [ ] Status transitions logged to `user_status_history`

### 15.6 User Deletion
- [ ] Soft delete: sets `deleted_at` timestamp
- [ ] Confirmation dialog requires typed confirmation
- [ ] Cannot delete yourself
- [ ] Cannot delete the last admin
- [ ] Permanent delete: restricted to super admins only
- [ ] Deleted users cannot log in

### 15.7 Bulk Actions
- [ ] Select multiple users via checkboxes
- [ ] Bulk activate works
- [ ] Bulk deactivate works
- [ ] Bulk role change works
- [ ] Bulk action toolbar appears when users selected

### 15.8 User Export
- [ ] CSV export button works
- [ ] Export includes all user fields
- [ ] Export respects current filters

### 15.9 Role-Based Permission Checks
| Action | Admin | Support Admin | Auditor | User |
|--------|-------|---------------|---------|------|
| View users | ✅ | ✅ | ✅ | ❌ |
| Create users | ✅ | ✅ | ❌ | ❌ |
| Edit users | ✅ | ✅ | ❌ | ❌ |
| Delete users | ✅ | ❌ | ❌ | ❌ |
| Manage roles | ✅ | ❌ | ❌ | ❌ |
| Reset credentials | ✅ | ✅ | ❌ | ❌ |
| Bulk actions | ✅ | ❌ | ❌ | ❌ |
| Export users | ✅ | ✅ | ✅ | ❌ |
| View audit log | ✅ | ✅ | ✅ | ❌ |
| Permanent delete | ✅ | ❌ | ❌ | ❌ |

- [ ] Verify each cell in the table above by logging in as each role

---

## 16. Admin Tools & Dashboards

### 16.1 Feedback (`/admin/feedback`)
- [ ] Feedback list renders
- [ ] Filter by status/type works
- [ ] Can review and respond to feedback
- [ ] Can promote feedback to enhancement (PromoteToEnhancementDialog)
- [ ] Can dismiss feedback (FeedbackDismissDialog)

### 16.2 Agent Interest (`/admin/agent-interest`)
- [ ] Interest submissions list renders
- [ ] Filter by agent type works
- [ ] Status tracking (pending, contacted, etc.)

### 16.3 Free Trials (`/admin/free-trials`)
- [ ] Pending trial requests list renders
- [ ] Approve button works → user gets trial credits
- [ ] Reject button works
- [ ] Pending count badge in sidebar updates

### 16.4 Knowledge Base (`/admin/knowledge-base`)
- [ ] Knowledge articles/docs list renders
- [ ] Upload new knowledge documents works
- [ ] Search knowledge base works
- [ ] Export CSV works
- [ ] Classification of uploaded docs works

### 16.5 Retrieval Logs (`/admin/retrieval-logs`)
- [ ] RAG retrieval logs display
- [ ] Filter by date/agent works
- [ ] Log details show query, retrieved chunks, scores

### 16.6 SDLT Rates (`/admin/sdlt-rates`)
- [ ] Current rate bands display
- [ ] Can edit rate bands
- [ ] Changes reflect in public SDLT calculator

### 16.7 Referrals (`/admin/referrals`)
- [ ] Referral submissions list renders
- [ ] Status tracking works
- [ ] Referral invite sending works

### 16.8 Glossary Management (`/admin/glossary`)
- [ ] Terms list renders
- [ ] Can add new terms
- [ ] Can edit existing terms
- [ ] Can delete terms
- [ ] Changes reflect on public glossary page

### 16.9 CMS Integrations (`/admin/cms-integrations`)
- [ ] Integration list renders
- [ ] Can configure Hoowla integration
- [ ] API key management works
- [ ] Sync status displays

### 16.10 Approved Domains (`/admin/approved-domains`)
- [ ] Domain list renders
- [ ] Can add new domain with firm name
- [ ] Can remove domain
- [ ] Users with matching domains are auto-approved

### 16.11 AI Chat Logs (`/admin/ai-chat-logs`)
- [ ] Chat session logs render
- [ ] Can filter by user/agent/date
- [ ] Can view full conversation detail

### 16.12 Article Audio (`/admin/article-audio`)
- [ ] Article list with TTS status
- [ ] Can generate audio for articles
- [ ] Audio player works

### 16.13 Document Checklists (`/admin/document-checklists`)
- [ ] Checklist items render by agent type
- [ ] Can add/edit/remove checklist items
- [ ] Transaction type and tenure filters work
- [ ] Sort order is editable

### 16.14 AI Learning Engine / Benchmark Dashboard (`/admin/benchmark-dashboard`)
- [ ] Benchmark cases list renders
- [ ] Can create new benchmark case
- [ ] Benchmark comparison results display
- [ ] Precision/recall scores shown
- [ ] Judge calibration modal works
- [ ] Batch benchmark runs work
- [ ] Failure pattern analysis displays

### 16.15 Prompt Management (`/admin/prompt-management`)
- [ ] Prompt versions list renders
- [ ] Can create new prompt version
- [ ] Can edit prompts
- [ ] Prompt deployment verification works
- [ ] Prompt patch generation works

### 16.16 Synthetic Case Generator (`/admin/synthetic-generator`)
- [ ] Can generate synthetic test cases
- [ ] Generated cases appear in benchmark vault

### 16.17 Benchmark Vault (`/admin/benchmark-vault`)
- [ ] Benchmark cases stored with documents
- [ ] Can upload ground truth outputs
- [ ] Source type filter works

### 16.18 Stress Test (`/admin/stress-test`)
- [ ] Adversarial datasets load
- [ ] Can run stress tests against Olimey AI
- [ ] Scoring against ground truth displays

### 16.19 Self-Healing AI (`/admin/self-healing`)
- [ ] Correction review panel shows pending corrections
- [ ] Failure triage view categorises failures
- [ ] Can approve/reject corrections
- [ ] Clause pattern healing results display

### 16.20 Stability Manifest (`/admin/stability-manifest`)
- [ ] STABILITY_MANIFEST.json data renders
- [ ] Test suite results display
- [ ] Pass/fail indicators correct

### 16.21 Integrations (`/admin/integrations`)
- [ ] SRA/CLC firm number registration works
- [ ] DMS integration configuration works
- [ ] Integration status indicators correct

### 16.22 Compliance Dashboard (`/admin/compliance-dashboard`)
- [ ] Regulatory compliance metrics display
- [ ] Compliance report generation works

### 16.23 Retrospective Audit (`/admin/retrospective-audit`)
- [ ] Historical audit data renders
- [ ] Filter by date range works

### 16.24 Notifications (`/admin/notifications`)
- [ ] Notification settings render
- [ ] Can configure notification types
- [ ] Test notification delivery works

### 16.25 AI Help Guide (`/admin/ai-help-guide`)
- [ ] Help documentation renders
- [ ] Searchable

### 16.26 Benchmark Guide (`/admin/benchmark-guide`)
- [ ] Guide content renders
- [ ] Steps are clear and navigable

---

## 17. Settings & Account

### 17.1 Settings Page (`/settings`)
- [ ] Profile section: name, email, position display
- [ ] Can edit profile fields
- [ ] Save changes works
- [ ] Password change works (if applicable)

### 17.2 Audit Log (`/audit-log`)
- [ ] All events for current user display
- [ ] Filter by event type works
- [ ] Filter by date range works
- [ ] Export audit trail works
- [ ] Events include: login, AI runs, document uploads, case changes, admin actions

---

## 18. Tools & Calculators

### 18.1 SDLT Calculator (`/sdlt-calculator`)
- [ ] Input: purchase price
- [ ] Toggle: first-time buyer
- [ ] Toggle: additional property
- [ ] Correct calculation for each scenario:
  - [ ] Standard residential rates
  - [ ] First-time buyer relief
  - [ ] Additional property surcharge
  - [ ] Non-residential rates
- [ ] Breakdown table displays per-band amounts
- [ ] PDF export generates correct document

### 18.2 Profitability/Benefit Calculator (`/calculator`)
- [ ] Input: cases per month, average time savings
- [ ] Output: estimated savings and ROI
- [ ] PDF export works

---

## 19. Content Pages

### 19.1 Insights Articles
- [ ] Article list paginates
- [ ] Article content renders markdown/rich text
- [ ] Code blocks format correctly (if any)
- [ ] Images load
- [ ] Related articles shown

### 19.2 Article Features
- [ ] Audio player (ArticleAudioPlayer) plays TTS version
- [ ] Download button (ArticleDownloadButton) downloads article
- [ ] Clickable timestamps in audio (useClickableTimestamps)

---

## 20. Global UI Components

### 20.1 Network Status Indicator
- [ ] "Offline" banner appears when internet disconnected
- [ ] "Syncing..." indicator appears during active mutations
- [ ] "Saving..." indicator appears during data writes
- [ ] Banner dismisses when back online

### 20.2 Error Boundary
- [ ] Production mode: shows branded "Something went wrong" UI (no raw error/stack)
- [ ] Error details logged to console
- [ ] "Try again" button resets the boundary
- [ ] Compact mode (in tabs): shows inline error with "Retry" button

### 20.3 Cookie Consent Banner
- [ ] Appears on first visit
- [ ] Accept/reject buttons work
- [ ] Preference persisted

### 20.4 Support Chat Widget
- [ ] Widget appears (deferred loading after idle)
- [ ] Can open chat
- [ ] Can send messages
- [ ] Responses received

### 20.5 Toast Notifications
- [ ] Success toasts show (green)
- [ ] Error toasts show (red/destructive)
- [ ] Info toasts show
- [ ] Toasts auto-dismiss after timeout
- [ ] Multiple toasts stack

### 20.6 Notification Bell (NotificationBell)
- [ ] Bell icon shows unread count badge
- [ ] Clicking opens notification dropdown
- [ ] Notifications can be marked as read
- [ ] Real-time notifications work (if enabled)

### 20.7 Referral Widget
- [ ] Widget renders
- [ ] Can enter referral email
- [ ] Invite sends

### 20.8 Floating Case Files
- [ ] Panel shows when in case context
- [ ] Can quick-access case documents

### 20.9 Proactive Feed
- [ ] Renders in sidebar
- [ ] Shows relevant tips/alerts

---

## 21. Security & Access Control

### 21.1 Route Protection
- [ ] All `/dashboard/*` routes redirect to `/login` when unauthenticated
- [ ] All `/admin/*` routes redirect to `/dashboard` for non-admin roles
- [ ] All `/case/*` routes require authentication
- [ ] `/agent/:id` routes require authentication
- [ ] Public routes accessible without authentication

### 21.2 Role Hierarchy Enforcement
- [ ] Admin (rank 100) can access everything
- [ ] Support Admin (rank 75) can access admin pages but not manage roles or delete users
- [ ] Auditor (rank 50) has view-only admin access (no create/edit/delete)
- [ ] User (rank 10) cannot access any admin routes
- [ ] Role displayed correctly in user management UI

### 21.3 Ownership & Firm Isolation
- [ ] Users can only see their own firm's cases
- [ ] Users cannot access cases from other firms via URL manipulation
- [ ] Case duplication validates ownership before pre-filling
- [ ] TitleShield results are accessible to firm colleagues

### 21.4 Session Management
- [ ] Session persists on page refresh
- [ ] Session expires appropriately
- [ ] Role re-validation on tab focus (using requestIdleCallback)
- [ ] Cross-tab role cache invalidation works (localStorage storage event)
- [ ] Signing out clears all cached data (localStorage, sessionStorage)

### 21.5 CAPTCHA
- [ ] Turnstile renders on Login page
- [ ] Turnstile renders on Signup page
- [ ] Cannot submit forms without completing CAPTCHA
- [ ] CAPTCHA token expires and requires re-verification

### 21.6 Inactive User Block
- [ ] Inactive users see "Account pending approval" screen
- [ ] Cannot navigate to any protected route
- [ ] Contact support email link works

---

## 22. Network Resilience & Error Handling

### 22.1 Exponential Backoff (React Query)
- [ ] Failed API requests retry up to 3 times
- [ ] Retry delays follow exponential pattern: ~1s, ~2s, ~4s (capped at 30s)
- [ ] 401/403 errors do NOT trigger retries
- [ ] Verify via Network tab (throttle to offline, observe retry attempts)

### 22.2 Auto-Save (Form State Persistence)
- [ ] DraftDocReview form state saves to sessionStorage on every change
- [ ] ExchangeGuard form state saves to sessionStorage on every change
- [ ] Olimey AI intake wizard saves per-step
- [ ] Refreshing page restores form state

### 22.3 Adaptive Debounce
- [ ] On fast connection: saves at base delay (~500ms)
- [ ] On slow connection (simulate via DevTools > Network > Slow 3G): saves at increased delay
- [ ] On Save-Data header: delay increases to 2000ms

### 22.4 Sync State (useSyncState)
- [ ] State persists to localStorage
- [ ] Skips write if value is identical to current (I/O optimization)
- [ ] Cross-tab sync works via storage events

### 22.5 Offline Recovery
- [ ] Going offline → "Offline" banner appears
- [ ] Queued mutations execute when back online
- [ ] No data loss during offline period

---

## 23. Performance & Responsiveness

### 23.1 Page Load Performance
- [ ] Landing page loads in < 3 seconds
- [ ] Dashboard loads in < 2 seconds (after auth)
- [ ] Case workspace loads in < 2 seconds
- [ ] No visible layout shifts (CLS < 0.1)

### 23.2 Code Splitting
- [ ] Each route loads its own chunk (verify in Network tab)
- [ ] Hovering over case cards prefetches workspace chunk
- [ ] SupportChatWidget loads deferred (after idle)

### 23.3 Memoization
- [ ] Dashboard doesn't re-render excessively (verify with React DevTools Profiler)
- [ ] RingChart, RecentActivityTimeline wrapped in React.memo
- [ ] NetworkStatus wrapped in React.memo

### 23.4 Mobile Responsiveness
- [ ] All pages render correctly on mobile (375px width)
- [ ] Sidebar collapses to hamburger menu on mobile
- [ ] Forms are usable on mobile
- [ ] Tables scroll horizontally on small screens
- [ ] Touch targets are at least 44px

---

## 24. Accessibility

- [ ] All form inputs have associated labels
- [ ] Focus management: Tab navigation works through all interactive elements
- [ ] Color contrast meets WCAG AA standards
- [ ] Screen reader: key actions are announced
- [ ] Modals/dialogs trap focus
- [ ] Escape key closes dialogs
- [ ] Error messages are associated with form fields
- [ ] Alt text on all meaningful images
- [ ] Skip navigation link (if applicable)

---

## 25. Cross-Browser & Device Testing

### 25.1 Desktop Browsers
| Browser | Login | Dashboard | Case Workspace | Admin | SDLT Calc |
|---------|-------|-----------|---------------|-------|-----------|
| Chrome | [ ] | [ ] | [ ] | [ ] | [ ] |
| Safari | [ ] | [ ] | [ ] | [ ] | [ ] |
| Firefox | [ ] | [ ] | [ ] | [ ] | [ ] |
| Edge | [ ] | [ ] | [ ] | [ ] | [ ] |

### 25.2 Mobile Devices
| Device | Login | Dashboard | Case Workspace | Upload |
|--------|-------|-----------|---------------|--------|
| iPhone 15 (Safari) | [ ] | [ ] | [ ] | [ ] |
| iPhone SE (Safari) | [ ] | [ ] | [ ] | [ ] |
| Pixel 8 (Chrome) | [ ] | [ ] | [ ] | [ ] |
| iPad (Safari) | [ ] | [ ] | [ ] | [ ] |

### 25.3 Viewport Breakpoints
- [ ] 375px (mobile)
- [ ] 768px (tablet)
- [ ] 1024px (small desktop)
- [ ] 1440px (large desktop)
- [ ] 1920px (full HD)

---

## Appendix A: Edge Functions Inventory

These backend functions power the platform. Verify they respond correctly via the features that use them:

| Function | Triggered By |
|----------|-------------|
| `admin-user-actions` | User management (admin) |
| `agent-chat` | Agent chat interface |
| `agent-query` | Agent queries |
| `ai-case-search` | AI-powered case search |
| `ai-review` | Triggering AI review on a case |
| `analyze-sow-intake` | Olimey AI intake analysis |
| `article-tts` | Article audio generation |
| `benchmark-compare` | Benchmark comparison runs |
| `benchmark-worker` | Batch benchmark processing |
| `classify-aml-docs` | AML document classification |
| `classify-draft-docs` | Draft review doc classification |
| `classify-exchange-docs` | Exchange guard doc classification |
| `classify-knowledge-docs` | Knowledge base doc classification |
| `create-checkout` | Stripe checkout session |
| `detect-title-defects` | Title defect detection |
| `draft-doc-review` | TitleShield™ review |
| `exchange-guard` | ExchangeGuard™ analysis |
| `extract-doc-summaries` | Document summary extraction |
| `generate-compliance-report` | Compliance report generation |
| `ingest-file-to-text` | File text extraction |
| `search-knowledge-base` | Knowledge base search |
| `send-referral-invite` | Referral email sending |
| `send-welcome-email` | Welcome email on signup |
| `stress-test-sow` | Olimey AI stress testing |
| `support-chat` | Support chat widget |
| `sync-hoowla` | Hoowla CMS sync |
| `verify-payment` | Payment verification |

---

## Appendix B: Database Tables (Key Tables)

For data integrity verification:

| Table | Purpose |
|-------|---------|
| `profiles` | User profile data |
| `user_roles` | Role assignments (admin, support_admin, auditor, user) |
| `cases` | Case records |
| `documents` | Uploaded documents |
| `ai_reports` | AI-generated reports |
| `audit_log` | Audit trail events |
| `credit_transactions` | Credit purchase/deduction history |
| `benchmark_cases` | Benchmark test cases |
| `agent_feedback` | User feedback on agent responses |
| `approved_domains` | Whitelisted email domains |
| `access_requests` | Access request submissions |
| `client_portal_tokens` | Client portal access tokens |

---

## Appendix C: Key Automated Test Suites

The platform has 319+ automated tests. Verify these pass before release:

```bash
npm run test:full          # All tests
npm run test:burn-in       # 150-iteration stability burn-in
```

Test categories:
- **Refresh & Resume** — State persistence after page refresh
- **Integrity Guard** — Optimistic locking / version conflicts
- **Fortress Auth** — Role-based access control enforcement
- **Chaos Network** — Slow 3G / session expiry resilience
- **Concurrency Sync** — Multi-tab / cross-device integrity
- **Memory & Performance** — Leak detection / large payload stress

---

*End of QA Test Plan*
