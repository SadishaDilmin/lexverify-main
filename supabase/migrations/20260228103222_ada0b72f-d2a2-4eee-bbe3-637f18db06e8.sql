
-- Replace overly permissive INSERT policy on access_requests with field validation
DROP POLICY IF EXISTS "Anyone can submit access requests" ON public.access_requests;

CREATE POLICY "Anyone can submit access requests with validation"
  ON public.access_requests FOR INSERT
  WITH CHECK (
    full_name <> '' 
    AND email <> '' 
    AND position <> ''
    AND length(full_name) <= 200
    AND length(email) <= 255
    AND length(position) <= 200
    AND length(COALESCE(reason, '')) <= 2000
    AND length(COALESCE(team, '')) <= 200
    AND status = 'pending'
  );

-- Replace overly permissive INSERT policy on agent_interest with field validation
DROP POLICY IF EXISTS "Anyone can submit agent interest" ON public.agent_interest;

CREATE POLICY "Anyone can submit agent interest with validation"
  ON public.agent_interest FOR INSERT
  WITH CHECK (
    full_name <> ''
    AND email <> ''
    AND agent_type <> ''
    AND length(full_name) <= 200
    AND length(email) <= 255
    AND length(agent_type) <= 100
    AND length(COALESCE(firm_name, '')) <= 200
    AND length(COALESCE(message, '')) <= 2000
    AND status = 'new'
  );
