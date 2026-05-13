
-- Enum for triage priority
CREATE TYPE public.triage_priority AS ENUM ('low', 'med', 'high');

-- DMS Integrations
CREATE TABLE public.dms_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL CHECK (provider IN ('iManage', 'NetDocuments', 'SharePoint')),
  webhook_secret TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.dms_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage dms_integrations"
  ON public.dms_integrations FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Proactive Triage Rules
CREATE TABLE public.proactive_triage_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  priority triage_priority NOT NULL DEFAULT 'med',
  label TEXT NOT NULL DEFAULT '',
  dms_integration_id UUID REFERENCES public.dms_integrations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.proactive_triage_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage triage_rules"
  ON public.proactive_triage_rules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Proactive Notifications
CREATE TABLE public.proactive_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  notification_type TEXT NOT NULL DEFAULT 'insight',
  severity TEXT NOT NULL DEFAULT 'info',
  case_reference TEXT,
  agent_id TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.proactive_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own notifications"
  ON public.proactive_notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins insert notifications"
  ON public.proactive_notifications FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users update own notifications"
  ON public.proactive_notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
