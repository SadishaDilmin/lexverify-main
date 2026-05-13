
-- Table to store synced email/correspondence from Hoowla
CREATE TABLE public.case_correspondence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  hoowla_message_id TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  from_name TEXT,
  from_email TEXT,
  to_recipients JSONB DEFAULT '[]'::jsonb,
  cc_recipients JSONB DEFAULT '[]'::jsonb,
  bcc_recipients JSONB DEFAULT '[]'::jsonb,
  attachments JSONB DEFAULT '[]'::jsonb,
  html_content TEXT,
  sent_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  synced_by UUID,
  UNIQUE(case_id, hoowla_message_id)
);

-- Enable RLS
ALTER TABLE public.case_correspondence ENABLE ROW LEVEL SECURITY;

-- Users can view correspondence on cases they own
CREATE POLICY "Users can view own case correspondence"
  ON public.case_correspondence
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.cases
      WHERE cases.id = case_correspondence.case_id
        AND (cases.conveyancer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
    )
  );

-- Users can insert correspondence for their own cases
CREATE POLICY "Users can insert own case correspondence"
  ON public.case_correspondence
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.cases
      WHERE cases.id = case_correspondence.case_id
        AND (cases.conveyancer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
    )
  );

-- Index for fast lookups
CREATE INDEX idx_case_correspondence_case_id ON public.case_correspondence(case_id);
CREATE INDEX idx_case_correspondence_sent_at ON public.case_correspondence(sent_at DESC);
