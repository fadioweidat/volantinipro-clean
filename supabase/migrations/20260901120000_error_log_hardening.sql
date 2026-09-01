-- HARDENING Centro Controllo Sito — Priorità 1: errori realmente attivi.
--
-- Additive ONLY. Non cancella mai una riga, non tocca la RLS/policy/grant
-- esistenti di error_log (20260825220000_error_log.sql), non cambia le
-- colonne esistenti. Aggiunge:
--   - fingerprint text        — hash stabile di (category | module | messaggio
--                                normalizzato): raggruppa le occorrenze dello
--                                STESSO errore invece di una riga per evento.
--   - last_seen_at timestamptz — ultima volta che quel fingerprint è stato visto.
--   - occurrence_count integer — quante volte (>=1).
--   - origin text             — window.location.host di chi ha loggato
--                                (www.volantinipro.it vs localhost:5174 vs
--                                deploy preview): la dashboard filtra su questo.
--   - release text            — __COMMIT_SHA__ del bundle che ha loggato.
--   - resolved_note text      — 'auto' | 'manual' (resolved_by è uuid: non può
--                                contenere il letterale 'auto').
--
-- + indice unico parziale su fingerprint per le righe ancora aperte (una sola
--   riga "open" per fingerprint → l'upsert la aggiorna).
-- + RPC error_log_record(...): SECURITY DEFINER perché il client anon ha solo
--   GRANT INSERT su error_log e non può fare ON CONFLICT DO UPDATE.
-- + error_log_auto_resolve(p_hours): un fingerprint aperto non più visto da
--   p_hours (default 72) viene chiuso (status='resolved', resolved_at=now(),
--   resolved_note='auto'). MAI un DELETE. + job pg_cron orario separato.

-- ---------------------------------------------------------------------------
-- 1. Colonne additive
-- ---------------------------------------------------------------------------
ALTER TABLE "public"."error_log" ADD COLUMN IF NOT EXISTS "fingerprint" text;
ALTER TABLE "public"."error_log" ADD COLUMN IF NOT EXISTS "last_seen_at" timestamptz;
ALTER TABLE "public"."error_log" ADD COLUMN IF NOT EXISTS "occurrence_count" integer NOT NULL DEFAULT 1;
ALTER TABLE "public"."error_log" ADD COLUMN IF NOT EXISTS "origin" text;
ALTER TABLE "public"."error_log" ADD COLUMN IF NOT EXISTS "release" text;
ALTER TABLE "public"."error_log" ADD COLUMN IF NOT EXISTS "resolved_note" text;

-- Backfill: le righe storiche non hanno last_seen_at → è la loro created_at.
UPDATE "public"."error_log" SET "last_seen_at" = "created_at" WHERE "last_seen_at" IS NULL;

COMMENT ON COLUMN "public"."error_log"."fingerprint" IS 'Hash stabile di (category | module | messaggio normalizzato). Raggruppa occorrenze dello stesso errore. Calcolato client-side in src/lib/monitoring/errorLog.js.';
COMMENT ON COLUMN "public"."error_log"."last_seen_at" IS 'Ultima volta che questo fingerprint è stato osservato (aggiornata dall''upsert error_log_record).';
COMMENT ON COLUMN "public"."error_log"."occurrence_count" IS 'Numero di occorrenze aggregate su questo fingerprint aperto (>=1).';
COMMENT ON COLUMN "public"."error_log"."origin" IS 'window.location.host di chi ha loggato: la dashboard Centro Controllo di default mostra solo www.volantinipro.it (esclude localhost/preview).';
COMMENT ON COLUMN "public"."error_log"."release" IS 'Commit SHA (__COMMIT_SHA__) del bundle che ha registrato l''errore.';
COMMENT ON COLUMN "public"."error_log"."resolved_note" IS '''auto'' (chiuso da error_log_auto_resolve dopo 72h di silenzio) oppure ''manual'' (Admin ha premuto "Segna risolto"). resolved_by resta uuid.';

-- ---------------------------------------------------------------------------
-- 2. Indici
-- ---------------------------------------------------------------------------
-- Una sola riga "open" per fingerprint: è la garanzia che l'upsert aggiorna
-- invece di duplicare. Le righe con fingerprint NULL (nessun raggruppamento)
-- e quelle già risolte non entrano nel vincolo.
CREATE UNIQUE INDEX IF NOT EXISTS "error_log_open_fingerprint_uidx"
  ON "public"."error_log" ("fingerprint")
  WHERE ("status" = 'open' AND "fingerprint" IS NOT NULL);

CREATE INDEX IF NOT EXISTS "error_log_last_seen_at_idx" ON "public"."error_log" ("last_seen_at" DESC);
CREATE INDEX IF NOT EXISTS "error_log_origin_idx" ON "public"."error_log" ("origin");

-- ---------------------------------------------------------------------------
-- 3. RPC di scrittura con upsert-per-fingerprint
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER giustificato: il client anon del browser ha SOLO
-- GRANT INSERT su error_log (vedi 20260825220000_error_log.sql) — non può
-- eseguire ON CONFLICT DO UPDATE (nessun GRANT UPDATE a anon, e non deve
-- averlo: darebbe modo di manomettere righe altrui). La funzione fa da
-- unico punto di scrittura controllato: valida gli stessi allowlist dei
-- CHECK constraint, poi inserisce O aggiorna la riga aperta con lo stesso
-- fingerprint. Nessun SELECT/UPDATE arbitrario esposto.
CREATE OR REPLACE FUNCTION "public"."error_log_record"(
    "p_category" text,
    "p_module" text,
    "p_message" text,
    "p_severity" text DEFAULT 'error',
    "p_fingerprint" text DEFAULT NULL,
    "p_origin" text DEFAULT NULL,
    "p_release" text DEFAULT NULL,
    "p_request_id" text DEFAULT NULL,
    "p_campaign_id" uuid DEFAULT NULL,
    "p_anonymous_session_id" uuid DEFAULT NULL
)
    RETURNS uuid
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_id uuid;
  v_message text := left(coalesce(p_message, ''), 500);
  v_severity text := coalesce(p_severity, 'error');
begin
  if p_category is null or p_category <> all (array[
    'frontend','api','supabase','edge_function','auth','submit_campaign','quote','gps','driver'
  ]) then
    raise exception 'error_log_record: category non ammessa: %', p_category;
  end if;
  if v_severity <> all (array['info','warning','error','critical']) then
    v_severity := 'error';
  end if;

  if p_fingerprint is not null then
    -- Riga aperta con lo stesso fingerprint → aggiorna (nuova occorrenza).
    insert into public.error_log (
      category, module, message, severity, fingerprint, origin, release,
      request_id, campaign_id, anonymous_session_id, last_seen_at
    ) values (
      p_category, p_module, v_message, v_severity, p_fingerprint, p_origin, p_release,
      p_request_id, p_campaign_id, p_anonymous_session_id, now()
    )
    -- il predicato deve combaciare ESATTAMENTE con quello dell'indice unico
    -- parziale error_log_open_fingerprint_uidx perché Postgres lo riconosca
    -- come arbitro dell'ON CONFLICT. In questo ramo p_fingerprint è già NOT NULL.
    on conflict (fingerprint) where (status = 'open' and fingerprint is not null)
    do update set
      occurrence_count = public.error_log.occurrence_count + 1,
      last_seen_at = now(),
      -- il messaggio/severità più recente vince (stesso fingerprint = stesso
      -- errore, ma la severità può essere stata alzata)
      message = excluded.message,
      severity = excluded.severity,
      release = coalesce(excluded.release, public.error_log.release)
    returning id into v_id;
  else
    insert into public.error_log (
      category, module, message, severity, origin, release,
      request_id, campaign_id, anonymous_session_id, last_seen_at
    ) values (
      p_category, p_module, v_message, v_severity, p_origin, p_release,
      p_request_id, p_campaign_id, p_anonymous_session_id, now()
    )
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

ALTER FUNCTION "public"."error_log_record"(text, text, text, text, text, text, text, text, uuid, uuid) OWNER TO "postgres";

COMMENT ON FUNCTION "public"."error_log_record"(text, text, text, text, text, text, text, text, uuid, uuid) IS 'Unico punto di scrittura su error_log dal client anon: inserisce, oppure aggiorna (occurrence_count+1, last_seen_at=now()) la riga ancora aperta con lo stesso fingerprint. SECURITY DEFINER perché anon non ha GRANT UPDATE.';

-- Stesso pubblico dell'INSERT diretto già concesso (anon + authenticated).
REVOKE ALL ON FUNCTION "public"."error_log_record"(text, text, text, text, text, text, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."error_log_record"(text, text, text, text, text, text, text, text, uuid, uuid) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."error_log_record"(text, text, text, text, text, text, text, text, uuid, uuid) TO "authenticated";

-- ---------------------------------------------------------------------------
-- 4. Auto-resolve (72h di silenzio) — MAI un DELETE
-- ---------------------------------------------------------------------------
-- Un fingerprint aperto che non viene più visto da p_hours ore è considerato
-- rientrato: viene marcato resolved (resolved_at=now(), resolved_note='auto').
-- La riga resta, con tutto il suo storico (occurrence_count, primo/ultimo
-- visto): se l'errore si ripresenta, error_log_record apre una NUOVA riga
-- (l'indice unico parziale è solo su status='open').
CREATE OR REPLACE FUNCTION "public"."error_log_auto_resolve"("p_hours" integer DEFAULT 72)
    RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_resolved integer;
begin
  update public.error_log
  set status = 'resolved',
      resolved_at = now(),
      resolved_note = 'auto'
  where status = 'open'
    and coalesce(last_seen_at, created_at) < now() - make_interval(hours => greatest(p_hours, 1));
  get diagnostics v_resolved = row_count;
  return v_resolved;
end;
$$;

ALTER FUNCTION "public"."error_log_auto_resolve"(integer) OWNER TO "postgres";

COMMENT ON FUNCTION "public"."error_log_auto_resolve"(integer) IS 'Chiude (status=resolved, resolved_note=''auto'') i fingerprint aperti non più visti da p_hours (default 72). Non cancella mai nulla. Invocata dal job pg_cron error-log-auto-resolve-hourly.';

-- Nessun ruolo applicativo può eseguirla: come cleanup_monitoring_retention,
-- è un'operazione di triage automatico che gira come postgres via pg_cron.
REVOKE ALL ON FUNCTION "public"."error_log_auto_resolve"(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."error_log_auto_resolve"(integer) FROM "anon";
REVOKE ALL ON FUNCTION "public"."error_log_auto_resolve"(integer) FROM "authenticated";

-- Job pg_cron SEPARATO (nome e cadenza distinti dal collector e dalla
-- retention): ogni ora al minuto 15. Idempotente per job_name.
SELECT cron.schedule(
  'error-log-auto-resolve-hourly',
  '15 * * * *',
  $cron$SELECT public.error_log_auto_resolve(72);$cron$
);
