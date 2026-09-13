-- Migration: 20260913140000_ai_action_executions.sql
-- Description: Durable execution ledger for AI-controlled actions (audit trail + idempotency)
-- Phase 5B.1: Scoped strictly to admin_send_message and role admin

BEGIN;

CREATE TABLE IF NOT EXISTS public.ai_action_executions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key text NOT NULL,
    actor_id uuid,
    actor_role text NOT NULL CHECK (actor_role IN ('admin')),
    action_type text NOT NULL CHECK (action_type IN ('admin_send_message')),
    entity_type text,
    entity_id uuid,
    status text NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed', 'cancelled')),
    before_state jsonb,
    after_state jsonb,
    metadata jsonb,
    canonical_result_id uuid,
    error_code text,
    error_message text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    executed_at timestamptz,
    CONSTRAINT uq_ai_action_executions_key UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_ai_action_executions_created_at
    ON public.ai_action_executions (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_action_executions_actor_id
    ON public.ai_action_executions (actor_id);

CREATE INDEX IF NOT EXISTS idx_ai_action_executions_status
    ON public.ai_action_executions (status);

-- RLS: Not directly writable from frontend clients.
-- Writes occur server-side through ai-core using privileged service_role access.
ALTER TABLE public.ai_action_executions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.ai_action_executions FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public.ai_action_executions TO service_role;

-- Authorized admin read path: Admins can inspect execution audit logs
CREATE POLICY ai_action_executions_admin_select
    ON public.ai_action_executions
    FOR SELECT
    TO authenticated
    USING (public.gps_is_admin());

GRANT SELECT ON TABLE public.ai_action_executions TO authenticated;

COMMIT;
