
-- Allow case owners to delete their own cases
CREATE POLICY "Users can delete their own cases"
ON public.cases
FOR DELETE
USING (conveyancer_id = auth.uid());

-- Allow admins to delete any case
CREATE POLICY "Admins can delete all cases"
ON public.cases
FOR DELETE
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Update foreign keys to CASCADE on delete so related data is cleaned up
-- but audit_log uses case_reference (text) with no FK, so it's preserved

-- case_parties
ALTER TABLE public.case_parties DROP CONSTRAINT case_parties_case_id_fkey;
ALTER TABLE public.case_parties ADD CONSTRAINT case_parties_case_id_fkey
  FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE CASCADE;

-- documents
ALTER TABLE public.documents DROP CONSTRAINT documents_case_id_fkey;
ALTER TABLE public.documents ADD CONSTRAINT documents_case_id_fkey
  FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE CASCADE;

-- ai_reports
ALTER TABLE public.ai_reports DROP CONSTRAINT ai_reports_case_id_fkey;
ALTER TABLE public.ai_reports ADD CONSTRAINT ai_reports_case_id_fkey
  FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE CASCADE;

-- risk_scores
ALTER TABLE public.risk_scores DROP CONSTRAINT risk_scores_case_id_fkey;
ALTER TABLE public.risk_scores ADD CONSTRAINT risk_scores_case_id_fkey
  FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE CASCADE;

-- qa_results
ALTER TABLE public.qa_results DROP CONSTRAINT qa_results_case_id_fkey;
ALTER TABLE public.qa_results ADD CONSTRAINT qa_results_case_id_fkey
  FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE CASCADE;

-- agent_feedback
ALTER TABLE public.agent_feedback DROP CONSTRAINT agent_feedback_case_id_fkey;
ALTER TABLE public.agent_feedback ADD CONSTRAINT agent_feedback_case_id_fkey
  FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE CASCADE;

-- enquiry_items
ALTER TABLE public.enquiry_items DROP CONSTRAINT enquiry_items_case_id_fkey;
ALTER TABLE public.enquiry_items ADD CONSTRAINT enquiry_items_case_id_fkey
  FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE CASCADE;

-- enquiry_rounds
ALTER TABLE public.enquiry_rounds DROP CONSTRAINT enquiry_rounds_case_id_fkey;
ALTER TABLE public.enquiry_rounds ADD CONSTRAINT enquiry_rounds_case_id_fkey
  FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE CASCADE;

-- enquiry_overrides
ALTER TABLE public.enquiry_overrides DROP CONSTRAINT enquiry_overrides_case_id_fkey;
ALTER TABLE public.enquiry_overrides ADD CONSTRAINT enquiry_overrides_case_id_fkey
  FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE CASCADE;

-- enquiry_reply_documents
ALTER TABLE public.enquiry_reply_documents DROP CONSTRAINT enquiry_reply_documents_case_id_fkey;
ALTER TABLE public.enquiry_reply_documents ADD CONSTRAINT enquiry_reply_documents_case_id_fkey
  FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE CASCADE;

-- credit_transactions (nullable FK — SET NULL on delete)
ALTER TABLE public.credit_transactions DROP CONSTRAINT credit_transactions_case_id_fkey;
ALTER TABLE public.credit_transactions ADD CONSTRAINT credit_transactions_case_id_fkey
  FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE SET NULL;

-- draft_reviews (nullable case_id — SET NULL)
ALTER TABLE public.draft_reviews DROP CONSTRAINT draft_reviews_case_id_fkey;
ALTER TABLE public.draft_reviews ADD CONSTRAINT draft_reviews_case_id_fkey
  FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE SET NULL;

-- exchange_guard_reviews (nullable case_id — SET NULL)
ALTER TABLE public.exchange_guard_reviews DROP CONSTRAINT exchange_guard_reviews_case_id_fkey;
ALTER TABLE public.exchange_guard_reviews ADD CONSTRAINT exchange_guard_reviews_case_id_fkey
  FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE SET NULL;
