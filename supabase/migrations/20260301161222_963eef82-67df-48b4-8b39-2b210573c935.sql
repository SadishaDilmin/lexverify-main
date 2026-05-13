-- Fix linter WARN: overly permissive INSERT policy on retrieval_logs
DROP POLICY IF EXISTS "System can insert retrieval logs" ON public.retrieval_logs;
CREATE POLICY "Admins can insert retrieval logs"
ON public.retrieval_logs
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Fix linter WARN: extension installed in public schema
-- Move vector extension into a dedicated schema and ensure runtime roles can resolve it.
CREATE SCHEMA IF NOT EXISTS extensions;
ALTER EXTENSION vector SET SCHEMA extensions;

GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;

-- Ensure common roles include extensions in search_path (so casts/operators resolve)
ALTER ROLE anon SET search_path = public, extensions;
ALTER ROLE authenticated SET search_path = public, extensions;
ALTER ROLE service_role SET search_path = public, extensions;
