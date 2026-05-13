
-- Remove the overly broad PERMISSIVE auth policies.
-- The existing ownership/admin PERMISSIVE policies already:
-- 1. Deny unauthenticated access (no matching policy = no access)
-- 2. Restrict rows to owners/admins only
DROP POLICY IF EXISTS "Require authentication for select" ON public.profiles;
DROP POLICY IF EXISTS "Require authentication for select" ON public.cases;
DROP POLICY IF EXISTS "Require authentication for select" ON public.audit_log;
DROP POLICY IF EXISTS "Require authentication for select" ON public.user_roles;
DROP POLICY IF EXISTS "Require authentication for select" ON public.ai_reports;
DROP POLICY IF EXISTS "Require authentication for select" ON public.documents;
DROP POLICY IF EXISTS "Require authentication for select" ON public.qa_results;
DROP POLICY IF EXISTS "Require authentication for select" ON public.risk_scores;
DROP POLICY IF EXISTS "Require authentication for select" ON public.agent_feedback;
DROP POLICY IF EXISTS "Require authentication for select" ON public.enhancement_backlog;
DROP POLICY IF EXISTS "Require authentication for select" ON public.feedback_settings;
DROP POLICY IF EXISTS "Require authentication for select" ON public.access_requests;
DROP POLICY IF EXISTS "Require authentication for select" ON public.agent_interest;
