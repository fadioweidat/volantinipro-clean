-- FASE GPS — Prevenzione nuove sessioni zombie (Fase E).
-- PROPOSTA, NON APPLICATA in questo turno (vedi vincolo utente "FERMATI QUI
-- PRIMA DI QUALSIASI MIGRATION O DEPLOY"). Scritta per essere revisionata,
-- non eseguita.
--
-- PERCHE'
-- Oggi gps_start_session si affida solo all'unique index
-- delivery_sessions_one_active_operator_campaign_uidx (su driver_id,
-- campaign_id WHERE assignment_id IS NOT NULL AND status IN ('started',
-- 'paused')): un secondo Start dello stesso driver sulla stessa campagna
-- fallisce con unique_violation, catturato e rilanciato come un
-- SESSIONE_GIA_ATTIVA generico — identico sia che la sessione precedente sia
-- viva in questo momento, sia che sia ferma da mesi (esattamente le 11
-- sessioni zombie storiche gia' pulite in questa fase). Il frontend non puo'
-- distinguere i due casi da quel solo errore.
--
-- COSA CAMBIA
-- Prima di tentare l'insert, la funzione cerca esplicitamente una sessione
-- started/paused gia' esistente per questo driver+campagna e la classifica
-- con la STESSA gerarchia di evidenza gia' in uso lato client
-- (src/lib/monitoring/gpsSessionLifecycle.js: MAI updated_at, solo l'ultimo
-- gps_tracking_points.recorded_at o started_at) e le stesse soglie (LIVE
-- <=10min, STALE <=4h, oltre ABANDONED). In base al risultato solleva uno di
-- due errori deterministici, sempre con errcode 23505 (stesso codice gia'
-- trattato come permanente da isPermanentGpsWriteError() lato client, quindi
-- nessun loop di retry accidentale anche senza modifiche al frontend):
--   ACTIVE_SESSION_EXISTS   — sessione paused, oppure started con ultima
--                             attivita' entro le 4 ore (LIVE o STALE).
--   ABANDONED_SESSION_EXISTS — sessione started ferma da oltre 4 ore.
-- Il messaggio include l'id della sessione bloccante e l'eta' in secondi/ore,
-- cosi' un chiamante (frontend o log) puo' correlarla senza una query
-- separata.
--
-- COSA NON CAMBIA
-- Nessuna chiusura automatica della sessione vecchia: questa funzione resta
-- di sola LETTURA sulla sessione bloccante (SELECT ... FOR UPDATE per
-- coerenza dentro la stessa transazione, nessun UPDATE). La chiusura di una
-- sessione ABANDONED resta un'azione amministrativa esplicita tramite
-- gps_recover_abandoned_session (mai automatica, mai dal Driver). Il blocco
-- try/exception unique_violation esistente resta invariato come safety net
-- per la finestra di race condition tra il SELECT esplicito sopra e
-- l'INSERT (due Start concorrenti dello stesso driver): in quel caso raro
-- l'errore resta il generico SESSIONE_GIA_ATTIVA di sempre.
--
-- Incrementale: NON modifica remote_baseline.sql. Nessun nuovo privilegio:
-- stessa firma, stessi grant (SECURITY DEFINER, invariati).

CREATE OR REPLACE FUNCTION "public"."gps_start_session"("p_assignment_id" "uuid", "p_device_id" "text" DEFAULT NULL::"text", "p_campaign_zone_id" "uuid" DEFAULT NULL::"uuid", "p_access_token" "text" DEFAULT NULL::"text") RETURNS "public"."delivery_sessions"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_uid uuid := auth.uid();
  v_assignment public.operator_assignments%rowtype;
  v_session public.delivery_sessions%rowtype;
  v_group_name text;
  v_blocking public.delivery_sessions%rowtype;
  v_last_activity timestamptz;
  v_age_seconds numeric;
begin
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
  end if;

  select a.* into v_assignment
  from public.operator_assignments a
  where a.id = p_assignment_id
    and a.operator_id = v_uid
  for update;

  if not found or not public.gps_assignment_is_valid(
    v_assignment.id, v_uid, v_assignment.campaign_id, v_assignment.group_id, now()
  ) then
    raise exception 'ASSEGNAZIONE_NON_AUTORIZZATA' using errcode = '42501';
  end if;

  if p_campaign_zone_id is not null and not exists (
    select 1
    from public.campaign_zones z
    where z.id = p_campaign_zone_id
      and z.campaign_id = v_assignment.campaign_id
      and z.group_id = v_assignment.group_id
  ) then
    raise exception 'ZONA_NON_AUTORIZZATA' using errcode = '42501';
  end if;

  select g.name into v_group_name
  from public.operational_groups g
  where g.id = v_assignment.group_id
    and g.campaign_id = v_assignment.campaign_id;

  -- Check proattivo e classificato (Fase E), prima dell'insert: vedi
  -- commento di testa del file per la gerarchia/soglie usate.
  select s.* into v_blocking
  from public.delivery_sessions s
  where s.driver_id = v_uid
    and s.campaign_id = v_assignment.campaign_id
    and s.assignment_id is not null
    and s.status in ('started', 'paused')
  order by s.started_at desc nulls last, s.created_at desc
  limit 1
  for update;

  if found then
    if v_blocking.status = 'paused' then
      raise exception 'ACTIVE_SESSION_EXISTS: sessione % in pausa', v_blocking.id
        using errcode = '23505';
    end if;

    select greatest(
      coalesce(
        (select max(p.recorded_at) from public.gps_tracking_points p where p.session_id = v_blocking.id),
        v_blocking.started_at
      ),
      v_blocking.started_at
    ) into v_last_activity;
    v_age_seconds := extract(epoch from (now() - v_last_activity));

    if v_age_seconds <= 600 then
      raise exception 'ACTIVE_SESSION_EXISTS: sessione % attiva, ultima attivita'' % secondi fa', v_blocking.id, round(v_age_seconds)
        using errcode = '23505';
    elsif v_age_seconds <= 14400 then
      raise exception 'ACTIVE_SESSION_EXISTS: sessione % ferma da % secondi, soglia abbandono (4h) non ancora raggiunta', v_blocking.id, round(v_age_seconds)
        using errcode = '23505';
    else
      raise exception 'ABANDONED_SESSION_EXISTS: sessione % inattiva da % ore, serve recovery amministrativo', v_blocking.id, round(v_age_seconds / 3600, 1)
        using errcode = '23505';
    end if;
  end if;

  begin
    insert into public.delivery_sessions (
      assignment_id, campaign_id, group_id, driver_id, device_id,
      status, started_at, paused_at, ended_at, metadata, updated_at, campaign_zone_id
    ) values (
      v_assignment.id, v_assignment.campaign_id, v_assignment.group_id,
      v_uid, nullif(btrim(p_device_id), ''), 'started', now(), null, null,
      jsonb_build_object(
        'source', 'gps3a_authenticated_operator',
        'group_id', v_assignment.group_id,
        'group_name', v_group_name,
        'campaign_zone_id', p_campaign_zone_id
      ), now(), p_campaign_zone_id
    ) returning * into v_session;
  exception when unique_violation then
    -- Safety net per race condition (due Start concorrenti dello stesso
    -- driver tra il check classificato sopra e questo insert): stesso
    -- errore generico di sempre, il caso classificato e' gia' gestito sopra
    -- nella stragrande maggioranza dei casi reali.
    raise exception 'SESSIONE_GIA_ATTIVA' using errcode = '23505';
  end;

  if p_campaign_zone_id is not null then
    update public.campaign_zones
    set status = 'In corso', started_at = coalesce(started_at, now()), updated_at = now()
    where id = p_campaign_zone_id;
  end if;

  insert into public.gps_operator_audit_log (
    operator_id, action, campaign_id, assignment_id, session_id, context
  ) values (
    v_uid, 'session_started', v_session.campaign_id, v_session.assignment_id, v_session.id,
    jsonb_build_object('has_device_id', v_session.device_id is not null, 'campaign_zone_id', p_campaign_zone_id)
  );

  return v_session;
end;
$$;

ALTER FUNCTION "public"."gps_start_session"("p_assignment_id" "uuid", "p_device_id" "text", "p_campaign_zone_id" "uuid", "p_access_token" "text") OWNER TO "postgres";

-- Grant invariati rispetto alla definizione originale in remote_baseline.sql
-- (nessun privilegio nuovo introdotto da questa modifica).
