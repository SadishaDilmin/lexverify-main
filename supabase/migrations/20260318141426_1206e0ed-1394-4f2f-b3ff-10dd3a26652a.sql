
-- Drop the recursive policy
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;

-- Recreate using only the security-definer function (no direct table self-reference)
CREATE POLICY "Admins can manage roles"
  ON public.user_roles
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    AND (
      role <> 'super_admin'::app_role
      OR public.has_role(auth.uid(), 'super_admin'::app_role)
    )
  );
