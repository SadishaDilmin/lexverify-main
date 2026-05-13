-- Prevent non-super_admins from assigning super_admin role via RLS
-- Drop and recreate the manage policy with a refined WITH CHECK
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;

CREATE POLICY "Admins can manage roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  AND (
    -- If setting role to super_admin, caller must themselves be super_admin
    role != 'super_admin'::app_role
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'::app_role
    )
  )
);