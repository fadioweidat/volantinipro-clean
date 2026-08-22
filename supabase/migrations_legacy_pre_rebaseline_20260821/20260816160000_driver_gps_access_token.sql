begin;

-- FIX FINALE DRIVER SENZA LOGIN — access token per-assignment (2026-08-16).
--
-- Il link Driver pubblico (/driver/assignment/{id}) legge gia' il programma
-- senza login (get_public_driver_assignment, migrazione precedente). Le
-- operazioni di SCRITTURA (conferma presa in carico, Start GPS, invio punti,
-- pausa/riprendi/termina sessione, cambio/completamento zona) restano
-- authenticated-only: richiedono auth.uid(), che un link pubblico non ha.
--
-- Invece di aprire queste RPC ad anon "indiscriminatamente" (esplicitamente
-- vietato), ogni assignment riceve un access_token dedicato ad alta entropia
-- (32 byte casuali, mai l'UUID stesso — l'UUID resta il puntatore alla riga,
-- il token e' il segreto che autorizza le scritture). Il link WhatsApp lo
-- incorpora come query string (?access=...). Ogni RPC di scrittura, quando
-- auth.uid() e' assente, verifica il token contro l'assignment (o contro
-- l'assignment collegato alla sessione/zona coinvolta) e, se valido, risolve
-- l'operatore reale (v_assignment.operator_id) come identita' effettiva:
-- tutta la logica di autorizzazione esistente (gps_assignment_is_valid,
-- ownership, finestra temporale, stato operatore/campagna) resta la STESSA,
-- semplicemente eseguita con quell'identita' invece che con auth.uid() letto
-- da una sessione. Nessuna RPC diventa "anonima" in senso lasco: un token
-- sbagliato o mancante nega esattamente come oggi nega un auth.uid() nullo.

-- ── 1) access_token per assignment ──────────────────────────────────────────
alter table public.operator_assignments
  add column if not exists access_token text;

update public.operator_assignments
set access_token = encode(gen_random_bytes(32), 'hex')
where access_token is null;

alter table public.operator_assignments
  alter column access_token set default encode(gen_random_bytes(32), 'hex'),
  alter column access_token set not null;

create unique index if not exists operator_assignments_access_token_key
  on public.operator_assignments (access_token);

-- ── 2) log_assignment_event — conferma presa in carico + evento apertura ───
drop function if exists public.log_assignment_event(uuid, text);

create function public.log_assignment_event(
  p_assignment_id uuid,
  p_action text,
  p_access_token text default null
) returns void
  language plpgsql security definer
  set search_path to ''
  as $$
declare
  v_uid uuid := auth.uid();
  v_assignment public.operator_assignments%rowtype;
  v_is_admin boolean := public.gps_is_admin();
begin
  if p_action not in ('assignment_program_sent', 'assignment_program_opened', 'assignment_program_confirmed') then
    raise exception 'INVALID_ACTION';
  end if;

  select * into v_assignment from public.operator_assignments where id = p_assignment_id;
  if not found then raise exception 'NOT_FOUND'; end if;

  if v_uid is null then
    if p_access_token is null or v_assignment.access_token <> p_access_token then
      raise exception 'UNAUTHORIZED';
    end if;
    v_uid := v_assignment.operator_id;
  end if;

  if p_action = 'assignment_program_sent' and not v_is_admin then raise exception 'UNAUTHORIZED'; end if;
  if p_action = 'assignment_program_opened' and v_assignment.operator_id <> v_uid then raise exception 'UNAUTHORIZED'; end if;

  if p_action = 'assignment_program_confirmed' then
    if v_assignment.operator_id <> v_uid then raise exception 'UNAUTHORIZED'; end if;
    if v_assignment.status <> 'active'
       or (v_assignment.starts_at is not null and v_assignment.starts_at > now())
       or (v_assignment.ends_at is not null and v_assignment.ends_at <= now()) then
      raise exception 'ASSIGNMENT_NOT_ACTIVE';
    end if;
    if not exists (
      select 1
      from public.assignment_event_log opened
      where opened.assignment_id = p_assignment_id
        and opened.event_type = 'assignment_program_opened'
    ) then raise exception 'PROGRAM_NOT_OPENED'; end if;

    insert into public.assignment_event_log (assignment_id, operator_id, campaign_id, event_type)
    values (p_assignment_id, v_assignment.operator_id, v_assignment.campaign_id, p_action)
    on conflict do nothing;
    return;
  end if;

  if exists (
    select 1 from public.assignment_event_log
    where assignment_id = p_assignment_id
      and event_type = p_action
      and created_at > now() - interval '5 minutes'
  ) then return; end if;

  insert into public.assignment_event_log (assignment_id, operator_id, campaign_id, event_type)
  values (p_assignment_id, v_assignment.operator_id, v_assignment.campaign_id, p_action);
end;
$$;

revoke all on function public.log_assignment_event(uuid, text, text) from public;
grant execute on function public.log_assignment_event(uuid, text, text) to anon, authenticated, service_role;

-- ── 3) gps_start_session ────────────────────────────────────────────────────
drop function if exists public.gps_start_session(uuid, text, uuid);

create function public.gps_start_session(
  p_assignment_id uuid,
  p_device_id text default null,
  p_campaign_zone_id uuid default null,
  p_access_token text default null
) returns delivery_sessions
  language plpgsql security definer
  set search_path to ''
  as $$
declare
  v_uid uuid := auth.uid();
  v_assignment public.operator_assignments%rowtype;
  v_session public.delivery_sessions%rowtype;
  v_group_name text;
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

revoke all on function public.gps_start_session(uuid, text, uuid, text) from public;
grant execute on function public.gps_start_session(uuid, text, uuid, text) to anon, authenticated, service_role;

-- ── 4) gps_insert_point ──────────────────────────────────────────────────────
drop function if exists public.gps_insert_point(uuid, float8, float8, float8, float8, float8, timestamptz);

create function public.gps_insert_point(
  p_session_id uuid,
  p_lat double precision,
  p_lng double precision,
  p_accuracy double precision default null,
  p_speed double precision default null,
  p_heading double precision default null,
  p_recorded_at timestamp with time zone default now(),
  p_access_token text default null
) returns gps_tracking_points
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
    and s.status in ('started', 'paused')
    and s.assignment_id is not null
    and public.gps_assignment_is_valid(
      s.assignment_id, v_uid, s.campaign_id, s.group_id, now()
    );

  if not found then
    raise exception 'SESSIONE_NON_AUTORIZZATA' using errcode = '42501';
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

revoke all on function public.gps_insert_point(uuid, float8, float8, float8, float8, float8, timestamptz, text) from public;
grant execute on function public.gps_insert_point(uuid, float8, float8, float8, float8, float8, timestamptz, text) to anon, authenticated, service_role;

-- ── 5) gps_transition_zone ───────────────────────────────────────────────────
drop function if exists public.gps_transition_zone(uuid, text);

create function public.gps_transition_zone(
  p_campaign_zone_id uuid,
  p_action text,
  p_access_token text default null,
  p_assignment_id uuid default null
) returns delivery_sessions
  language plpgsql security definer
  set search_path to ''
  as $$
declare
  v_uid uuid := auth.uid();
  v_zone public.campaign_zones%rowtype;
  v_session public.delivery_sessions%rowtype;
  v_previous_zone_id uuid;
begin
  if v_uid is null then
    if p_access_token is null or p_assignment_id is null then
      raise exception 'OPERATORE_NON_AUTENTICATO' using errcode = '42501';
    end if;
    select operator_id into v_uid
    from public.operator_assignments
    where id = p_assignment_id and access_token = p_access_token;
    if v_uid is null then
      raise exception 'OPERATORE_NON_AUTENTICATO' using errcode = '42501';
    end if;
  end if;

  select z.* into v_zone
  from public.campaign_zones z
  where z.id = p_campaign_zone_id
  for update;

  if not found then
    raise exception 'ZONA_NON_TROVATA' using errcode = 'P0002';
  end if;

  select s.* into v_session
  from public.delivery_sessions s
  where s.driver_id = v_uid
    and s.status in ('started', 'paused')
    and s.campaign_id = v_zone.campaign_id
    and s.group_id = v_zone.group_id
    and s.assignment_id is not null
    and public.gps_assignment_is_valid(
      s.assignment_id, v_uid, s.campaign_id, s.group_id, now()
    )
  order by s.started_at desc nulls last, s.created_at desc
  limit 1
  for update;

  if not found then
    raise exception 'ZONA_NON_AUTORIZZATA' using errcode = '42501';
  end if;

  v_previous_zone_id := v_session.campaign_zone_id;

  if p_action = 'start' then
    if v_previous_zone_id is distinct from p_campaign_zone_id then
      update public.campaign_zones
      set status = 'Completata', completed_at = coalesce(completed_at, now()), updated_at = now()
      where id = v_previous_zone_id
        and campaign_id = v_session.campaign_id
        and group_id = v_session.group_id;
    end if;

    update public.campaign_zones
    set status = 'In corso', started_at = coalesce(started_at, now()), completed_at = null, updated_at = now()
    where id = p_campaign_zone_id;

    update public.delivery_sessions
    set campaign_zone_id = p_campaign_zone_id,
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('campaign_zone_id', p_campaign_zone_id),
        updated_at = now()
    where id = v_session.id
    returning * into v_session;
  elsif p_action = 'complete' then
    if v_previous_zone_id is distinct from p_campaign_zone_id then
      raise exception 'ZONA_SESSIONE_NON_CORRISPONDENTE' using errcode = '42501';
    end if;

    update public.campaign_zones
    set status = 'Completata', completed_at = coalesce(completed_at, now()), updated_at = now()
    where id = p_campaign_zone_id;
  else
    raise exception 'AZIONE_NON_VALIDA' using errcode = '22023';
  end if;

  insert into public.gps_operator_audit_log (
    operator_id, action, campaign_id, assignment_id, session_id, context
  ) values (
    v_uid,
    case when p_action = 'start' then 'zone_started' else 'zone_completed' end,
    v_session.campaign_id, v_session.assignment_id, v_session.id,
    jsonb_build_object('previous_zone_id', v_previous_zone_id, 'campaign_zone_id', p_campaign_zone_id)
  );

  return v_session;
end;
$$;

revoke all on function public.gps_transition_zone(uuid, text, text, uuid) from public;
grant execute on function public.gps_transition_zone(uuid, text, text, uuid) to anon, authenticated, service_role;

-- ── 6) gps_transition_session (pause/resume/complete/cancel) ────────────────
drop function if exists public.gps_transition_session(uuid, text);

create function public.gps_transition_session(
  p_session_id uuid,
  p_action text,
  p_access_token text default null
) returns delivery_sessions
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

    if not public.gps_assignment_is_valid(
      v_session.assignment_id, v_uid, v_session.campaign_id,
      v_session.group_id, now()
    ) then
      select status, revoked_at into v_assignment_status, v_revoked_at
      from public.operator_assignments
      where id = v_session.assignment_id;

      if v_assignment_status = 'revoked' or v_revoked_at is not null then
        if p_action not in ('complete', 'cancel') then
          raise exception 'ASSEGNAZIONE_REVOCATA: solo il termine della sessione è consentito.'
            using errcode = '42501';
        end if
        -- else: fallthrough consentito, l'assegnazione è revocata ma
        -- l'azione richiesta è la sola terminazione ammessa.
        ;
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

revoke all on function public.gps_transition_session(uuid, text, text) from public;
grant execute on function public.gps_transition_session(uuid, text, text) to anon, authenticated, service_role;

-- ── 7) gps_heartbeat_session ─────────────────────────────────────────────────
drop function if exists public.gps_heartbeat_session(uuid);

create function public.gps_heartbeat_session(
  p_session_id uuid,
  p_access_token text default null
) returns delivery_sessions
  language plpgsql security definer
  set search_path to ''
  as $$
declare
  v_uid uuid := auth.uid();
  v_session public.delivery_sessions%rowtype;
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
  from public.delivery_sessions s
  where s.id = p_session_id
    and s.driver_id = v_uid
    and s.status in ('started', 'paused')
    and s.assignment_id is not null
    and public.gps_assignment_is_valid(
      s.assignment_id, v_uid, s.campaign_id, s.group_id, now()
    )
  for update;

  if not found then
    raise exception 'SESSIONE_NON_AUTORIZZATA' using errcode = '42501';
  end if;

  update public.delivery_sessions
    set updated_at = now()
    where id = p_session_id returning * into v_session;
  return v_session;
end;
$$;

revoke all on function public.gps_heartbeat_session(uuid, text) from public;
grant execute on function public.gps_heartbeat_session(uuid, text) to anon, authenticated, service_role;

commit;
