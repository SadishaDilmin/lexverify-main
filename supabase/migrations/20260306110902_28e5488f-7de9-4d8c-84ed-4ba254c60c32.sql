
-- =============================================
-- Synthetic Case Generator: 3 tables + seed data
-- =============================================

-- 1. Scenario Library
CREATE TABLE public.synthetic_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  scenario_type text NOT NULL UNIQUE,
  description text NOT NULL DEFAULT '',
  associated_doc_types text[] NOT NULL DEFAULT '{}',
  expected_risks jsonb NOT NULL DEFAULT '[]',
  difficulty text NOT NULL DEFAULT 'intermediate',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.synthetic_scenarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage synthetic scenarios"
  ON public.synthetic_scenarios FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated users can view synthetic scenarios"
  ON public.synthetic_scenarios FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- 2. Generation Jobs
CREATE TABLE public.synthetic_generation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending',
  total_cases integer NOT NULL DEFAULT 0,
  completed_cases integer NOT NULL DEFAULT 0,
  failed_cases integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  error_log text
);

ALTER TABLE public.synthetic_generation_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage synthetic generation jobs"
  ON public.synthetic_generation_jobs FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 3. Generated Cases (links to benchmark_cases)
CREATE TABLE public.synthetic_generated_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.synthetic_generation_jobs(id) ON DELETE CASCADE,
  benchmark_case_id uuid NOT NULL REFERENCES public.benchmark_cases(id) ON DELETE CASCADE,
  scenarios_used text[] NOT NULL DEFAULT '{}',
  gold_standard jsonb NOT NULL DEFAULT '[]',
  generation_metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.synthetic_generated_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage synthetic generated cases"
  ON public.synthetic_generated_cases FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- =============================================
-- Seed ~35 scenarios
-- =============================================
INSERT INTO public.synthetic_scenarios (category, scenario_type, description, associated_doc_types, expected_risks, difficulty) VALUES
-- Title Issues (7)
('title_issues', 'restriction_certificate_compliance', 'Title register contains a restriction requiring a certificate of compliance from a management company before any disposition can be registered.', ARRAY['title'], '[{"issue_type":"Title restriction requiring certificate","severity":"High","evidence_source":"Title Register C section","correct_action":"Ensure certificate of compliance obtained prior to completion"}]'::jsonb, 'basic'),
('title_issues', 'missing_easement', 'Title register omits an easement for access or drainage that the property relies upon for practical use.', ARRAY['title'], '[{"issue_type":"Missing easement","severity":"High","evidence_source":"Title Register A section","correct_action":"Raise requisition regarding the missing easement and consider indemnity insurance"}]'::jsonb, 'intermediate'),
('title_issues', 'flying_freehold', 'Part of the freehold property extends over or under a neighbouring property, creating a flying freehold element.', ARRAY['title','contracts'], '[{"issue_type":"Flying freehold","severity":"Medium","evidence_source":"Title Plan / Title Register","correct_action":"Check lender requirements, consider indemnity insurance, review mutual covenants"}]'::jsonb, 'advanced'),
('title_issues', 'estate_rentcharge', 'Title register contains an estate rentcharge payable to a management company with enforcement powers including right of entry.', ARRAY['title'], '[{"issue_type":"Estate rentcharge","severity":"Medium","evidence_source":"Title Register C section","correct_action":"Verify rentcharge amount, review enforcement provisions, ensure buyer is aware"}]'::jsonb, 'intermediate'),
('title_issues', 'unregistered_land', 'Property comprises unregistered land requiring first registration upon transfer.', ARRAY['title','contracts'], '[{"issue_type":"Unregistered land","severity":"High","evidence_source":"Epitome of Title","correct_action":"Verify root of title, check for adverse interests, ensure first registration triggered"}]'::jsonb, 'advanced'),
('title_issues', 'adverse_possession_claim', 'Evidence suggests potential adverse possession claim affecting part of the registered title.', ARRAY['title'], '[{"issue_type":"Adverse possession risk","severity":"High","evidence_source":"Title Register / Survey","correct_action":"Investigate boundary discrepancy, consider statutory declaration, raise with seller"}]'::jsonb, 'advanced'),
('title_issues', 'title_plan_discrepancy', 'The title plan does not accurately reflect the physical boundaries of the property as observed on site.', ARRAY['title'], '[{"issue_type":"Title plan discrepancy","severity":"Medium","evidence_source":"Title Plan vs Site Plan","correct_action":"Raise requisition with seller, consider boundary agreement or indemnity insurance"}]'::jsonb, 'intermediate'),

-- Leasehold Risks (8)
('leasehold_risks', 'short_lease', 'Lease has fewer than 80 years unexpired, triggering marriage value and potential mortgage valuation issues.', ARRAY['title','contracts'], '[{"issue_type":"Short lease under 80 years","severity":"High","evidence_source":"Lease / Title Register","correct_action":"Advise on lease extension costs, check lender minimum term requirements"}]'::jsonb, 'basic'),
('leasehold_risks', 'escalating_ground_rent', 'Ground rent increases periodically by fixed amounts or percentages, potentially exceeding £250 per annum.', ARRAY['contracts'], '[{"issue_type":"Escalating ground rent","severity":"High","evidence_source":"Lease ground rent clause","correct_action":"Check if ground rent could exceed AST threshold, assess Leasehold Reform Act 2022 implications"}]'::jsonb, 'basic'),
('leasehold_risks', 'doubling_ground_rent', 'Ground rent doubles at fixed intervals, creating an exponentially increasing financial obligation.', ARRAY['contracts'], '[{"issue_type":"Doubling ground rent","severity":"Critical","evidence_source":"Lease ground rent clause","correct_action":"Flag as potentially onerous, check LGRA 2022 cap provisions, advise buyer of long-term cost"}]'::jsonb, 'intermediate'),
('leasehold_risks', 'onerous_service_charge', 'Service charge provisions allow uncapped expenditure without adequate consultation or challenge mechanisms.', ARRAY['contracts'], '[{"issue_type":"Onerous service charge provisions","severity":"Medium","evidence_source":"Lease service charge clause","correct_action":"Review service charge accounts, check consultation requirements, advise buyer"}]'::jsonb, 'intermediate'),
('leasehold_risks', 'landlord_consent_assignment', 'Lease requires landlord consent for assignment, which may be unreasonably withheld or subject to conditions.', ARRAY['contracts'], '[{"issue_type":"Landlord consent required for assignment","severity":"Medium","evidence_source":"Lease alienation clause","correct_action":"Apply for landlord consent, review conditions, check if consent can be unreasonably withheld"}]'::jsonb, 'basic'),
('leasehold_risks', 'absolute_alienation_restriction', 'Lease contains an absolute prohibition on assignment, subletting or parting with possession.', ARRAY['contracts'], '[{"issue_type":"Absolute alienation restriction","severity":"Critical","evidence_source":"Lease alienation clause","correct_action":"Flag as potential deal-breaker, check if variation possible, advise buyer of implications"}]'::jsonb, 'advanced'),
('leasehold_risks', 'defective_repairing_covenant', 'Lease repairing obligations are ambiguous or impose unreasonable burden on the leaseholder.', ARRAY['contracts'], '[{"issue_type":"Defective repairing covenant","severity":"Medium","evidence_source":"Lease repairing clause","correct_action":"Review extent of repair obligations, check dilapidations risk, advise buyer"}]'::jsonb, 'intermediate'),
('leasehold_risks', 'missing_landlord_insurance', 'Lease does not require the landlord to insure the building or provide evidence of insurance to leaseholders.', ARRAY['contracts'], '[{"issue_type":"Missing landlord insurance obligation","severity":"High","evidence_source":"Lease insurance clause","correct_action":"Raise enquiry with landlord, consider additional buyer insurance, flag to lender"}]'::jsonb, 'intermediate'),

-- Building Safety (4)
('building_safety', 'bsa_compliance_missing', 'No evidence of Building Safety Act 2022 compliance for a building over 18 metres or 7 storeys.', ARRAY['contracts','searches'], '[{"issue_type":"Building Safety Act compliance missing","severity":"Critical","evidence_source":"Management pack / Building safety certificate","correct_action":"Request BSA documentation, check if building is in scope, advise buyer of ongoing obligations"}]'::jsonb, 'advanced'),
('building_safety', 'no_ews1_certificate', 'No EWS1 form available for a building that requires external wall fire safety assessment.', ARRAY['contracts'], '[{"issue_type":"No EWS1 certificate","severity":"High","evidence_source":"Management pack","correct_action":"Request EWS1 form, check lender requirements, advise buyer on potential remediation costs"}]'::jsonb, 'intermediate'),
('building_safety', 'cladding_risk', 'Building has ACM or other combustible cladding that has not been remediated.', ARRAY['contracts','searches'], '[{"issue_type":"Cladding remediation required","severity":"Critical","evidence_source":"EWS1 form / Fire safety report","correct_action":"Check Building Safety Fund eligibility, assess leaseholder liability, advise on delay risk"}]'::jsonb, 'advanced'),
('building_safety', 'missing_fire_safety_docs', 'Fire risk assessment and fire safety documentation for the building are missing or outdated.', ARRAY['contracts'], '[{"issue_type":"Missing fire safety documentation","severity":"High","evidence_source":"Management pack","correct_action":"Request current fire risk assessment, check compliance with Regulatory Reform Order 2005"}]'::jsonb, 'intermediate'),

-- Seller Fraud (6)
('seller_fraud', 'vacant_property_fraud', 'Property is vacant and seller claims to be the registered proprietor but there are inconsistencies in identity verification.', ARRAY['title','aml_sow'], '[{"issue_type":"Vacant property fraud risk","severity":"Critical","evidence_source":"Title Register / ID verification","correct_action":"Enhanced identity verification, consider VOA confirmation, check for recent title changes"}]'::jsonb, 'advanced'),
('seller_fraud', 'mortgage_free_fraud', 'Property is mortgage-free which increases fraud risk as there is no lender to act as additional safeguard.', ARRAY['title'], '[{"issue_type":"Mortgage-free property fraud risk","severity":"High","evidence_source":"Title Register C section","correct_action":"Enhanced due diligence on seller identity, consider additional verification steps"}]'::jsonb, 'intermediate'),
('seller_fraud', 'overseas_seller_fraud', 'Seller is based overseas and unable to attend in person for identity verification.', ARRAY['title','aml_sow'], '[{"issue_type":"Overseas seller fraud risk","severity":"High","evidence_source":"ID verification documents","correct_action":"Require certified copy ID, consider video verification, check power of attorney validity"}]'::jsonb, 'intermediate'),
('seller_fraud', 'recently_issued_id', 'Seller identity documents were issued very recently, which is a known fraud indicator.', ARRAY['aml_sow'], '[{"issue_type":"Recently issued identity documents","severity":"High","evidence_source":"ID verification","correct_action":"Request additional identity evidence, check document authenticity, consider enhanced CDD"}]'::jsonb, 'basic'),
('seller_fraud', 'no_address_connection', 'Seller cannot demonstrate any connection between their identity and the property address.', ARRAY['aml_sow','title'], '[{"issue_type":"No connection between ID and property","severity":"Critical","evidence_source":"ID and utility bills","correct_action":"Request evidence of connection to property, consider fraud risk, report if suspicious"}]'::jsonb, 'advanced'),
('seller_fraud', 'urgent_sale_request', 'Seller is requesting unusually rapid completion with pressure to exchange quickly.', ARRAY['contracts'], '[{"issue_type":"Urgent sale pressure","severity":"Medium","evidence_source":"Correspondence / Instructions","correct_action":"Investigate reason for urgency, do not rush due diligence, consider fraud risk"}]'::jsonb, 'basic'),

-- Source of Wealth (5)
('source_of_wealth', 'unexplained_large_transfer', 'Large unexplained transfer into the client account with no clear source documentation.', ARRAY['aml_sow'], '[{"issue_type":"Unexplained large transfer","severity":"Critical","evidence_source":"Bank statements / Source of funds","correct_action":"Request full source of funds documentation, file SAR if explanation inadequate"}]'::jsonb, 'basic'),
('source_of_wealth', 'crypto_source', 'Client states purchase funds originate from cryptocurrency trading or holdings.', ARRAY['aml_sow'], '[{"issue_type":"Cryptocurrency source of funds","severity":"High","evidence_source":"Source of funds declaration","correct_action":"Request exchange records, wallet history, and conversion documentation"}]'::jsonb, 'intermediate'),
('source_of_wealth', 'multiple_third_party_contributions', 'Purchase funds comprise multiple contributions from third parties with unclear relationships.', ARRAY['aml_sow'], '[{"issue_type":"Multiple third-party fund contributions","severity":"High","evidence_source":"Bank statements / Gift declarations","correct_action":"CDD on all contributors, obtain gift declarations, verify relationship to buyer"}]'::jsonb, 'intermediate'),
('source_of_wealth', 'inconsistent_income_price', 'Client declared income is significantly lower than the purchase price with no other declared wealth.', ARRAY['aml_sow'], '[{"issue_type":"Income inconsistent with purchase price","severity":"High","evidence_source":"Income evidence vs purchase price","correct_action":"Request additional source of wealth evidence, consider enhanced due diligence"}]'::jsonb, 'basic'),
('source_of_wealth', 'high_risk_jurisdiction_funds', 'Funds originate from or pass through jurisdictions on the FATF high-risk list.', ARRAY['aml_sow'], '[{"issue_type":"Funds from high-risk jurisdiction","severity":"Critical","evidence_source":"Bank statements / Wire transfer records","correct_action":"Enhanced due diligence, source of funds trail, consider SAR filing, check sanctions list"}]'::jsonb, 'advanced');
