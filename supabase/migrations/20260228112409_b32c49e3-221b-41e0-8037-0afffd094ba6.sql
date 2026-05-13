
-- Rename columns on cases table
ALTER TABLE public.cases RENAME COLUMN fee_earner_id TO conveyancer_id;
ALTER TABLE public.cases RENAME COLUMN fee_earner_name TO conveyancer_name;
ALTER TABLE public.cases RENAME COLUMN fee_earner_email TO conveyancer_email;
