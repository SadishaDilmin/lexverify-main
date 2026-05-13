
-- =====================================================================
-- Armalytix Structured Data Model — Full Schema Migration
-- 11 new tables + additive columns on cases & case_parties
-- =====================================================================

-- ── A1. Amend cases ──────────────────────────────────────────────────
ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS jurisdiction text DEFAULT 'England & Wales',
  ADD COLUMN IF NOT EXISTS use_class text,
  ADD COLUMN IF NOT EXISTS ownership_structure_notes text,
  ADD COLUMN IF NOT EXISTS mortgage_required boolean,
  ADD COLUMN IF NOT EXISTS mortgage_amount numeric,
  ADD COLUMN IF NOT EXISTS mortgage_offer_in_place boolean,
  ADD COLUMN IF NOT EXISTS mortgage_offer_explanation text,
  ADD COLUMN IF NOT EXISTS first_time_buyer boolean,
  ADD COLUMN IF NOT EXISTS gifts_involved boolean,
  ADD COLUMN IF NOT EXISTS developer_incentives boolean,
  ADD COLUMN IF NOT EXISTS prior_deposit_paid boolean,
  ADD COLUMN IF NOT EXISTS prior_deposit_amount numeric,
  ADD COLUMN IF NOT EXISTS amount_to_prove numeric,
  ADD COLUMN IF NOT EXISTS total_balance_available numeric,
  ADD COLUMN IF NOT EXISTS excess_shortfall numeric,
  ADD COLUMN IF NOT EXISTS current_residential_status text;

-- ── A2. Amend case_parties ───────────────────────────────────────────
ALTER TABLE public.case_parties
  ADD COLUMN IF NOT EXISTS contribution_amount numeric,
  ADD COLUMN IF NOT EXISTS contact_permission boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS on_mortgage boolean,
  ADD COLUMN IF NOT EXISTS outside_uk boolean,
  ADD COLUMN IF NOT EXISTS buyer_relationship text;

-- ── B. armalytix_reports ─────────────────────────────────────────────
CREATE TABLE public.armalytix_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  report_file_name text,
  report_file_path text,
  report_date date,
  ingested_at timestamptz,
  ingested_by uuid,
  parser_version text,
  raw_json jsonb,
  mortgage_amount numeric,
  mortgage_lender text,
  mortgage_type text,
  mortgage_term text,
  mortgage_offer_in_place boolean,
  first_time_buyer boolean,
  gifts_declared boolean,
  developer_incentives boolean,
  prior_deposit_paid boolean,
  prior_deposit_amount numeric,
  amount_to_prove numeric,
  total_balance_available numeric,
  excess_shortfall numeric,
  stamp_duty_expected numeric,
  current_residential_status text,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.armalytix_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner or admin can select armalytix_reports"
  ON public.armalytix_reports FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id AND c.conveyancer_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Owner can insert armalytix_reports"
  ON public.armalytix_reports FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id AND c.conveyancer_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Owner can update armalytix_reports"
  ON public.armalytix_reports FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id AND c.conveyancer_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Owner can delete armalytix_reports"
  ON public.armalytix_reports FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id AND c.conveyancer_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE TRIGGER set_armalytix_reports_updated_at
  BEFORE UPDATE ON public.armalytix_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── C. sow_connected_accounts ────────────────────────────────────────
CREATE TABLE public.sow_connected_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  armalytix_report_id uuid NOT NULL REFERENCES public.armalytix_reports(id) ON DELETE CASCADE,
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  party_id uuid REFERENCES public.case_parties(id) ON DELETE SET NULL,
  bank_name text,
  sort_code text,
  masked_account_number text,
  account_holder_name text,
  account_currency text NOT NULL DEFAULT 'GBP',
  account_type text,
  current_balance numeric,
  date_range_start date,
  date_range_end date,
  avg_monthly_paid_in numeric,
  avg_monthly_paid_out numeric,
  avg_balance numeric,
  avg_incoming_tx_size numeric,
  avg_outgoing_tx_size numeric,
  avg_monthly_tx_count integer,
  source_origin text NOT NULL DEFAULT 'open_banking',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sow_connected_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner or admin can manage sow_connected_accounts"
  ON public.sow_connected_accounts FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id AND c.conveyancer_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id AND c.conveyancer_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE TRIGGER set_sow_connected_accounts_updated_at
  BEFORE UPDATE ON public.sow_connected_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── D. sow_manual_balances ───────────────────────────────────────────
CREATE TABLE public.sow_manual_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  armalytix_report_id uuid NOT NULL REFERENCES public.armalytix_reports(id) ON DELETE CASCADE,
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  party_id uuid REFERENCES public.case_parties(id) ON DELETE SET NULL,
  description text,
  amount numeric,
  currency text NOT NULL DEFAULT 'GBP',
  notes text,
  attachment_name text,
  evidence_type text,
  evidence_status text NOT NULL DEFAULT 'declared',
  linked_fund_source_id uuid,
  counted_toward_proof boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sow_manual_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner or admin can manage sow_manual_balances"
  ON public.sow_manual_balances FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id AND c.conveyancer_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id AND c.conveyancer_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE TRIGGER set_sow_manual_balances_updated_at
  BEFORE UPDATE ON public.sow_manual_balances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── E. sow_fund_sources ──────────────────────────────────────────────
CREATE TABLE public.sow_fund_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  armalytix_report_id uuid NOT NULL REFERENCES public.armalytix_reports(id) ON DELETE CASCADE,
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  party_id uuid REFERENCES public.case_parties(id) ON DELETE SET NULL,
  source_category text,
  source_sub_category text,
  declared_description text,
  declared_amount numeric,
  date_received date,
  years_to_accumulate numeric,
  employer_name text,
  annual_gross_salary numeric,
  bonuses_declared boolean DEFAULT false,
  income_explains_savings boolean,
  outside_uk boolean DEFAULT false,
  supporting_doc_uploaded boolean DEFAULT false,
  supporting_doc_name text,
  linked_account_ids uuid[] DEFAULT '{}',
  verification_status text NOT NULL DEFAULT 'declared',
  source_origin text NOT NULL DEFAULT 'client_declaration',
  reviewer_notes text,
  ai_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sow_fund_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner or admin can manage sow_fund_sources"
  ON public.sow_fund_sources FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id AND c.conveyancer_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id AND c.conveyancer_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE TRIGGER set_sow_fund_sources_updated_at
  BEFORE UPDATE ON public.sow_fund_sources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Now add the FK from sow_manual_balances → sow_fund_sources
ALTER TABLE public.sow_manual_balances
  ADD CONSTRAINT sow_manual_balances_linked_fund_source_id_fkey
  FOREIGN KEY (linked_fund_source_id) REFERENCES public.sow_fund_sources(id) ON DELETE SET NULL;

-- ── F. sow_income_verification ───────────────────────────────────────
CREATE TABLE public.sow_income_verification (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  armalytix_report_id uuid NOT NULL REFERENCES public.armalytix_reports(id) ON DELETE CASCADE,
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  party_id uuid REFERENCES public.case_parties(id) ON DELETE SET NULL,
  fund_source_id uuid REFERENCES public.sow_fund_sources(id) ON DELETE SET NULL,
  payslip_uploaded boolean DEFAULT false,
  payslip_file_name text,
  net_pay_on_payslip numeric,
  payslip_name_match boolean,
  payslip_date date,
  payslip_within_3_months boolean,
  salary_matched_to_bank boolean,
  matched_employer_name text,
  salary_tx_count integer,
  min_salary_credit numeric,
  max_salary_credit numeric,
  avg_salary_credit numeric,
  variability_pct numeric,
  source_origin text NOT NULL DEFAULT 'ai_inference',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sow_income_verification ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner or admin can manage sow_income_verification"
  ON public.sow_income_verification FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id AND c.conveyancer_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id AND c.conveyancer_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE TRIGGER set_sow_income_verification_updated_at
  BEFORE UPDATE ON public.sow_income_verification
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── G+H. sow_transactions ───────────────────────────────────────────
CREATE TABLE public.sow_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  armalytix_report_id uuid NOT NULL REFERENCES public.armalytix_reports(id) ON DELETE CASCADE,
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.sow_connected_accounts(id) ON DELETE CASCADE,
  direction text NOT NULL DEFAULT 'incoming',
  tx_date date,
  description text,
  amount numeric,
  armalytix_category text,
  tx_type text,
  is_repeating boolean DEFAULT false,
  is_large boolean DEFAULT false,
  is_cash_or_cash_like boolean DEFAULT false,
  is_gambling_related boolean DEFAULT false,
  is_investment_related boolean DEFAULT false,
  is_inter_account_transfer boolean DEFAULT false,
  linked_fund_source_id uuid REFERENCES public.sow_fund_sources(id) ON DELETE SET NULL,
  linked_party_id uuid REFERENCES public.case_parties(id) ON DELETE SET NULL,
  likely_explanation text,
  explanation_status text NOT NULL DEFAULT 'unresolved',
  enquiry_required boolean DEFAULT false,
  enquiry_reason text,
  reviewer_outcome text,
  source_origin text NOT NULL DEFAULT 'bank_transaction',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sow_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner or admin can manage sow_transactions"
  ON public.sow_transactions FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id AND c.conveyancer_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id AND c.conveyancer_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE TRIGGER set_sow_transactions_updated_at
  BEFORE UPDATE ON public.sow_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── I. sow_evidence_items ────────────────────────────────────────────
CREATE TABLE public.sow_evidence_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  armalytix_report_id uuid REFERENCES public.armalytix_reports(id) ON DELETE SET NULL,
  ref_table text NOT NULL,
  ref_id uuid NOT NULL,
  ref_field text,
  source_origin text NOT NULL DEFAULT 'client_declaration',
  confidence_level text NOT NULL DEFAULT 'medium',
  verification_status text NOT NULL DEFAULT 'unverified',
  contradiction_flag boolean NOT NULL DEFAULT false,
  missing_evidence_flag boolean NOT NULL DEFAULT false,
  evidence_detail text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sow_evidence_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner or admin can manage sow_evidence_items"
  ON public.sow_evidence_items FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id AND c.conveyancer_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id AND c.conveyancer_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE TRIGGER set_sow_evidence_items_updated_at
  BEFORE UPDATE ON public.sow_evidence_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── J. sow_risk_flags ────────────────────────────────────────────────
CREATE TABLE public.sow_risk_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  armalytix_report_id uuid REFERENCES public.armalytix_reports(id) ON DELETE SET NULL,
  flag_type text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  ref_table text,
  ref_id uuid,
  rationale text,
  auto_generated boolean NOT NULL DEFAULT true,
  reviewer_confirmed boolean NOT NULL DEFAULT false,
  resolved boolean NOT NULL DEFAULT false,
  resolution_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sow_risk_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner or admin can manage sow_risk_flags"
  ON public.sow_risk_flags FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id AND c.conveyancer_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id AND c.conveyancer_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE TRIGGER set_sow_risk_flags_updated_at
  BEFORE UPDATE ON public.sow_risk_flags
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── K. sow_draft_enquiries ───────────────────────────────────────────
CREATE TABLE public.sow_draft_enquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  armalytix_report_id uuid REFERENCES public.armalytix_reports(id) ON DELETE SET NULL,
  enquiry_type text NOT NULL DEFAULT 'source_of_funds',
  enquiry_text text,
  ref_table text,
  ref_id uuid,
  linked_flag_id uuid REFERENCES public.sow_risk_flags(id) ON DELETE SET NULL,
  priority text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'draft',
  reviewer_edited boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sow_draft_enquiries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner or admin can manage sow_draft_enquiries"
  ON public.sow_draft_enquiries FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id AND c.conveyancer_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id AND c.conveyancer_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE TRIGGER set_sow_draft_enquiries_updated_at
  BEFORE UPDATE ON public.sow_draft_enquiries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── Indexes for common query patterns ────────────────────────────────
CREATE INDEX idx_armalytix_reports_case_id ON public.armalytix_reports(case_id);
CREATE INDEX idx_sow_connected_accounts_case_id ON public.sow_connected_accounts(case_id);
CREATE INDEX idx_sow_connected_accounts_report_id ON public.sow_connected_accounts(armalytix_report_id);
CREATE INDEX idx_sow_manual_balances_case_id ON public.sow_manual_balances(case_id);
CREATE INDEX idx_sow_fund_sources_case_id ON public.sow_fund_sources(case_id);
CREATE INDEX idx_sow_fund_sources_report_id ON public.sow_fund_sources(armalytix_report_id);
CREATE INDEX idx_sow_income_verification_case_id ON public.sow_income_verification(case_id);
CREATE INDEX idx_sow_transactions_case_id ON public.sow_transactions(case_id);
CREATE INDEX idx_sow_transactions_account_id ON public.sow_transactions(account_id);
CREATE INDEX idx_sow_transactions_direction ON public.sow_transactions(direction);
CREATE INDEX idx_sow_evidence_items_case_id ON public.sow_evidence_items(case_id);
CREATE INDEX idx_sow_evidence_items_ref ON public.sow_evidence_items(ref_table, ref_id);
CREATE INDEX idx_sow_risk_flags_case_id ON public.sow_risk_flags(case_id);
CREATE INDEX idx_sow_risk_flags_ref ON public.sow_risk_flags(ref_table, ref_id);
CREATE INDEX idx_sow_draft_enquiries_case_id ON public.sow_draft_enquiries(case_id);
