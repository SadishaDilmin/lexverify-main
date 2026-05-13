-- Add a JSONB column to store AI-generated context notes per agent
-- Structure: { "title-checker": "...", "search-review": "...", "exchange-guard": "...", "source-of-wealth": "..." }
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS ai_context_notes jsonb DEFAULT '{}'::jsonb;