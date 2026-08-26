-- FASE Centro Controllo — Storico uptime/health (Blocco A).
-- PROPOSTA, NON APPLICATA in questo turno ("FERMATI QUI. Non applicare
-- migration, scheduler o deploy senza report.").
--
-- PERCHE' SERVE
-- Oggi il Centro Controllo esegue i check live solo quando un Admin apre la
-- pagina (platformHealth.js/authHealth.js, entrambi fire-and-forget senza
-- persistenza oltre lo stato React): non esiste alcuno storico, quindi
-- nessun uptime reale calcolabile. Questa tabella e' il registro
-- append-only di OGNI esecuzione di un check reale (live, non un
-- contratto/invariante statico — vedi il report della fase per la
-- distinzione HEALTH CHECK vs FLOW STATUS vs AUTH EVIDENCE gia' tracciata
-- altrove: error_log per gli errori applicativi, site_events per il
-- traffico, config-status per l'ultimo login reale).
--
-- Colonna "source" (oltre ai campi minimi indicativi della richiesta):
-- necessaria per distinguere una riga scritta dal collector periodico
-- (source='collector', quando esistera') da una scritta manualmente
-- dall'Admin aprendo la pagina (source='manual') — senza questa
-- distinzione l'uptime calcolato risulterebbe fuorviante finche' il
-- collector non e' ancora attivo (pochi campioni irregolari spacciati per
-- copertura continua). Vedi src/lib/monitoring/healthHistory.js per come
-- viene usata nel calcolo INSUFFICIENT_DATA.

CREATE TABLE IF NOT EXISTS "public"."platform_health_checks" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "check_name" text NOT NULL,
    "check_group" text NOT NULL,
    "status" text NOT NULL,
    "response_time_ms" integer,
    "error_code" text,
    "error_message" text,
    "checked_at" timestamptz NOT NULL DEFAULT now(),
    "source" text NOT NULL DEFAULT 'manual',
    "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT "platform_health_checks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "platform_health_checks_status_check" CHECK (
        "status" = ANY (ARRAY['ok'::text, 'warning'::text, 'fail'::text, 'unknown'::text])
    ),
    CONSTRAINT "platform_health_checks_group_check" CHECK (
        "check_group" = ANY (ARRAY[
            'frontend'::text, 'supabase'::text, 'auth'::text, 'database'::text,
            'edge_function'::text, 'gps'::text, 'analytics'::text, 'provider'::text
        ])
    ),
    CONSTRAINT "platform_health_checks_source_check" CHECK ("source" = ANY (ARRAY['collector'::text, 'manual'::text])),
    CONSTRAINT "platform_health_checks_response_time_check" CHECK ("response_time_ms" IS NULL OR "response_time_ms" >= 0),
    CONSTRAINT "platform_health_checks_error_message_length_check" CHECK ("error_message" IS NULL OR char_length("error_message") <= 500),
    -- Nessun token/email/IP/API-key/PII per costruzione dello schema: solo
    -- nome/gruppo/stato/latenza/codice-errore/messaggio-breve/timestamp/
    -- provenienza/metadata libera (comunque mai popolata con valori
    -- sensibili dal chiamante — vedi commento nel collector).
    CONSTRAINT "platform_health_checks_check_name_length_check" CHECK (char_length("check_name") <= 100)
);

COMMENT ON TABLE "public"."platform_health_checks" IS 'Storico append-only dei check LIVE reali del Centro Controllo (mai contratti/invarianti statici, mai flow di business). No PII, no token, no stack trace.';

CREATE INDEX IF NOT EXISTS "platform_health_checks_name_checked_at_idx" ON "public"."platform_health_checks" ("check_name", "checked_at" DESC);
CREATE INDEX IF NOT EXISTS "platform_health_checks_checked_at_idx" ON "public"."platform_health_checks" ("checked_at" DESC);
CREATE INDEX IF NOT EXISTS "platform_health_checks_group_idx" ON "public"."platform_health_checks" ("check_group");

ALTER TABLE "public"."platform_health_checks" ENABLE ROW LEVEL SECURITY;

-- Nessun accesso anon (a differenza di error_log/site_events, che accolgono
-- eventi self-reported da qualunque visitatore): questa e' telemetria di
-- infrastruttura, scritta solo da un Admin autenticato che esegue il check
-- dal browser (source='manual') o dal collector periodico via service_role
-- (che bypassa comunque la RLS by design in Postgres/Supabase — nessuna
-- policy dedicata necessaria per quel percorso).
CREATE POLICY "platform_health_checks_admin_all" ON "public"."platform_health_checks" TO "authenticated"
  USING ((EXISTS ( SELECT 1 FROM "public"."profiles"
    WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))))
  WITH CHECK ((EXISTS ( SELECT 1 FROM "public"."profiles"
    WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))));

GRANT SELECT, INSERT ON "public"."platform_health_checks" TO "authenticated";
-- Nessun UPDATE/DELETE concesso: append-only per costruzione (uno storico
-- corretto non deve poter essere riscritto a posteriori, nemmeno da un
-- Admin). Retention (proposta, non applicata) sara' un DELETE amministrativo
-- separato ed esplicito, mai una UPDATE silenziosa.
REVOKE UPDATE, DELETE ON "public"."platform_health_checks" FROM "authenticated";
-- TRUNCATE/REFERENCES/TRIGGER: concessi di default a "authenticated" dai
-- privilegi di schema di Supabase su ogni nuova tabella public (stesso
-- comportamento gia' osservato su error_log/site_events in fasi precedenti
-- di questo progetto) — non raggiungibili in pratica tramite PostgREST
-- (nessun verbo TRUNCATE nella REST API), ma revocati qui esplicitamente
-- per difesa in profondita', come gia' fatto per gps_recover_abandoned_session.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON "public"."platform_health_checks" FROM "authenticated";
REVOKE ALL ON "public"."platform_health_checks" FROM "anon";
