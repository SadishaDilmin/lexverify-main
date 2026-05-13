
-- 1. Create user_status enum
CREATE TYPE public.user_status AS ENUM ('active', 'inactive', 'suspended', 'locked', 'pending_invite');

-- 2. Add new columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS status public.user_status NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz,
  ADD COLUMN IF NOT EXISTS failed_login_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_reason text,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS department text;

-- 3. Backfill status from existing active boolean
UPDATE public.profiles SET status = 'active' WHERE active = true;
UPDATE public.profiles SET status = 'inactive' WHERE active = false;

-- 4. Create user_invitations table
CREATE TABLE public.user_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  role public.app_role NOT NULL DEFAULT 'user',
  invited_by uuid NOT NULL,
  token uuid NOT NULL DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  cancelled_at timestamptz,
  CONSTRAINT unique_pending_invite UNIQUE (email, status)
);

-- Index for quick lookups
CREATE INDEX idx_user_invitations_email ON public.user_invitations(email);
CREATE INDEX idx_user_invitations_token ON public.user_invitations(token);

-- 5. Create user_status_history table (immutable audit trail)
CREATE TABLE public.user_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  old_status public.user_status,
  new_status public.user_status NOT NULL,
  changed_by uuid NOT NULL,
  reason text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_status_history_user ON public.user_status_history(user_id);
CREATE INDEX idx_user_status_history_created ON public.user_status_history(created_at DESC);

-- 6. Add indexes on profiles for new columns
CREATE INDEX idx_profiles_status ON public.profiles(status);
CREATE INDEX idx_profiles_deleted_at ON public.profiles(deleted_at);

-- 7. Expand app_role enum with new values
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'support_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'auditor';

-- 8. RLS on user_invitations
ALTER TABLE public.user_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage invitations"
  ON public.user_invitations
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 9. RLS on user_status_history (insert-only for admins, select for admins)
ALTER TABLE public.user_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view status history"
  ON public.user_status_history
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert status history"
  ON public.user_status_history
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
