ALTER TABLE public.case_parties
  ADD COLUMN raise_enquiry_funding boolean NOT NULL DEFAULT false,
  ADD COLUMN raise_enquiry_employment boolean NOT NULL DEFAULT false;