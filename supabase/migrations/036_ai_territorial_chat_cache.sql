-- Migrazione per la cache dell'Assistente Territoriale AI

CREATE TABLE IF NOT EXISTS public.ai_territorial_chat_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    payload_hash TEXT NOT NULL,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, payload_hash)
);

CREATE INDEX IF NOT EXISTS idx_ai_territorial_chat_cache_hash ON public.ai_territorial_chat_cache(payload_hash);
CREATE INDEX IF NOT EXISTS idx_ai_territorial_chat_cache_user ON public.ai_territorial_chat_cache(user_id);

ALTER TABLE public.ai_territorial_chat_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only see their own territorial chat cache"
    ON public.ai_territorial_chat_cache
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can only insert their own territorial chat cache"
    ON public.ai_territorial_chat_cache
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- E' importante che il Service Role possa leggere e scrivere bypassando RLS,
-- questo e' gestito di default da Supabase per le chiamate API interne che usano service_role_key.
