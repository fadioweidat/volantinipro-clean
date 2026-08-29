-- GPS — GROUP SHARED TRACKS (app Driver).
--
-- PROPOSTA, NON APPLICATA in questo turno.
--
-- BUSINESS RULE
-- Operatori dello STESSO gruppo (operator_assignments.group_id) sulla STESSA
-- campagna devono vedere reciprocamente le tracce GPS, per coordinarsi (vie
-- gia' fatte, aree mancanti). Operatori di gruppi diversi NON si vedono.
-- La visibilita' condivisa delle tracce e' cosa DIVERSA dal controllo della
-- sessione: ogni operatore controlla (pause/resume/stop/GPS write) SOLO la
-- propria sessione — quello resta gestito da gps_transition_session(_v2) /
-- gps_insert_point(_v2), non toccati qui.
--
-- COSA FA
-- get_driver_group_tracking(p_assignment_id, p_access_token) -> jsonb:
--   {
--     sessions: [ { id, status, started_at, paused_at, ended_at,
--                   is_self boolean, display_label text } ],
--     points:   [ { session_id, lat, lng, recorded_at, accuracy } ]
--   }
-- SOLO sessioni con campaign_id + group_id dell'assignment del chiamante e
-- status in ('started','paused','completed'). display_label = "Operatore N"
-- (numerazione stabile per started_at); la propria sessione e' marcata
-- is_self=true e il frontend la mostra come "Tu".
--
-- SICUREZZA
-- * SECURITY DEFINER + search_path '' (come le altre RPC GPS).
-- * Autorizzazione: il chiamante deve avere un assignment VALIDO per
--   p_assignment_id (gps_assignment_is_valid) — stesso modello di
--   gps_start_session / gps_transition_session. Token o auth.uid().
-- * PAYLOAD SAFE: nessun driver_id, driver_name, driver_phone, device_id,
--   access_token, assignment_id, metadata. Solo cio' che serve alla mappa.
-- * NON e' "tutte le sessioni della campagna": il filtro group_id e'
--   obbligatorio e deriva dall'assignment del chiamante, non da un parametro.
-- * grant execute solo ad authenticated (il caso token passa comunque da
--   qui: l'anon key di Supabase esegue come 'authenticated' role sulle RPC
--   SECURITY DEFINER — stesso pattern di gps_start_session).
--
-- NON tocca: RLS, altre RPC, tabelle, dati, pricing, stampa, Resend,
-- pagamenti, Smart Pairing, geofence, coverage. Nessun cron/trigger.

begin;

create or replace function public.get_driver_group_tracking(
  p_assignment_id uuid,
  p_access_token text default null
) returns jsonb
  language plpgsql security definer
  set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
  v_assignment public.operator_assignments%rowtype;
  v_sessions jsonb;
  v_points jsonb;
begin
  if p_assignment_id is null then
    raise exception 'ASSEGNAZIONE_NON_AUTORIZZATA' using errcode = '42501';
  end if;

  if v_uid is null then
    if p_access_token is null then
      raise exception 'OPERATORE_NON_AUTENTICATO' using errcode = '42501';
    end if;
    select * into v_assignment
    from public.operator_assignments
    where id = p_assignment_id and access_token = p_access_token;
    if not found then
      raise exception 'OPERATORE_NON_AUTENTICATO' using errcode = '42501';
    end if;
    v_uid := v_assignment.operator_id;
  else
    select * into v_assignment
    from public.operator_assignments
    where id = p_assignment_id and operator_id = v_uid;
    if not found then
      raise exception 'ASSEGNAZIONE_NON_AUTORIZZATA' using errcode = '42501';
    end if;
  end if;

  -- Stesso controllo di validita' usato da tutte le RPC GPS Driver.
  if not public.gps_assignment_is_valid(
    v_assignment.id, v_uid, v_assignment.campaign_id, v_assignment.group_id, now()
  ) then
    raise exception 'ASSEGNAZIONE_NON_AUTORIZZATA' using errcode = '42501';
  end if;

  if v_assignment.group_id is null then
    -- Nessun gruppo: l'operatore vede solo la propria traccia (nessuna
    -- condivisione possibile). Ritorno vuoto -> il frontend mostra solo "Tu".
    return jsonb_build_object('sessions', '[]'::jsonb, 'points', '[]'::jsonb);
  end if;

  with grp as (
    select
      s.id,
      s.status,
      s.started_at,
      s.paused_at,
      s.ended_at,
      (s.driver_id = v_uid) as is_self,
      row_number() over (order by s.started_at asc nulls last, s.created_at asc) as n
    from public.delivery_sessions s
    where s.campaign_id = v_assignment.campaign_id
      and s.group_id = v_assignment.group_id
      and s.status in ('started', 'paused', 'completed')
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id', g.id,
      'status', g.status,
      'started_at', g.started_at,
      'paused_at', g.paused_at,
      'ended_at', g.ended_at,
      'is_self', g.is_self,
      'display_label', case when g.is_self then 'Tu' else 'Operatore ' || g.n end
    ) order by g.n), '[]'::jsonb)
  into v_sessions
  from grp g;

  select
    coalesce(jsonb_agg(jsonb_build_object(
      'session_id', p.session_id,
      'lat', p.lat,
      'lng', p.lng,
      'recorded_at', p.recorded_at,
      'accuracy', p.accuracy
    ) order by p.recorded_at asc), '[]'::jsonb)
  into v_points
  from public.gps_tracking_points p
  where p.session_id in (
    select s.id from public.delivery_sessions s
    where s.campaign_id = v_assignment.campaign_id
      and s.group_id = v_assignment.group_id
      and s.status in ('started', 'paused', 'completed')
  );

  return jsonb_build_object('sessions', v_sessions, 'points', v_points);
end;
$$;

alter function public.get_driver_group_tracking(uuid, text) owner to postgres;
revoke all on function public.get_driver_group_tracking(uuid, text) from public, anon;
grant execute on function public.get_driver_group_tracking(uuid, text) to authenticated;

commit;
