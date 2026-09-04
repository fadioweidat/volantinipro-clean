-- Migration: 20260904100000_edge_function_persistent_throttle.sql
-- Descrizione: Idempotenza atomica persistente e rate limiting per Edge Functions (send-email-conferma).
-- Sicurezza:
--  - Nessuna PII (email / IP) in chiaro: memorizzati solo hash crittografici SHA-256 (recipient_hash, ip_hash).
--  - RLS abilitato su entrambe le tabelle; nessun accesso per ruoli anon/authenticated.
--  - RPC SECURITY DEFINER accessibili SOLO dal backend (service_role).
--  - Nessun cron job creato in questa migration (pulizia futura separata tramite RPC cleanup).

-- 1. Tabella edge_rate_limit_buckets
CREATE TABLE IF NOT EXISTS public.edge_rate_limit_buckets (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    scope text NOT NULL,
    identifier_type text NOT NULL,
    identifier_hash text NOT NULL,
    tokens integer NOT NULL DEFAULT 1,
    window_start timestamptz NOT NULL DEFAULT clock_timestamp(),
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_edge_rate_limit_bucket UNIQUE (scope, identifier_type, identifier_hash)
);

CREATE INDEX IF NOT EXISTS idx_edge_rate_limit_expires_at 
    ON public.edge_rate_limit_buckets (expires_at);

-- 2. Tabella edge_idempotency_keys
CREATE TABLE IF NOT EXISTS public.edge_idempotency_keys (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    idempotency_key text NOT NULL,
    email_type text NOT NULL,
    recipient_hash text NOT NULL,
    ip_hash text NULL,
    status text NOT NULL CHECK (status IN ('pending', 'sent', 'failed')),
    attempt_count integer NOT NULL DEFAULT 1,
    provider_message_id text NULL,
    error_code text NULL,
    first_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    last_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_edge_idempotency_key UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_edge_idempotency_expires_at 
    ON public.edge_idempotency_keys (expires_at);

CREATE INDEX IF NOT EXISTS idx_edge_idempotency_recipient_hash 
    ON public.edge_idempotency_keys (recipient_hash);

-- 3. RLS e Permessi Tabelle
ALTER TABLE public.edge_rate_limit_buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.edge_idempotency_keys ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.edge_rate_limit_buckets FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.edge_idempotency_keys FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public.edge_rate_limit_buckets TO service_role;
GRANT ALL ON TABLE public.edge_idempotency_keys TO service_role;

-- 4. RPC: check_idempotency_and_mark
-- Gestione atomica stato di idempotenza con locking di riga:
--  - Se chiave nuova: inserisce 'pending' e restituisce 'proceed' (status: new, attempt: 1)
--  - Se già 'sent': restituisce 'dedup' (status: sent) -> NESSUN invio, NESSUN consumo rate limit
--  - Se 'pending' recente (< 120s): restituisce 'in_progress' (status: pending) -> NESSUN invio concorrente
--  - Se 'failed' (o pending bloccato):
--      * se entro cooldown (es. 60s): restituisce 'cooldown' con retry_after_seconds
--      * se cooldown trascorso: aggiorna a 'pending', incrementa attempt_count e restituisce 'proceed' (status: retry)
CREATE OR REPLACE FUNCTION public.check_idempotency_and_mark(
    p_idempotency_key text,
    p_email_type text,
    p_recipient_hash text,
    p_ip_hash text DEFAULT NULL,
    p_cooldown_seconds integer DEFAULT 60,
    p_ttl_seconds integer DEFAULT 86400
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_existing RECORD;
    v_now timestamptz := clock_timestamp();
    v_expires timestamptz := v_now + (p_ttl_seconds || ' seconds')::interval;
    v_cooldown_interval interval := (p_cooldown_seconds || ' seconds')::interval;
BEGIN
    -- Tentativo di inserimento atomico nuova chiave pending
    INSERT INTO public.edge_idempotency_keys (
        idempotency_key,
        email_type,
        recipient_hash,
        ip_hash,
        status,
        attempt_count,
        first_attempt_at,
        last_attempt_at,
        expires_at
    )
    VALUES (
        p_idempotency_key,
        p_email_type,
        p_recipient_hash,
        p_ip_hash,
        'pending',
        1,
        v_now,
        v_now,
        v_expires
    )
    ON CONFLICT (idempotency_key) DO NOTHING;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'action', 'proceed',
            'status', 'new',
            'attempt_count', 1
        );
    END IF;

    -- Chiave già esistente: acquisizione lock di riga per ispezione
    SELECT * INTO v_existing
    FROM public.edge_idempotency_keys
    WHERE idempotency_key = p_idempotency_key
    FOR UPDATE;

    IF NOT FOUND THEN
        -- Caso limite di riga eliminata tra conflict e select
        INSERT INTO public.edge_idempotency_keys (
            idempotency_key, email_type, recipient_hash, ip_hash, status, attempt_count,
            first_attempt_at, last_attempt_at, expires_at
        )
        VALUES (
            p_idempotency_key, p_email_type, p_recipient_hash, p_ip_hash, 'pending', 1,
            v_now, v_now, v_expires
        );
        RETURN jsonb_build_object('action', 'proceed', 'status', 'new', 'attempt_count', 1);
    END IF;

    -- Caso A: Già inviata con successo
    IF v_existing.status = 'sent' THEN
        RETURN jsonb_build_object(
            'action', 'dedup',
            'status', 'sent',
            'provider_message_id', v_existing.provider_message_id,
            'attempt_count', v_existing.attempt_count
        );
    END IF;

    -- Caso B: Richiesta in corso (pending entro 120 secondi)
    IF v_existing.status = 'pending' THEN
        IF v_now - v_existing.last_attempt_at < interval '120 seconds' THEN
            RETURN jsonb_build_object(
                'action', 'in_progress',
                'status', 'pending',
                'attempt_count', v_existing.attempt_count
            );
        END IF;
    END IF;

    -- Caso C: Precedente tentativo fallito (o pending bloccato) -> Cooldown check
    IF v_now - v_existing.last_attempt_at < v_cooldown_interval THEN
        RETURN jsonb_build_object(
            'action', 'cooldown',
            'status', v_existing.status,
            'retry_after_seconds', GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_existing.last_attempt_at + v_cooldown_interval - v_now)))),
            'attempt_count', v_existing.attempt_count
        );
    END IF;

    -- Cooldown superato: autorizza nuovo tentativo
    UPDATE public.edge_idempotency_keys
    SET status = 'pending',
        attempt_count = attempt_count + 1,
        last_attempt_at = v_now,
        error_code = NULL,
        expires_at = v_expires
    WHERE idempotency_key = p_idempotency_key;

    RETURN jsonb_build_object(
        'action', 'proceed',
        'status', 'retry',
        'attempt_count', v_existing.attempt_count + 1
    );
END;
$$;

-- 5. RPC: mark_idempotency_result
-- Aggiorna lo stato finale (sent / failed) dopo la chiamata al provider email
CREATE OR REPLACE FUNCTION public.mark_idempotency_result(
    p_idempotency_key text,
    p_status text,
    p_provider_message_id text DEFAULT NULL,
    p_error_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_updated boolean := false;
BEGIN
    IF p_status NOT IN ('sent', 'failed', 'pending') THEN
        RAISE EXCEPTION 'Stato idempotenza non valido: %', p_status;
    END IF;

    UPDATE public.edge_idempotency_keys
    SET status = p_status,
        provider_message_id = COALESCE(p_provider_message_id, provider_message_id),
        error_code = p_error_code,
        last_attempt_at = clock_timestamp()
    WHERE idempotency_key = p_idempotency_key;

    v_updated := FOUND;

    RETURN jsonb_build_object(
        'ok', v_updated,
        'idempotency_key', p_idempotency_key,
        'status', p_status
    );
END;
$$;

-- 6. RPC: consume_edge_rate_limit
-- Sliding / fixed window bucket atomico con ON CONFLICT:
-- Consuma 1 token se disponibile, calcola retry_after_seconds se superato.
CREATE OR REPLACE FUNCTION public.consume_edge_rate_limit(
    p_scope text,
    p_identifier_type text,
    p_identifier_hash text,
    p_max_requests integer DEFAULT 5,
    p_window_seconds integer DEFAULT 600
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_now timestamptz := clock_timestamp();
    v_window_interval interval := (p_window_seconds || ' seconds')::interval;
    v_bucket RECORD;
    v_allowed boolean;
    v_retry_after integer := 0;
BEGIN
    INSERT INTO public.edge_rate_limit_buckets (
        scope,
        identifier_type,
        identifier_hash,
        tokens,
        window_start,
        expires_at,
        updated_at
    )
    VALUES (
        p_scope,
        p_identifier_type,
        p_identifier_hash,
        1,
        v_now,
        v_now + v_window_interval,
        v_now
    )
    ON CONFLICT (scope, identifier_type, identifier_hash)
    DO UPDATE
    SET
        tokens = CASE
            WHEN v_now >= edge_rate_limit_buckets.window_start + v_window_interval THEN 1
            ELSE edge_rate_limit_buckets.tokens + 1
        END,
        window_start = CASE
            WHEN v_now >= edge_rate_limit_buckets.window_start + v_window_interval THEN v_now
            ELSE edge_rate_limit_buckets.window_start
        END,
        expires_at = CASE
            WHEN v_now >= edge_rate_limit_buckets.window_start + v_window_interval THEN v_now + v_window_interval
            ELSE edge_rate_limit_buckets.expires_at
        END,
        updated_at = v_now
    RETURNING * INTO v_bucket;

    IF v_bucket.tokens <= p_max_requests THEN
        v_allowed := true;
        v_retry_after := 0;
    ELSE
        v_allowed := false;
        v_retry_after := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_bucket.window_start + v_window_interval - v_now))));
    END IF;

    RETURN jsonb_build_object(
        'allowed', v_allowed,
        'tokens', v_bucket.tokens,
        'max_requests', p_max_requests,
        'retry_after_seconds', v_retry_after
    );
END;
$$;

-- 7. RPC: cleanup_edge_throttle_state
-- Funzione di manutenzione per epurare record scaduti senza pg_cron
CREATE OR REPLACE FUNCTION public.cleanup_edge_throttle_state()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_deleted_rate_limits integer := 0;
    v_deleted_idempotency integer := 0;
BEGIN
    DELETE FROM public.edge_rate_limit_buckets
    WHERE expires_at < clock_timestamp();
    GET DIAGNOSTICS v_deleted_rate_limits = ROW_COUNT;

    DELETE FROM public.edge_idempotency_keys
    WHERE expires_at < clock_timestamp();
    GET DIAGNOSTICS v_deleted_idempotency = ROW_COUNT;

    RETURN jsonb_build_object(
        'ok', true,
        'deleted_rate_limit_buckets', v_deleted_rate_limits,
        'deleted_idempotency_keys', v_deleted_idempotency
    );
END;
$$;

-- 8. Revoca ed assegnazione permessi RPC
REVOKE ALL ON FUNCTION public.check_idempotency_and_mark(text, text, text, text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_idempotency_result(text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.consume_edge_rate_limit(text, text, text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_edge_throttle_state() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.check_idempotency_and_mark(text, text, text, text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_idempotency_result(text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_edge_rate_limit(text, text, text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_edge_throttle_state() TO service_role;
