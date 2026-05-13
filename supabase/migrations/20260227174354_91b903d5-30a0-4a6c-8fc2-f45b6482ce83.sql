
-- Drop the blanket deny-update policy so users can edit their own reports
DROP POLICY "Deny update on ai_reports" ON public.ai_reports;

-- Allow users to update reports on their own cases
CREATE POLICY "Users can update reports for their cases"
  ON public.ai_reports
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM cases
      WHERE cases.id = ai_reports.case_id
        AND (cases.fee_earner_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
    )
  );
