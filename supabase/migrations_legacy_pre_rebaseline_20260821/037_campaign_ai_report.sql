-- Migrazione per i campi AI del report finale campagna

ALTER TABLE public.campaigns
ADD COLUMN IF NOT EXISTS ai_summary TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS ai_suggestions JSONB DEFAULT '[]'::jsonb;
