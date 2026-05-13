
-- ============================================================
-- 1. Drop remaining overly broad "Require auth for select" policies
--    These tables already have specific ownership/admin policies.
-- ============================================================
DROP POLICY IF EXISTS "Require auth for select" ON public.ai_reports;
DROP POLICY IF EXISTS "Require auth for select" ON public.documents;
DROP POLICY IF EXISTS "Require auth for select" ON public.qa_results;
DROP POLICY IF EXISTS "Require auth for select" ON public.risk_scores;

-- ============================================================
-- 2. Force RLS on remaining sensitive tables to prevent bypasses
-- ============================================================
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.cases FORCE ROW LEVEL SECURITY;
ALTER TABLE public.agent_feedback FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ai_reports FORCE ROW LEVEL SECURITY;
ALTER TABLE public.documents FORCE ROW LEVEL SECURITY;
ALTER TABLE public.qa_results FORCE ROW LEVEL SECURITY;
ALTER TABLE public.risk_scores FORCE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log FORCE ROW LEVEL SECURITY;
