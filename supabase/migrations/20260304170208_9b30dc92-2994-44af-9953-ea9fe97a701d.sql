ALTER TABLE public.documents DROP CONSTRAINT documents_doc_type_check;

ALTER TABLE public.documents ADD CONSTRAINT documents_doc_type_check CHECK (
  doc_type = ANY (ARRAY[
    'local_authority'::text, 'drainage_water'::text, 'environmental'::text, 'epc'::text,
    'searches'::text, 'title'::text, 'contracts'::text, 'correspondence'::text,
    'aml_sow'::text, 'reports'::text, 'miscellaneous'::text,
    'management_pack'::text, 'licence_to_alter'::text
  ])
);