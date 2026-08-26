-- FASE GPS — Prevenzione nuove sessioni zombie (Fase D: resume classification).
-- PROPOSTA, NON APPLICATA in questo turno (vedi vincolo utente "FERMATI QUI
-- PRIMA DI QUALSIASI MIGRATION O DEPLOY").
--
-- PERCHE' SERVE
-- Il link Driver pubblico (nessuna sessione Supabase, nessun auth.uid()) non
-- puo' leggere gps_tracking_points direttamente: la RLS
-- gps_tracking_points_select_policy richiede driver_id = auth.uid() o admin.
-- Senza l'ultimo recorded_at, useGpsTracking.js non puo' classificare una
-- sessione trovata al resume in LIVE/STALE/ABANDONED (gpsSessionLifecycle.js)
-- per il driver in modalita' token — dovrebbe sempre riagganciarsi alla
-- cieca, esattamente il comportamento che questa fase vuole correggere.
--
-- COSA CAMBIA
-- get_active_driver_session (gia' SECURITY DEFINER, gia' verifica
-- assignment_id+access_token prima di leggere) aggiunge un solo campo in
-- sola lettura al jsonb ritornato: last_gps_recorded_at, calcolato con la
-- stessa fonte di verita' gia' usata altrove (MAX(gps_tracking_points.
-- recorded_at) per quella sessione). Nessuna scrittura, nessun nuovo
-- privilegio, nessun cambio di firma (stessi parametri, stesso tipo di
-- ritorno jsonb) — solo un campo aggiuntivo nell'oggetto gia' esistente,
-- quindi retro-compatibile con qualunque chiamante attuale.
--
-- Incrementale: NON modifica remote_baseline.sql.

CREATE OR REPLACE FUNCTION "public"."get_active_driver_session"("p_assignment_id" "uuid", "p_access_token" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_session public.delivery_sessions%rowtype;
  v_last_gps timestamptz;
begin
  if p_assignment_id is null then
    raise exception 'ASSEGNAZIONE_NON_AUTORIZZATA' using errcode = '42501';
  end if;

  if v_uid is null then
    if p_access_token is null then
      raise exception 'OPERATORE_NON_AUTENTICATO' using errcode = '42501';
    end if;
    select operator_id into v_uid
    from public.operator_assignments
    where id = p_assignment_id and access_token = p_access_token;
    if v_uid is null then
      raise exception 'OPERATORE_NON_AUTENTICATO' using errcode = '42501';
    end if;
  else
    if not exists (
      select 1 from public.operator_assignments
      where id = p_assignment_id and operator_id = v_uid
    ) then
      raise exception 'ASSEGNAZIONE_NON_AUTORIZZATA' using errcode = '42501';
    end if;
  end if;

  select * into v_session
  from public.delivery_sessions s
  where s.assignment_id = p_assignment_id
    and s.driver_id = v_uid
    and s.status in ('started', 'paused')
  order by s.started_at desc nulls last, s.created_at desc
  limit 1;

  if not found then
    return jsonb_build_object('session', null);
  end if;

  -- Sola lettura, stessa fonte di verita' della gerarchia di evidenza in
  -- src/lib/monitoring/gpsSessionLifecycle.js (mai updated_at).
  select max(recorded_at) into v_last_gps
  from public.gps_tracking_points
  where session_id = v_session.id;

  return jsonb_build_object('session', to_jsonb(v_session), 'last_gps_recorded_at', v_last_gps);
end;
$$;

ALTER FUNCTION "public"."get_active_driver_session"("p_assignment_id" "uuid", "p_access_token" "text") OWNER TO "postgres";

-- Grant invariati rispetto alla definizione originale in remote_baseline.sql
-- (nessun privilegio nuovo introdotto da questa modifica).
