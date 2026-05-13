
-- Remove overly broad "Require auth for select" policies from cases, audit_log, and user_roles.
-- The specific ownership/admin policies already enforce proper access control.

-- 1. CASES: Drop the broad auth check; "Users can view their own cases" + "Admins can view all cases" already cover access.
DROP POLICY IF EXISTS "Require auth for select" ON public.cases;

-- 2. AUDIT_LOG: Drop the broad auth check; "Users can view audit logs for their cases" already restricts to own logs + admins.
DROP POLICY IF EXISTS "Require auth for select" ON public.audit_log;

-- 3. USER_ROLES: Drop the broad auth check; "Users can view their own roles" + "Admins can view all roles" already cover access.
DROP POLICY IF EXISTS "Require auth for select" ON public.user_roles;
