-- Add case_id to draft_reviews to link draft reviews to cases
ALTER TABLE public.draft_reviews 
ADD COLUMN case_id uuid REFERENCES public.cases(id);

-- Create index for performance
CREATE INDEX idx_draft_reviews_case_id ON public.draft_reviews(case_id);