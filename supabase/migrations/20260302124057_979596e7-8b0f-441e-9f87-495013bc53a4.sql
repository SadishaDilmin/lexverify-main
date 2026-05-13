
-- Glossary terms table
CREATE TABLE public.glossary_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term text NOT NULL,
  slug text NOT NULL UNIQUE,
  letter char(1) NOT NULL,
  definition text NOT NULL DEFAULT '',
  why_it_matters text NOT NULL DEFAULT '',
  legislation text,
  applies text NOT NULL DEFAULT 'both' CHECK (applies IN ('leasehold', 'freehold', 'both')),
  related_term_slugs text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'published', 'archived')),
  version integer NOT NULL DEFAULT 1,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  submitted_for_review_at timestamptz,
  submitted_for_review_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  review_notes text
);

-- Version history table (full audit trail)
CREATE TABLE public.glossary_term_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term_id uuid NOT NULL REFERENCES public.glossary_terms(id) ON DELETE CASCADE,
  version integer NOT NULL,
  term text NOT NULL,
  slug text NOT NULL,
  letter char(1) NOT NULL,
  definition text NOT NULL DEFAULT '',
  why_it_matters text NOT NULL DEFAULT '',
  legislation text,
  applies text NOT NULL DEFAULT 'both',
  related_term_slugs text[] NOT NULL DEFAULT '{}',
  status text NOT NULL,
  change_summary text,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_glossary_terms_slug ON public.glossary_terms(slug);
CREATE INDEX idx_glossary_terms_status ON public.glossary_terms(status);
CREATE INDEX idx_glossary_terms_letter ON public.glossary_terms(letter);
CREATE INDEX idx_glossary_term_versions_term_id ON public.glossary_term_versions(term_id);

-- Updated_at trigger
CREATE TRIGGER glossary_terms_updated_at
  BEFORE UPDATE ON public.glossary_terms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.glossary_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.glossary_term_versions ENABLE ROW LEVEL SECURITY;

-- Public can read published terms
CREATE POLICY "Anyone can view published glossary terms"
  ON public.glossary_terms FOR SELECT
  USING (status = 'published');

-- Admins can do everything on glossary_terms
CREATE POLICY "Admins can manage all glossary terms"
  ON public.glossary_terms FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Admins can manage versions
CREATE POLICY "Admins can manage glossary versions"
  ON public.glossary_term_versions FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Authenticated users can view versions of published terms
CREATE POLICY "Users can view versions of published terms"
  ON public.glossary_term_versions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.glossary_terms
      WHERE glossary_terms.id = glossary_term_versions.term_id
      AND glossary_terms.status = 'published'
    )
  );
