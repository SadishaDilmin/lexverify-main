
-- Document version tracking
CREATE TABLE public.document_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL DEFAULT 1,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  uploaded_by UUID NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  change_summary TEXT DEFAULT NULL,
  previous_version_id UUID REFERENCES public.document_versions(id)
);

CREATE INDEX idx_document_versions_doc ON public.document_versions(document_id);
ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_versions FORCE ROW LEVEL SECURITY;

CREATE POLICY "Users can view versions for their cases"
ON public.document_versions FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.cases c WHERE c.id = document_versions.case_id
  AND (c.conveyancer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
));

CREATE POLICY "Users can insert versions for their cases"
ON public.document_versions FOR INSERT TO authenticated
WITH CHECK (uploaded_by = auth.uid() AND EXISTS (
  SELECT 1 FROM public.cases c WHERE c.id = document_versions.case_id
  AND (c.conveyancer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
));

-- Client portal access tokens
CREATE TABLE public.client_portal_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  client_name TEXT NOT NULL,
  client_email TEXT DEFAULT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_accessed_at TIMESTAMPTZ DEFAULT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX idx_portal_tokens_token ON public.client_portal_tokens(token);
CREATE INDEX idx_portal_tokens_case ON public.client_portal_tokens(case_id);
ALTER TABLE public.client_portal_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_portal_tokens FORCE ROW LEVEL SECURITY;

CREATE POLICY "Conveyancers can manage portal tokens for their cases"
ON public.client_portal_tokens FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.cases c WHERE c.id = client_portal_tokens.case_id
  AND (c.conveyancer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
));

-- Follow-up reminders
CREATE TABLE public.follow_up_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  enquiry_item_id UUID REFERENCES public.enquiry_items(id) ON DELETE CASCADE,
  reminder_type TEXT NOT NULL DEFAULT 'enquiry_followup',
  threshold_days INTEGER NOT NULL DEFAULT 7,
  next_reminder_at TIMESTAMPTZ NOT NULL,
  last_sent_at TIMESTAMPTZ DEFAULT NULL,
  send_count INTEGER NOT NULL DEFAULT 0,
  max_sends INTEGER NOT NULL DEFAULT 3,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_followup_reminders_case ON public.follow_up_reminders(case_id);
ALTER TABLE public.follow_up_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follow_up_reminders FORCE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage reminders for their cases"
ON public.follow_up_reminders FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.cases c WHERE c.id = follow_up_reminders.case_id
  AND (c.conveyancer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
));

-- Lender rules configuration
CREATE TABLE public.lender_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lender_name TEXT NOT NULL,
  rule_type TEXT NOT NULL,
  rule_key TEXT NOT NULL,
  rule_value TEXT NOT NULL,
  description TEXT DEFAULT NULL,
  severity TEXT NOT NULL DEFAULT 'warning',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (lender_name, rule_type, rule_key)
);

ALTER TABLE public.lender_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lender_rules FORCE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view lender rules"
ON public.lender_rules FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Admins can manage lender rules"
ON public.lender_rules FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));
