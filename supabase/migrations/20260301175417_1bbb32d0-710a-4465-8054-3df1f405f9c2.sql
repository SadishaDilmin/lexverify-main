
-- Enquiry Rounds: tracks each round of analysis per case per agent
CREATE TABLE public.enquiry_rounds (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES public.cases(id),
  agent_type TEXT NOT NULL CHECK (agent_type IN ('search', 'title', 'sow')),
  round_number INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'satisfied', 'overridden')),
  internal_report TEXT,
  draft_email TEXT,
  outstanding_summary TEXT,
  ai_run_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL,
  UNIQUE (case_id, agent_type, round_number)
);

-- Enquiry Tracker: individual enquiry items within a round
CREATE TABLE public.enquiry_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES public.cases(id),
  round_id UUID NOT NULL REFERENCES public.enquiry_rounds(id) ON DELETE CASCADE,
  agent_type TEXT NOT NULL CHECK (agent_type IN ('search', 'title', 'sow')),
  enquiry_number TEXT NOT NULL,
  category TEXT NOT NULL,
  issue_summary TEXT NOT NULL,
  original_enquiry_text TEXT NOT NULL,
  evidence_required TEXT,
  reply_summary TEXT,
  evidence_received TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'partially_satisfied', 'satisfied', 'escalate', 'not_applicable')),
  next_action TEXT CHECK (next_action IN ('raise_further', 'no_further_action', 'report_to_client')),
  who_replied TEXT,
  date_raised TIMESTAMPTZ NOT NULL DEFAULT now(),
  date_last_updated TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Reply documents uploaded against a case/agent
CREATE TABLE public.enquiry_reply_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES public.cases(id),
  agent_type TEXT NOT NULL CHECK (agent_type IN ('search', 'title', 'sow')),
  round_number INTEGER NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  doc_classification TEXT,
  matched_enquiry_ids UUID[] DEFAULT '{}',
  uploaded_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Override log for finalisation overrides
CREATE TABLE public.enquiry_overrides (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES public.cases(id),
  agent_type TEXT NOT NULL CHECK (agent_type IN ('search', 'title', 'sow')),
  open_enquiry_ids UUID[] NOT NULL DEFAULT '{}',
  reason TEXT NOT NULL,
  user_id UUID NOT NULL,
  user_name TEXT NOT NULL,
  user_email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS on enquiry_rounds
ALTER TABLE public.enquiry_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enquiry_rounds FORCE ROW LEVEL SECURITY;

CREATE POLICY "Users can view rounds for their cases" ON public.enquiry_rounds
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.cases WHERE cases.id = enquiry_rounds.case_id AND (cases.conveyancer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role)))
  );

CREATE POLICY "Users can insert rounds for their cases" ON public.enquiry_rounds
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.cases WHERE cases.id = enquiry_rounds.case_id AND (cases.conveyancer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role)))
  );

CREATE POLICY "Users can update rounds for their cases" ON public.enquiry_rounds
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.cases WHERE cases.id = enquiry_rounds.case_id AND (cases.conveyancer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role)))
  );

-- RLS on enquiry_items
ALTER TABLE public.enquiry_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enquiry_items FORCE ROW LEVEL SECURITY;

CREATE POLICY "Users can view items for their cases" ON public.enquiry_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.cases WHERE cases.id = enquiry_items.case_id AND (cases.conveyancer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role)))
  );

CREATE POLICY "Users can insert items for their cases" ON public.enquiry_items
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.cases WHERE cases.id = enquiry_items.case_id AND (cases.conveyancer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role)))
  );

CREATE POLICY "Users can update items for their cases" ON public.enquiry_items
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.cases WHERE cases.id = enquiry_items.case_id AND (cases.conveyancer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role)))
  );

-- RLS on enquiry_reply_documents
ALTER TABLE public.enquiry_reply_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enquiry_reply_documents FORCE ROW LEVEL SECURITY;

CREATE POLICY "Users can view reply docs for their cases" ON public.enquiry_reply_documents
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.cases WHERE cases.id = enquiry_reply_documents.case_id AND (cases.conveyancer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role)))
  );

CREATE POLICY "Users can insert reply docs for their cases" ON public.enquiry_reply_documents
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.cases WHERE cases.id = enquiry_reply_documents.case_id AND (cases.conveyancer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role)))
  );

CREATE POLICY "Users can delete reply docs for their cases" ON public.enquiry_reply_documents
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.cases WHERE cases.id = enquiry_reply_documents.case_id AND (cases.conveyancer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role)))
  );

-- RLS on enquiry_overrides
ALTER TABLE public.enquiry_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enquiry_overrides FORCE ROW LEVEL SECURITY;

CREATE POLICY "Users can view overrides for their cases" ON public.enquiry_overrides
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.cases WHERE cases.id = enquiry_overrides.case_id AND (cases.conveyancer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role)))
  );

CREATE POLICY "Users can insert overrides for their cases" ON public.enquiry_overrides
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.cases WHERE cases.id = enquiry_overrides.case_id AND (cases.conveyancer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role)))
  );

-- Deny delete on overrides (audit trail)
CREATE POLICY "Deny delete on enquiry_overrides" ON public.enquiry_overrides
  FOR DELETE USING (false);

CREATE POLICY "Deny update on enquiry_overrides" ON public.enquiry_overrides
  FOR UPDATE USING (false);

-- Storage bucket for reply documents
INSERT INTO storage.buckets (id, name, public) VALUES ('enquiry-replies', 'enquiry-replies', false);

-- Storage RLS for enquiry-replies bucket
CREATE POLICY "Users can upload enquiry replies" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'enquiry-replies' AND public.owns_case_document(name)
  );

CREATE POLICY "Users can view enquiry replies" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'enquiry-replies' AND public.owns_case_document(name)
  );

CREATE POLICY "Users can delete enquiry replies" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'enquiry-replies' AND public.owns_case_document(name)
  );
