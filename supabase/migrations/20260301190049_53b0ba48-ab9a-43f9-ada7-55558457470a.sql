
-- Single-row config table for SDLT rates
CREATE TABLE public.sdlt_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  standard_thresholds jsonb NOT NULL DEFAULT '[
    [125000, 0],
    [250000, 0.02],
    [925000, 0.05],
    [1500000, 0.10],
    ["Infinity", 0.12]
  ]'::jsonb,
  ftb_thresholds jsonb NOT NULL DEFAULT '[
    [300000, 0],
    [625000, 0.05]
  ]'::jsonb,
  ftb_max_price numeric NOT NULL DEFAULT 625000,
  higher_rate_surcharge numeric NOT NULL DEFAULT 0.05,
  non_uk_resident_surcharge numeric NOT NULL DEFAULT 0.02,
  rates_label text NOT NULL DEFAULT '1 April 2025',
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.sdlt_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sdlt_rates FORCE ROW LEVEL SECURITY;

-- Authenticated users can read the rates
CREATE POLICY "Authenticated users can view SDLT rates"
  ON public.sdlt_rates FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Only admins can insert/update/delete
CREATE POLICY "Admins can manage SDLT rates"
  ON public.sdlt_rates FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Seed with default rates
INSERT INTO public.sdlt_rates (
  standard_thresholds,
  ftb_thresholds,
  ftb_max_price,
  higher_rate_surcharge,
  non_uk_resident_surcharge,
  rates_label
) VALUES (
  '[
    [125000, 0],
    [250000, 0.02],
    [925000, 0.05],
    [1500000, 0.10],
    [null, 0.12]
  ]'::jsonb,
  '[
    [300000, 0],
    [625000, 0.05]
  ]'::jsonb,
  625000,
  0.05,
  0.02,
  '1 April 2025'
);
