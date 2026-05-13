
-- ============================================================
-- Phase 1: AI Learning & Evaluation Engine - Foundation Schema
-- ============================================================

-- 1. benchmark_cases
CREATE TABLE public.benchmark_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  property_address text NOT NULL DEFAULT '',
  transaction_type text NOT NULL DEFAULT 'Purchase',
  case_type text NOT NULL DEFAULT 'freehold_purchase',
  agent_type text NOT NULL DEFAULT 'source-of-wealth',
  notes text,
  status text NOT NULL DEFAULT 'draft',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.benchmark_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage benchmark cases"
  ON public.benchmark_cases FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_benchmark_cases_updated_at
  BEFORE UPDATE ON public.benchmark_cases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. benchmark_documents
CREATE TABLE public.benchmark_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  benchmark_case_id uuid NOT NULL REFERENCES public.benchmark_cases(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_path text NOT NULL,
  doc_type text NOT NULL DEFAULT 'other',
  file_size bigint NOT NULL DEFAULT 0,
  uploaded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.benchmark_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage benchmark documents"
  ON public.benchmark_documents FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3. benchmark_outputs
CREATE TABLE public.benchmark_outputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  benchmark_case_id uuid NOT NULL REFERENCES public.benchmark_cases(id) ON DELETE CASCADE,
  output_type text NOT NULL DEFAULT 'human',
  label text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  file_name text,
  file_path text,
  uploaded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.benchmark_outputs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage benchmark outputs"
  ON public.benchmark_outputs FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 4. prompt_versions
CREATE TABLE public.prompt_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  prompt_text text NOT NULL DEFAULT '',
  change_reason text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft',
  created_by uuid NOT NULL,
  approved_by uuid,
  approved_at timestamptz,
  deployed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.prompt_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage prompt versions"
  ON public.prompt_versions FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 5. Storage bucket for benchmark files
INSERT INTO storage.buckets (id, name, public)
VALUES ('benchmark-documents', 'benchmark-documents', false);

-- Storage RLS: admin-only access
CREATE POLICY "Admins can manage benchmark storage"
  ON storage.objects FOR ALL
  USING (bucket_id = 'benchmark-documents' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'benchmark-documents' AND public.has_role(auth.uid(), 'admin'));
