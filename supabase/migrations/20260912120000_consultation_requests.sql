-- Migration: consultation_requests
-- Salva le richieste dal form pubblico "Parla con un consulente".
--
-- RLS:
--   - anon  : solo INSERT (il form pubblico può scrivere, MAI leggere)
--   - authenticated admin : SELECT + UPDATE (per la gestione dal pannello Admin)
--   - service_role: accesso completo (Edge Function, bypass RLS automatico)
--
-- La tabella NON è collegata ad auth.users: le richieste arrivano da utenti
-- anonimi dal sito pubblico. L'email è opzionale.

CREATE TABLE IF NOT EXISTS public.consultation_requests (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        text        NOT NULL CHECK (char_length(nome) >= 1 AND char_length(nome) <= 150),
  telefono    text        NOT NULL CHECK (char_length(telefono) >= 5 AND char_length(telefono) <= 30),
  email       text        CHECK (email IS NULL OR email ~* '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$'),
  comune      text        NOT NULL CHECK (char_length(comune) >= 1 AND char_length(comune) <= 150),
  servizio    text        NOT NULL DEFAULT 'd2d',
  quantita    integer     NOT NULL DEFAULT 10000 CHECK (quantita > 0 AND quantita <= 10000000),
  timing      text        NOT NULL DEFAULT 'asap',
  custom_date text,
  messaggio   text        CHECK (messaggio IS NULL OR char_length(messaggio) <= 3000),
  source      text        NOT NULL DEFAULT 'consultant_form',
  status      text        NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'converted', 'closed')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.consultation_requests ENABLE ROW LEVEL SECURITY;

-- Anon: solo INSERT. Mai SELECT, mai UPDATE, mai DELETE.
CREATE POLICY "consultation_requests_insert_public"
ON public.consultation_requests
FOR INSERT
TO anon
WITH CHECK (true);

-- Admin autenticato: SELECT (per gestire le lead)
CREATE POLICY "consultation_requests_admin_select"
ON public.consultation_requests
FOR SELECT
TO authenticated
USING (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  OR
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
);

-- Admin autenticato: UPDATE (per aggiornare lo status)
CREATE POLICY "consultation_requests_admin_update"
ON public.consultation_requests
FOR UPDATE
TO authenticated
USING (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  OR
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
)
WITH CHECK (true);

-- Indice per ordinamento nel pannello Admin
CREATE INDEX IF NOT EXISTS consultation_requests_created_at_idx
ON public.consultation_requests (created_at DESC);

-- Indice per filtrare per status
CREATE INDEX IF NOT EXISTS consultation_requests_status_idx
ON public.consultation_requests (status);
