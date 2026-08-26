-- FASE Centro Controllo — Storico uptime/health (Blocco B: incident model).
-- PROPOSTA, NON APPLICATA in questo turno.
--
-- Un incidente e' l'aggregazione di UNA sequenza di check falliti/in
-- warning per lo stesso check_name, non un singolo fallimento (vedi
-- src/lib/monitoring/incidentEngine.js per la macchina a stati pura che
-- decide apri/aggiorna/risolvi — questa tabella e' solo lo storage,
-- nessuna logica di soglia qui dentro).
--
-- consecutive_successes (oltre ai campi minimi indicativi della richiesta):
-- necessario per implementare "risolvere automaticamente quando il check
-- torna sano per N verifiche consecutive" senza dover ri-derivare la
-- sequenza da platform_health_checks a ogni valutazione — e' lo stato
-- interno della macchina a stati, persistito insieme al resto
-- dell'incidente.

CREATE TABLE IF NOT EXISTS "public"."platform_incidents" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "check_name" text NOT NULL,
    "severity" text NOT NULL,
    "status" text NOT NULL DEFAULT 'open',
    "started_at" timestamptz NOT NULL DEFAULT now(),
    "last_seen_at" timestamptz NOT NULL DEFAULT now(),
    "resolved_at" timestamptz,
    "occurrence_count" integer NOT NULL DEFAULT 1,
    "consecutive_successes" integer NOT NULL DEFAULT 0,
    "first_error_code" text,
    "last_error_code" text,
    "summary" text NOT NULL,
    "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT "platform_incidents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "platform_incidents_severity_check" CHECK ("severity" = ANY (ARRAY['warning'::text, 'critical'::text])),
    CONSTRAINT "platform_incidents_status_check" CHECK ("status" = ANY (ARRAY['open'::text, 'resolved'::text])),
    CONSTRAINT "platform_incidents_occurrence_count_check" CHECK ("occurrence_count" >= 1),
    CONSTRAINT "platform_incidents_consecutive_successes_check" CHECK ("consecutive_successes" >= 0),
    CONSTRAINT "platform_incidents_summary_length_check" CHECK (char_length("summary") <= 500),
    CONSTRAINT "platform_incidents_check_name_length_check" CHECK (char_length("check_name") <= 100),
    -- Coerenza minima: un incidente risolto ha sempre un resolved_at, uno
    -- aperto non ce l'ha mai (mai una data di chiusura "dimenticata" o
    -- inventata a posteriori).
    CONSTRAINT "platform_incidents_resolved_consistency_check" CHECK (
        ("status" = 'resolved' AND "resolved_at" IS NOT NULL) OR
        ("status" = 'open' AND "resolved_at" IS NULL)
    )
);

COMMENT ON TABLE "public"."platform_incidents" IS 'Incidenti aggregati (sequenze di check falliti/in warning), MAI un singolo jitter isolato. Nessun timestamp storico precedente all''introduzione del sistema viene mai inventato.';

-- Invariante "non creare duplicati" imposto a livello DB, non solo di
-- applicazione: al massimo UN incidente open per check_name alla volta —
-- stesso pattern gia' usato in questo progetto per
-- delivery_sessions_one_active_operator_campaign_uidx (GPS).
CREATE UNIQUE INDEX IF NOT EXISTS "platform_incidents_one_open_per_check_uidx"
  ON "public"."platform_incidents" ("check_name") WHERE ("status" = 'open');

CREATE INDEX IF NOT EXISTS "platform_incidents_status_idx" ON "public"."platform_incidents" ("status");
CREATE INDEX IF NOT EXISTS "platform_incidents_started_at_idx" ON "public"."platform_incidents" ("started_at" DESC);
CREATE INDEX IF NOT EXISTS "platform_incidents_resolved_at_idx" ON "public"."platform_incidents" ("resolved_at" DESC);

ALTER TABLE "public"."platform_incidents" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_incidents_admin_all" ON "public"."platform_incidents" TO "authenticated"
  USING ((EXISTS ( SELECT 1 FROM "public"."profiles"
    WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))))
  WITH CHECK ((EXISTS ( SELECT 1 FROM "public"."profiles"
    WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))));

GRANT SELECT, INSERT, UPDATE ON "public"."platform_incidents" TO "authenticated";
-- UPDATE concesso qui (a differenza di platform_health_checks): un
-- incidente e' per natura un record mutabile (last_seen_at/
-- occurrence_count/consecutive_successes/status/resolved_at aggiornati
-- dalla stessa macchina a stati man mano che arrivano nuovi check) — non e'
-- uno storico append-only come i singoli check.
REVOKE DELETE ON "public"."platform_incidents" FROM "authenticated";
-- TRUNCATE/REFERENCES/TRIGGER: stessa difesa in profondita' di
-- platform_health_checks (vedi commento li'), stesso motivo.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON "public"."platform_incidents" FROM "authenticated";
REVOKE ALL ON "public"."platform_incidents" FROM "anon";
