
-- Case collaborative notes table
CREATE TABLE public.case_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.case_notes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  user_name TEXT NOT NULL DEFAULT '',
  user_position TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  pinned BOOLEAN NOT NULL DEFAULT false,
  target_type TEXT DEFAULT NULL,
  target_id TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast case lookups
CREATE INDEX idx_case_notes_case_id ON public.case_notes(case_id);
CREATE INDEX idx_case_notes_parent_id ON public.case_notes(parent_id);

-- RLS
ALTER TABLE public.case_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_notes FORCE ROW LEVEL SECURITY;

-- Users can see notes on cases they own or are in the same firm
CREATE POLICY "Users can view case notes for their firm cases"
ON public.case_notes FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.cases c
    JOIN public.profiles p ON p.user_id = auth.uid()
    WHERE c.id = case_notes.case_id
    AND (c.conveyancer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.profiles owner_p
        WHERE owner_p.user_id = c.conveyancer_id AND owner_p.firm_name = p.firm_name AND p.firm_name != ''
      )
    )
  )
);

CREATE POLICY "Users can insert notes on their cases"
ON public.case_notes FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid() AND
  EXISTS (
    SELECT 1 FROM public.cases c
    JOIN public.profiles p ON p.user_id = auth.uid()
    WHERE c.id = case_notes.case_id
    AND (c.conveyancer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.profiles owner_p
        WHERE owner_p.user_id = c.conveyancer_id AND owner_p.firm_name = p.firm_name AND p.firm_name != ''
      )
    )
  )
);

CREATE POLICY "Users can update their own notes"
ON public.case_notes FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own notes"
ON public.case_notes FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- Enable realtime for collaborative editing
ALTER PUBLICATION supabase_realtime ADD TABLE public.case_notes;
