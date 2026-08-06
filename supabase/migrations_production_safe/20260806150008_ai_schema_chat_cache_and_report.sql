-- DEPLOY-PLAN-3 — AI schema delta, production-safe renumbering.
--
-- Renumbered from supabase/migrations/036_ai_territorial_chat_cache.sql and
-- 037_campaign_ai_report.sql (content unchanged, merged into one file).
-- Verified via direct read-only query on 2026-08-06:
--   - public.ai_territorial_chat_cache CONFIRMED ABSENT on remote.
--   - public.campaigns.ai_summary ALREADY EXISTS on remote (text) — the
--     ADD COLUMN IF NOT EXISTS below is a guaranteed no-op for it.
--   - public.campaigns.ai_suggestions CONFIRMED ABSENT on remote.
-- Both source files were already fully idempotent (CREATE TABLE IF NOT
-- EXISTS, ADD COLUMN IF NOT EXISTS); reused as-is under a new version number.

begin;

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

DROP POLICY IF EXISTS "Users can only see their own territorial chat cache" ON public.ai_territorial_chat_cache;
CREATE POLICY "Users can only see their own territorial chat cache"
    ON public.ai_territorial_chat_cache
    FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can only insert their own territorial chat cache" ON public.ai_territorial_chat_cache;
CREATE POLICY "Users can only insert their own territorial chat cache"
    ON public.ai_territorial_chat_cache
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Service Role bypasses RLS by default for internal API calls using the
-- service_role_key; no explicit policy needed for it.

ALTER TABLE public.campaigns
ADD COLUMN IF NOT EXISTS ai_summary TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS ai_suggestions JSONB DEFAULT '[]'::jsonb;

commit;
