-- gps_recover_abandoned_session — RPC admin-only per il recovery manuale di
-- delivery_sessions rimaste 'started'/'paused' senza mai essere chiuse
-- (11 sessioni reali diagnosticate: vedi conversazione "Centro Controllo —
-- GPS Session Lifecycle / Zombie Sessions").
--
-- PERCHE' SERVE UNA NUOVA RPC (non riusare gps_transition_session):
-- gps_transition_session(..., 'cancel') imposta SEMPRE
-- ended_at = coalesce(ended_at, now()) — per una sessione storica con
-- ended_at gia' NULL questo forzerebbe ended_at a "adesso", falsificando la
-- data di fine reale del turno (poteva essere finito settimane o mesi fa).
-- Questa RPC permette invece di passare un ended_at storico esplicito
-- (derivato da MAX(gps_tracking_points.recorded_at), MAI da NOW()) oppure
-- di lasciarlo esplicitamente NULL quando non esiste alcuna evidenza reale
-- da cui derivarlo — mai un valore inventato in nessuno dei due casi.
--
-- Incrementale: NON modifica remote_baseline.sql. Non introduce alcun nuovo
-- cron/job/trigger automatico — e' un'azione amministrativa esplicita,
-- chiamata solo manualmente da un admin verificato, mai dal Driver, mai in
-- automatico.
--
-- Non aggiunge un enum 'abandoned' allo schema (delivery_sessions_status_check
-- resta invariato: started/paused/completed/cancelled): lo stato finale
-- scritto e' sempre 'cancelled' (recovery amministrativo, mai una finta
-- "completed" — non possiamo affermare che il turno sia stato davvero
-- portato a termine).
--
-- VALIDAZIONE SERVER-SIDE DI p_ended_at_source (mai fidarsi del chiamante):
-- se il chiamante dichiara source='last_gps_recorded_at', la funzione
-- verifica che p_ended_at corrisponda davvero a
-- MAX(gps_tracking_points.recorded_at) per quella sessione (tolleranza di
-- 1s solo per precisione timestamp, non un margine "abbastanza vicino");
-- se dichiara source='no_gps_evidence', verifica che esistano zero
-- gps_tracking_points per quella sessione E che p_ended_at sia NULL.
-- Qualunque discrepanza fa fallire la chiamata (fail closed).

CREATE OR REPLACE FUNCTION "public"."gps_recover_abandoned_session"(
    "p_session_id" "uuid",
    "p_ended_at" timestamptz DEFAULT NULL,
    "p_reason" "text" DEFAULT NULL,
    "p_expected_current_status" "text" DEFAULT 'started',
    "p_ended_at_source" "text" DEFAULT NULL
) RETURNS "public"."delivery_sessions"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_uid uuid := auth.uid();
  v_session public.delivery_sessions%rowtype;
  v_max_gps_recorded_at timestamptz;
  v_gps_point_count integer;
begin
  if v_uid is null then
    raise exception 'OPERATORE_NON_AUTENTICATO' using errcode = '42501';
  end if;

  -- Stesso modello di autorizzazione gia' usato da tutte le altre RPC GPS
  -- admin-aware del progetto (gps_transition_session, ecc.): profiles.role
  -- riletto server-side, mai fidato dal chiamante.
  if not public.gps_is_admin() then
    raise exception 'SOLO_ADMIN' using errcode = '42501';
  end if;

  if p_expected_current_status not in ('started', 'paused') then
    raise exception 'STATO_ATTESO_NON_VALIDO: % (ammessi solo started/paused)', p_expected_current_status
      using errcode = '22023';
  end if;

  if p_ended_at_source is not null and p_ended_at_source not in (
    'last_gps_recorded_at', 'no_gps_evidence', 'admin_override', 'other'
  ) then
    raise exception 'ENDED_AT_SOURCE_NON_VALIDO: %', p_ended_at_source using errcode = '22023';
  end if;

  select * into v_session
  from public.delivery_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'SESSIONE_NON_TROVATA' using errcode = 'P0002';
  end if;

  -- Fail closed / idempotenza controllata: una sessione gia' chiusa (da
  -- questo stesso recovery, da una chiusura reale del driver, o da un
  -- admin cancel) non viene mai sovrascritta. Nessun no-op silenzioso: la
  -- chiamata fallisce in modo esplicito e riconoscibile.
  if v_session.status in ('completed', 'cancelled') then
    raise exception 'SESSIONE_GIA_CHIUSA: status attuale=%', v_session.status using errcode = '22023';
  end if;

  if v_session.status <> p_expected_current_status then
    raise exception 'STATO_ATTUALE_DIVERSO_DA_ATTESO: atteso=%, trovato=%', p_expected_current_status, v_session.status
      using errcode = '22023';
  end if;

  if p_ended_at is not null then
    if p_ended_at > now() then
      raise exception 'ENDED_AT_NEL_FUTURO' using errcode = '22023';
    end if;
    if v_session.started_at is not null and p_ended_at < v_session.started_at then
      raise exception 'ENDED_AT_PRIMA_DI_STARTED_AT' using errcode = '22023';
    end if;
  end if;

  -- MAI fidarsi del timestamp/della provenienza dichiarati dal chiamante
  -- (frontend o Admin): quando p_ended_at_source afferma una provenienza
  -- specifica, la verifichiamo qui contro i dati reali prima di scrivere
  -- qualunque cosa. Tolleranza di 1 secondo SOLO per assorbire una
  -- eventuale perdita di precisione nel round-trip del timestamp
  -- (es. troncamento a millisecondi lato client) — non e' un margine per
  -- accettare un valore "abbastanza vicino" inventato.
  if p_ended_at_source = 'last_gps_recorded_at' then
    select max(recorded_at) into v_max_gps_recorded_at
    from public.gps_tracking_points
    where session_id = p_session_id;

    if v_max_gps_recorded_at is null then
      raise exception 'NESSUN_PUNTO_GPS_PER_LAST_GPS_RECORDED_AT: la sessione non ha alcun gps_tracking_points, source dichiarata non corrisponde ai dati' using errcode = '22023';
    end if;

    if p_ended_at is null or abs(extract(epoch from (p_ended_at - v_max_gps_recorded_at))) > 1 then
      raise exception 'ENDED_AT_NON_CORRISPONDE_A_MAX_GPS_RECORDED_AT: atteso=%, ricevuto=%', v_max_gps_recorded_at, p_ended_at
        using errcode = '22023';
    end if;
  elsif p_ended_at_source = 'no_gps_evidence' then
    select count(*) into v_gps_point_count
    from public.gps_tracking_points
    where session_id = p_session_id;

    if v_gps_point_count > 0 then
      raise exception 'GPS_PRESENTE_MA_SOURCE_DICHIARA_NO_GPS_EVIDENCE: % punti trovati', v_gps_point_count using errcode = '22023';
    end if;

    if p_ended_at is not null then
      raise exception 'ENDED_AT_DEVE_ESSERE_NULL_PER_NO_GPS_EVIDENCE' using errcode = '22023';
    end if;
  end if;

  update public.delivery_sessions
  set status = 'cancelled',
      -- p_ended_at NULL resta NULL: MAI sostituito con now() come fa
      -- invece gps_transition_session('cancel'). Questa e' la differenza
      -- che giustifica l'esistenza di questa RPC.
      ended_at = p_ended_at,
      -- updated_at riflette QUANDO l'admin ha fatto il recovery, non
      -- quando il turno e' realmente finito: corretto che sia now().
      updated_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'recovery_reason', coalesce(p_reason, 'stale_session_recovery'),
        'recovered_by_admin', v_uid,
        'recovered_at', now(),
        'previous_status', v_session.status,
        'historical_ended_at_source', coalesce(
          p_ended_at_source,
          case when p_ended_at is not null then 'admin_override' else 'no_gps_evidence' end
        )
      )
  where id = p_session_id
  returning * into v_session;

  insert into public.gps_operator_audit_log (
    operator_id, action, campaign_id, assignment_id, session_id, context
  ) values (
    v_uid, 'session_recovered', v_session.campaign_id, v_session.assignment_id, v_session.id,
    jsonb_build_object('ended_at', p_ended_at, 'ended_at_source', p_ended_at_source, 'reason', p_reason)
  );

  return v_session;
end;
$$;

ALTER FUNCTION "public"."gps_recover_abandoned_session"("uuid", timestamptz, "text", "text", "text") OWNER TO "postgres";

-- Solo authenticated puo' anche solo tentare la chiamata (il controllo
-- effettivo del ruolo admin avviene dentro la funzione, come per tutte le
-- altre RPC gps_* del progetto). Nessun accesso anon: questa e' un'azione
-- amministrativa, non un'operazione driver.
--
-- REVOKE ALL FROM PUBLIC non basta da solo: i privilegi di default dello
-- schema Supabase concedono EXECUTE ad anon/authenticated su ogni nuova
-- funzione public (verificato live: senza questa riga esplicita, anon
-- risultava comunque con EXECUTE nonostante il REVOKE FROM PUBLIC sopra).
-- Serve un REVOKE esplicito e diretto dal ruolo anon.
REVOKE ALL ON FUNCTION "public"."gps_recover_abandoned_session"("uuid", timestamptz, "text", "text", "text") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."gps_recover_abandoned_session"("uuid", timestamptz, "text", "text", "text") FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."gps_recover_abandoned_session"("uuid", timestamptz, "text", "text", "text") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."gps_recover_abandoned_session"("uuid", timestamptz, "text", "text", "text") TO "service_role";
