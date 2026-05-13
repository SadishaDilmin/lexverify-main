-- Cases table
CREATE TABLE public.cases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_reference TEXT NOT NULL UNIQUE,
  property_address TEXT NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('Purchase', 'Sale')),
  tenure TEXT NOT NULL CHECK (tenure IN ('Freehold', 'Leasehold', 'Unknown')),
  property_type TEXT NOT NULL CHECK (property_type IN ('House', 'Flat', 'Maisonette', 'Other', 'Unknown')),
  fee_earner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fee_earner_name TEXT NOT NULL,
  fee_earner_email TEXT NOT NULL,
  seller_conveyancer_email TEXT,
  lender TEXT,
  hoowla_matter_id TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'documents_pending', 'review_ready', 'review_complete', 'closed')),
  risk_level TEXT CHECK (risk_level IN ('green', 'amber', 'red')),
  risk_score INTEGER CHECK (risk_score >= 0 AND risk_score <= 100),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own cases"
  ON public.cases FOR SELECT TO authenticated
  USING (fee_earner_id = auth.uid());

CREATE POLICY "Admins can view all cases"
  ON public.cases FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can create cases"
  ON public.cases FOR INSERT TO authenticated
  WITH CHECK (fee_earner_id = auth.uid());

CREATE POLICY "Users can update their own cases"
  ON public.cases FOR UPDATE TO authenticated
  USING (fee_earner_id = auth.uid());

CREATE POLICY "Admins can update all cases"
  ON public.cases FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_cases_updated_at
  BEFORE UPDATE ON public.cases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Documents table
CREATE TABLE public.documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL CHECK (doc_type IN ('local_authority', 'drainage_water', 'environmental', 'epc')),
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id),
  appears_complete BOOLEAN NOT NULL DEFAULT false,
  completeness_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (case_id, doc_type)
);

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view docs for their cases"
  ON public.documents FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.cases WHERE cases.id = documents.case_id AND (cases.fee_earner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))));

CREATE POLICY "Users can upload docs to their cases"
  ON public.documents FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.cases WHERE cases.id = documents.case_id AND (cases.fee_earner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))));

CREATE POLICY "Users can update docs on their cases"
  ON public.documents FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.cases WHERE cases.id = documents.case_id AND (cases.fee_earner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))));

CREATE POLICY "Users can delete docs on their cases"
  ON public.documents FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.cases WHERE cases.id = documents.case_id AND (cases.fee_earner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))));

-- Risk scores table
CREATE TABLE public.risk_scores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  ai_run_id TEXT NOT NULL,
  local_search_score INTEGER NOT NULL DEFAULT 0 CHECK (local_search_score >= 0 AND local_search_score <= 25),
  drainage_water_score INTEGER NOT NULL DEFAULT 0 CHECK (drainage_water_score >= 0 AND drainage_water_score <= 25),
  environmental_score INTEGER NOT NULL DEFAULT 0 CHECK (environmental_score >= 0 AND environmental_score <= 35),
  epc_score INTEGER NOT NULL DEFAULT 0 CHECK (epc_score >= 0 AND epc_score <= 15),
  total_score INTEGER NOT NULL DEFAULT 0 CHECK (total_score >= 0 AND total_score <= 100),
  risk_level TEXT NOT NULL CHECK (risk_level IN ('green', 'amber', 'red')),
  top_drivers JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.risk_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view risk scores for their cases"
  ON public.risk_scores FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.cases WHERE cases.id = risk_scores.case_id AND (cases.fee_earner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))));

CREATE POLICY "System can insert risk scores"
  ON public.risk_scores FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.cases WHERE cases.id = risk_scores.case_id AND (cases.fee_earner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))));

-- AI reports table
CREATE TABLE public.ai_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  ai_run_id TEXT NOT NULL,
  internal_report TEXT,
  draft_email TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view reports for their cases"
  ON public.ai_reports FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.cases WHERE cases.id = ai_reports.case_id AND (cases.fee_earner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))));

CREATE POLICY "System can insert reports"
  ON public.ai_reports FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.cases WHERE cases.id = ai_reports.case_id AND (cases.fee_earner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))));

-- QA checklist results table
CREATE TABLE public.qa_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  ai_run_id TEXT NOT NULL,
  checklist JSONB NOT NULL DEFAULT '{}',
  pass BOOLEAN NOT NULL DEFAULT false,
  warn BOOLEAN NOT NULL DEFAULT false,
  reviewed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.qa_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view QA results for their cases"
  ON public.qa_results FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.cases WHERE cases.id = qa_results.case_id AND (cases.fee_earner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))));

CREATE POLICY "Users can insert QA results for their cases"
  ON public.qa_results FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.cases WHERE cases.id = qa_results.case_id AND (cases.fee_earner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))));

-- Audit log table
CREATE TABLE public.audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_reference TEXT,
  user_id UUID REFERENCES auth.users(id),
  user_name TEXT NOT NULL,
  user_email TEXT NOT NULL,
  user_position TEXT NOT NULL DEFAULT '',
  event_type TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view audit logs for their cases"
  ON public.audit_log FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can insert audit logs"
  ON public.audit_log FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Storage bucket for case documents
INSERT INTO storage.buckets (id, name, public) VALUES ('case-documents', 'case-documents', false);

CREATE POLICY "Users can upload to their case folder"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'case-documents');

CREATE POLICY "Users can view their case documents"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'case-documents');

CREATE POLICY "Users can delete their case documents"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'case-documents');