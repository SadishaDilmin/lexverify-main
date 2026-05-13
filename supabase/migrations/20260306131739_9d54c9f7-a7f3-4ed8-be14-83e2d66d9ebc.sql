CREATE POLICY "Require authentication for profiles"
ON public.profiles
AS RESTRICTIVE
FOR SELECT
USING (auth.uid() IS NOT NULL);