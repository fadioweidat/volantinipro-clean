-- GPS — DEVICE OWNERSHIP + BLOCCO GPS IN PAUSA (server-side), versione _v2.
--
-- PROPOSTA, NON APPLICATA in questo turno.
--
-- PERCHE' SERVE
-- Oggi lo stesso link Driver (operator_assignments.access_token) aperto su due
-- dispositivi lascia entrambi scrivere/riprendere la STESSA delivery_session:
--   * gps_insert_point / gps_transition_session / get_active_driver_session
--     identificano la sessione con session_id + driver_id (o token->operator_id),
--     MAI con il dispositivo. delivery_sessions.device_id viene salvato da
--     gps_start_session ma non e' mai verificato.
--   * gps_insert_point accetta status IN ('started','paused') -> un client
--     manipolato puo' inviare punti anche a sessione IN PAUSA.
--
-- SCELTA DI COMPATIBILITA' (zero-downtime, nessuna finestra di rottura):
-- NON si fa DROP+CREATE delle 3 RPC esistenti — aggiungere un parametro
-- opzionale in coda a una funzione con soli parametri DEFAULT crea, in
-- PostgREST, un'ambiguita' di overload (PGRST203) che romperebbe le chiamate
-- attuali. Si creano invece 3 NUOVE funzioni con suffisso _v2:
--     gps_insert_point_v2(..., p_access_token, p_device_id)
--     gps_transition_session_v2(p_session_id, p_action, p_access_token, p_device_id)
--     get_active_driver_session_v2(p_assignment_id, p_access_token, p_device_id)
-- Le originali (v1) restano INVARIATE. Il frontend chiama _v2 e ricade
-- automaticamente su v1 se _v2 non esiste ancora (callGpsRpcV2Fallback in
-- src/lib/services/gps-api.js) -> il frontend puo' essere deployato in
-- qualsiasi ordine rispetto a questa migrazione.
--
-- ERROR CODES coerenti con il resto del progetto (errcode 42501):
--   PAUSED_SESSION | SESSION_COMPLETED | DEVICE_MISMATCH
--
-- SECURITY DEFINER + search_path '' come le v1. GRANT execute solo ad
-- authenticated (come le v1). RLS non aggirata: le _v2 fanno gli STESSI
-- controlli di autorizzazione delle v1 (driver_id/token/assignment), piu' il
-- controllo device. L'Admin non e' coinvolto qui (queste RPC sono Driver-only,
-- come le v1); l'Admin usa gps_recover_abandoned_session / gps_admin_unlock_device.
--
-- NON tocca: pricing, stampa, Resend, pagamenti, Smart Pairing, geofence,
-- coverage, RLS, dati esistenti, RPC v1. Nessun cron/trigger.

begin;

-- ---------------------------------------------------------------------------
-- 1. gps_insert_point_v2
-- ---------------------------------------------------------------------------
create or replace function public.gps_insert_point_v2(
  p_session_id uuid,
  p_lat double precision,
  p_lng double precision,
  p_accuracy double precision default null,
  p_speed double precision default null,
  p_heading double precision default null,
  p_recorded_at timestamptz default now(),
  p_access_token text default null,
  p_device_id text default null
) returns public.gps_tracking_points
  language plpgsql security definer
  set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
  v_session public.delivery_sessions%rowtype;
  v_point public.gps_tracking_points%rowtype;
begin
  if v_uid is null then
    if p_access_token is null then
      raise exception 'OPERATORE_NON_AUTENTICATO' using errcode = '42501';
    end if;
    select a.operator_id into v_uid
    from public.delivery_sessions s
    join public.operator_assignments a on a.id = s.assignment_id
    where s.id = p_session_id and a.access_token = p_access_token;
    if v_uid is null then
      raise exception 'OPERATORE_NON_AUTENTICATO' using errcode = '42501';
    end if;
  end if;

  if p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then
    raise exception 'COORDINATE_NON_VALIDE' using errcode = '22023';
  end if;

  select * into v_session
  from public.delivery_sessions s
  where s.id = p_session_id
    and s.driver_id = v_uid
    and s.assignment_id is not null;

  if not found then
    raise exception 'SESSIONE_NON_AUTORIZZATA' using errcode = '42501';
  end if;

  if v_session.status in ('completed', 'cancelled') then
    raise exception 'SESSION_COMPLETED' using errcode = '42501';
  end if;
  if v_session.status = 'paused' then
    raise exception 'PAUSED_SESSION' using errcode = '42501';
  end if;
  if v_session.status <> 'started' then
    raise exception 'SESSIONE_NON_AUTORIZZATA' using errcode = '42501';
  end if;

  if not public.gps_assignment_is_valid(
    v_session.assignment_id, v_uid, v_session.campaign_id, v_session.group_id, now()
  ) then
    raise exception 'SESSIONE_NON_AUTORIZZATA' using errcode = '42501';
  end if;

  -- DEVICE OWNERSHIP: se il chiamante dichiara un device e la sessione ne ha
  -- gia' uno diverso registrato, e' un secondo dispositivo sullo stesso link.
  if p_device_id is not null
     and v_session.device_id is not null
     and v_session.device_id <> p_device_id then
    raise exception 'DEVICE_MISMATCH' using errcode = '42501';
  end if;

  insert into public.gps_tracking_points (
    campaign_id, session_id, driver_id, lat, lng,
    accuracy, speed, heading, recorded_at
  ) values (
    v_session.campaign_id, v_session.id, v_uid, p_lat, p_lng,
    p_accuracy, p_speed, p_heading, coalesce(p_recorded_at, now())
  ) returning * into v_point;

  return v_point;
end;
$$;

alter function public.gps_insert_point_v2(uuid, double precision, double precision, double precision, double precision, double precision, timestamptz, text, text) owner to postgres;
revoke all on function public.gps_insert_point_v2(uuid, double precision, double precision, double precision, double precision, double precision, timestamptz, text, text) from public, anon;
grant execute on function public.gps_insert_point_v2(uuid, double precision, double precision, double precision, double precision, double precision, timestamptz, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. gps_transition_session_v2
-- ---------------------------------------------------------------------------
create or replace function public.gps_transition_session_v2(
  p_session_id uuid,
  p_action text,
  p_access_token text default null,
  p_device_id text default null
) returns public.delivery_sessions
  language plpgsql security definer
  set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
  v_session public.delivery_sessions%rowtype;
  v_is_admin boolean := public.gps_is_admin();
  v_assignment_status text;
  v_revoked_at timestamptz;
begin
  if v_uid is null then
    if p_access_token is null then
      raise exception 'OPERATORE_NON_AUTENTICATO' using errcode = '42501';
    end if;
    select a.operator_id into v_uid
    from public.delivery_sessions s
    join public.operator_assignments a on a.id = s.assignment_id
    where s.id = p_session_id and a.access_token = p_access_token;
    if v_uid is null then
      raise exception 'OPERATORE_NON_AUTENTICATO' using errcode = '42501';
    end if;
  end if;

  select * into v_session
  from public.delivery_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'SESSIONE_NON_TROVATA' using errcode = 'P0002';
  end if;

  if not v_is_admin then
    if v_session.driver_id <> v_uid or v_session.assignment_id is null then
      raise exception 'SESSIONE_NON_AUTORIZZATA' using errcode = '42501';
    end if;

    -- DEVICE OWNERSHIP: pause/resume/stop consentiti solo dal dispositivo che
    -- possiede la sessione. L'Admin (v_is_admin) bypassa sempre — coerente
    -- con gps_transition_session v1 e gps_recover_abandoned_session.
    if p_device_id is not null
       and v_session.device_id is not null
       and v_session.device_id <> p_device_id then
      raise exception 'DEVICE_MISMATCH' using errcode = '42501';
    end if;

    if not public.gps_assignment_is_valid(
      v_session.assignment_id, v_uid, v_session.campaign_id,
      v_session.group_id, now()
    ) then
      select status, revoked_at into v_assignment_status, v_revoked_at
      from public.operator_assignments
      where id = v_session.assignment_id;

      if v_assignment_status = 'revoked' or v_revoked_at is not null then
        if p_action not in ('complete', 'cancel') then
          raise exception 'ASSEGNAZIONE_REVOCATA: solo il termine della sessione e'' consentito.'
            using errcode = '42501';
        end if;
      else
        raise exception 'SESSIONE_NON_AUTORIZZATA' using errcode = '42501';
      end if;
    end if;
  end if;

  if p_action = 'pause' and v_session.status = 'started' then
    update public.delivery_sessions
      set status = 'paused', paused_at = now(), updated_at = now()
      where id = p_session_id returning * into v_session;
  elsif p_action = 'resume' and v_session.status = 'paused' then
    update public.delivery_sessions
      set status = 'started', paused_at = null, updated_at = now()
      where id = p_session_id returning * into v_session;
  elsif p_action = 'complete' and v_session.status in ('started', 'paused') then
    update public.delivery_sessions
      set status = 'completed', ended_at = now(), updated_at = now()
      where id = p_session_id returning * into v_session;
  elsif p_action = 'cancel' and v_session.status in ('started', 'paused') then
    update public.delivery_sessions
      set status = 'cancelled',
          ended_at = coalesce(ended_at, now()),
          updated_at = now(),
          metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
             'closed_by_admin', v_is_admin,
             'closed_at', now(),
             'previous_status', v_session.status,
             'reason', 'stale_session_recovery'
          )
      where id = p_session_id returning * into v_session;
  else
    raise exception 'TRANSIZIONE_SESSIONE_NON_VALIDA' using errcode = '22023';
  end if;

  insert into public.gps_operator_audit_log (
    operator_id, action, campaign_id, assignment_id, session_id
  ) values (
    v_uid, 'session_' || p_action, v_session.campaign_id,
    v_session.assignment_id, v_session.id
  );

  return v_session;
end;
$$;

alter function public.gps_transition_session_v2(uuid, text, text, text) owner to postgres;
revoke all on function public.gps_transition_session_v2(uuid, text, text, text) from public, anon;
grant execute on function public.gps_transition_session_v2(uuid, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. get_active_driver_session_v2 (+ blocco device_mismatch)
-- ---------------------------------------------------------------------------
create or replace function public.get_active_driver_session_v2(
  p_assignment_id uuid,
  p_access_token text default null,
  p_device_id text default null
) returns jsonb
  language plpgsql security definer
  set search_path to 'public', 'pg_temp'
as $$
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

  -- DEVICE OWNERSHIP: se la sessione ha un device diverso, NON restituirla —
  -- il secondo dispositivo non deve poterla adottare/riprendere.
  if p_device_id is not null
     and v_session.device_id is not null
     and v_session.device_id <> p_device_id then
    return jsonb_build_object('session', null, 'blocked', 'device_mismatch');
  end if;

  select max(recorded_at) into v_last_gps
  from public.gps_tracking_points
  where session_id = v_session.id;

  return jsonb_build_object('session', to_jsonb(v_session), 'last_gps_recorded_at', v_last_gps);
end;
$$;

alter function public.get_active_driver_session_v2(uuid, text, text) owner to postgres;
revoke all on function public.get_active_driver_session_v2(uuid, text, text) from public, anon;
grant execute on function public.get_active_driver_session_v2(uuid, text, text) to authenticated;

commit;
