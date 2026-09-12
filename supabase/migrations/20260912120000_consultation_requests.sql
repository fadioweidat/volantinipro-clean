-- Migration: consultation_requests
-- Salva le richieste dal form pubblico "Parla con un consulente".
--
-- Architettura di sicurezza:
--   - Il browser NON scrive MAI direttamente in questa tabella.
--   - NESSUNA policy anon: il form pubblico passa esclusivamente attraverso
--     l'Edge Function send-consultation-request, che valida, applica rate limit
--     e honeypot, e inserisce i record usando la service_role key.
--   - authenticated admin: SELECT + UPDATE per la gestione delle lead nel
--     pannello CommercialCenter, protetti dal check canonico public.jwt_is_admin()
--     (che include la verifica su is_authorized_admin_email() -> fenice.sp@gmail.com).

CREATE TABLE IF NOT EXISTS public.consultation_requests (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        text        NOT NULL CHECK (char_length(nome) >= 1 AND char_length(nome) <= 150),
  telefono    text        NOT NULL CHECK (char_length(telefono) >= 5 AND char_length(telefono) <= 30),
  email       text        CHECK (email IS NULL OR email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  comune      text        NOT NULL CHECK (char_length(comune) >= 1 AND char_length(comune) <= 150),
  servizio    text        NOT NULL DEFAULT 'd2d',
  quantita    integer     NOT NULL DEFAULT 10000 CHECK (quantita > 0 AND quantita <= 10000000),
  timing      text        NOT NULL DEFAULT 'asap',
  custom_date date,
  messaggio   text        CHECK (messaggio IS NULL OR char_length(messaggio) <= 3000),
  source      text        NOT NULL DEFAULT 'consultant_form',
  status      text        NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'closed', 'spam')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.consultation_requests ENABLE ROW LEVEL SECURITY;

-- NESSUNA POLICY ANON: anon non puo' fare INSERT, SELECT, UPDATE, DELETE.
-- Solo l'Edge Function con service_role puo' inserire le lead.

-- Admin autenticato: SELECT (gestione lead in CommercialCenter)
CREATE POLICY "consultation_requests_admin_select"
ON public.consultation_requests
FOR SELECT
TO authenticated
USING (public.jwt_is_admin());

-- Admin autenticato: UPDATE (aggiornamento status lead)
CREATE POLICY "consultation_requests_admin_update"
ON public.consultation_requests
FOR UPDATE
TO authenticated
USING (public.jwt_is_admin())
WITH CHECK (public.jwt_is_admin());

-- Indici per query Admin
CREATE INDEX IF NOT EXISTS consultation_requests_created_at_idx
ON public.consultation_requests (created_at DESC);

CREATE INDEX IF NOT EXISTS consultation_requests_status_idx
ON public.consultation_requests (status);
