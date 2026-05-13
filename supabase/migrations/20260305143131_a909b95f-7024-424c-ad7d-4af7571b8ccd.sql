
-- Create document_checklists table
CREATE TABLE public.document_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_name text NOT NULL,
  doc_slot_id text NOT NULL,
  agent_type text NOT NULL DEFAULT 'all',
  transaction_type text NOT NULL DEFAULT 'all',
  tenure text NOT NULL DEFAULT 'all',
  required boolean NOT NULL DEFAULT true,
  reason text DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid
);

-- Enable RLS
ALTER TABLE public.document_checklists ENABLE ROW LEVEL SECURITY;

-- Admin full CRUD
CREATE POLICY "Admins can manage document checklists"
  ON public.document_checklists
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Authenticated users can SELECT
CREATE POLICY "Authenticated users can view document checklists"
  ON public.document_checklists
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- updated_at trigger
CREATE TRIGGER update_document_checklists_updated_at
  BEFORE UPDATE ON public.document_checklists
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Seed data: Draft Review (CORE_SLOTS)
INSERT INTO public.document_checklists (doc_name, doc_slot_id, agent_type, transaction_type, tenure, required, reason, sort_order) VALUES
  ('Memorandum of Sale', 'memorandum_of_sale', 'draft_review', 'all', 'all', false, 'Provides context on agreed terms', 1),
  ('Draft Contract', 'draft_contract', 'draft_review', 'all', 'all', true, 'Core contract terms must be reviewed', 2),
  ('TR1 (or TP1)', 'tr1', 'draft_review', 'all', 'all', true, 'Required for completion', 3),
  ('Title Register (Official Copy)', 'title_register', 'draft_review', 'all', 'all', true, 'Essential for title review', 4),
  ('Title Plan', 'title_plan', 'draft_review', 'all', 'all', true, 'Required for boundary and extent verification', 5),
  ('Lease', 'lease', 'draft_review', 'all', 'Leasehold', true, 'Leasehold terms review', 6),
  ('Superior Lease', 'superior_lease', 'draft_review', 'all', 'Leasehold', false, 'Superior lease terms where relevant', 7),
  ('Superior Lease Plan', 'superior_lease_plan', 'draft_review', 'all', 'Leasehold', false, 'Superior lease plan where relevant', 8),
  ('Lease Plan', 'lease_plan', 'draft_review', 'all', 'Leasehold', false, 'Lease plan for extent verification', 9),
  ('TA6 Property Information Form', 'ta6', 'draft_review', 'all', 'all', true, 'Standard seller disclosure', 10),
  ('TA10 Fixtures and Fittings', 'ta10', 'draft_review', 'all', 'all', true, 'Contractual inclusion/exclusion list', 11),
  ('TA7 Leasehold Information Form', 'ta7', 'draft_review', 'all', 'Leasehold', true, 'Leasehold-specific disclosures', 12),
  ('Commonhold Community Statement (CCS)', 'commonhold_community_statement', 'draft_review', 'all', 'Commonhold', true, 'Commonhold governance document', 13),
  ('Commonhold Assessment Certificate', 'commonhold_assessment_certificate', 'draft_review', 'all', 'Commonhold', true, 'Commonhold financial assessment', 14),
  ('TA7 Commonhold Information Form', 'ta7_commonhold', 'draft_review', 'all', 'Commonhold', true, 'Commonhold-specific disclosures', 15),
  ('Commonhold Association Memorandum & Articles', 'commonhold_association_memorandum', 'draft_review', 'all', 'Commonhold', false, 'Commonhold association governance', 16);

-- Seed data: Exchange Guard
INSERT INTO public.document_checklists (doc_name, doc_slot_id, agent_type, transaction_type, tenure, required, reason, sort_order) VALUES
  ('Official Copy Entries (Title Register)', 'official_copy_entries', 'exchange_guard', 'all', 'all', true, 'Essential for title review', 1),
  ('Title Plan', 'eg_title_plan', 'exchange_guard', 'all', 'all', true, 'Required for boundary and extent verification', 2),
  ('Draft Contract', 'eg_draft_contract', 'exchange_guard', 'all', 'all', true, 'Core contract terms must be reviewed', 3),
  ('Transfer (TR1/TP1)', 'eg_transfer', 'exchange_guard', 'all', 'all', true, 'Required for completion', 4),
  ('TA6 Property Information Form', 'eg_ta6', 'exchange_guard', 'all', 'all', true, 'Standard seller disclosure', 5),
  ('TA10 Fixtures and Fittings', 'eg_ta10', 'exchange_guard', 'all', 'all', true, 'Contractual inclusion/exclusion list', 6),
  ('Local Authority Search', 'eg_local_authority_search', 'exchange_guard', 'all', 'all', true, 'Planning and highway review', 7),
  ('Environmental Search', 'eg_environmental_search', 'exchange_guard', 'all', 'all', true, 'Environmental risk assessment', 8),
  ('Drainage & Water Search', 'eg_drainage_water_search', 'exchange_guard', 'all', 'all', true, 'Water and sewer connection check', 9),
  ('Enquiries Raised', 'eg_enquiries_raised', 'exchange_guard', 'all', 'all', true, 'Outstanding enquiry review', 10),
  ('Replies to Enquiries', 'eg_replies_to_enquiries', 'exchange_guard', 'all', 'all', true, 'Reply completeness check', 11),
  ('Lease', 'eg_lease', 'exchange_guard', 'all', 'Leasehold', true, 'Leasehold terms review', 12),
  ('Management Pack / LPE1', 'eg_management_pack', 'exchange_guard', 'all', 'Leasehold', true, 'Service charge and management review', 13),
  ('TA7 Leasehold Information Form', 'eg_ta7', 'exchange_guard', 'all', 'Leasehold', true, 'Leasehold-specific disclosures', 14),
  ('Planning Permission', 'eg_planning_permission', 'exchange_guard', 'all', 'New Build', true, 'Development compliance check', 15),
  ('Building Regulations Approval', 'eg_building_regs', 'exchange_guard', 'all', 'New Build', true, 'Building safety compliance', 16),
  ('NHBC/Warranty Certificate', 'eg_nhbc_warranty', 'exchange_guard', 'all', 'New Build', true, 'New build structural warranty', 17),
  ('Mortgage Offer', 'eg_mortgage_offer', 'exchange_guard', 'purchase', 'all', false, 'Lender conditions review (when lender involved)', 18),
  ('Lender Special Conditions', 'eg_lender_conditions', 'exchange_guard', 'purchase', 'all', false, 'Additional lender requirements', 19);

-- Seed data: Search Review (DocumentUpload)
INSERT INTO public.document_checklists (doc_name, doc_slot_id, agent_type, transaction_type, tenure, required, reason, sort_order) VALUES
  ('Local Authority Search', 'local_authority', 'search_review', 'all', 'all', true, 'Planning and highway review', 1),
  ('Drainage & Water Search', 'drainage_water', 'search_review', 'all', 'all', true, 'Water and sewer connection check', 2),
  ('Environmental Search', 'environmental', 'search_review', 'all', 'all', true, 'Environmental risk assessment', 3),
  ('EPC', 'epc', 'search_review', 'all', 'all', true, 'Energy performance certificate', 4);
