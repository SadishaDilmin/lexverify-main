
-- Fix error-level security findings: exposed user data and personal information

-- 1. PROFILES: Drop the overly broad "Require auth for select" policy.
--    "Users can view their own profile" + "Admins can view all profiles" already handle access.
DROP POLICY IF EXISTS "Require auth for select" ON public.profiles;

-- 2. FORCE ROW LEVEL SECURITY on all 4 tables storing personal data.
--    This ensures RLS applies even to the table owner / service role, 
--    preventing any bypass of access controls.
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.access_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE public.agent_feedback FORCE ROW LEVEL SECURITY;
ALTER TABLE public.agent_interest FORCE ROW LEVEL SECURITY;
