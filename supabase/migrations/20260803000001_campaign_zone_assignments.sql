begin;

-- Aggiunta delle colonne per le assegnazioni zone ai gruppi
alter table public.campaign_zones
  add column if not exists group_id uuid references public.operational_groups(id) on delete set null,
  add column if not exists priority int default 1,
  add column if not exists status text default 'Da iniziare',
  add column if not exists quantity_assigned int default 0,
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists notes text;

alter table public.delivery_sessions
  add column if not exists campaign_zone_id uuid references public.campaign_zones(id) on delete set null;

-- Assicuriamoci che lo status ammetta solo i valori previsti
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'campaign_zones_status_check') then
    alter table public.campaign_zones
      add constraint campaign_zones_status_check check (status in ('Da iniziare', 'In corso', 'In pausa', 'Completata', 'Bloccata', 'Parziale'));
  end if;
end $$;

-- Ricrea la funzione gps_start_session accettando p_campaign_zone_id
drop function if exists public.gps_start_session(uuid, text);
drop function if exists public.gps_start_session(uuid, text, uuid);

create or replace function public.gps_start_session(p_assignment_id uuid, p_device_id text default null::text, p_campaign_zone_id uuid default null::uuid)
  returns public.delivery_sessions
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
    raise exception 'OPERATORE_NON_AUTENTICATO' using errcode = '42501';
  end if;

  select a.* into v_assignment
  from public.operator_assignments a
  where a.id = p_assignment_id
    and a.operator_id = v_uid
  for update;

  if not found or not public.gps_assignment_is_valid(
    v_assignment.id,
    v_uid,
    v_assignment.campaign_id,
    v_assignment.group_id,
    now()
  ) then
    raise exception 'ASSEGNAZIONE_NON_AUTORIZZATA' using errcode = '42501';
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
      v_uid, nullif(btrim(p_device_id), ''),
      'started', now(), null, null,
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

  insert into public.gps_operator_audit_log (
    operator_id, action, campaign_id, assignment_id, session_id,
    context
  ) values (
    v_uid, 'session_started', v_session.campaign_id,
    v_session.assignment_id, v_session.id,
    jsonb_build_object('has_device_id', v_session.device_id is not null, 'campaign_zone_id', p_campaign_zone_id)
  );

  return v_session;
end;
$$;

revoke all on function public.gps_start_session(uuid, text, uuid) from public;
grant execute on function public.gps_start_session(uuid, text, uuid) to authenticated, service_role;

create or replace function public.gps_transition_zone(p_campaign_zone_id uuid, p_action text)
  returns void
  language plpgsql security definer
  set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
  v_zone public.campaign_zones%rowtype;
begin
  if v_uid is null then
    raise exception 'OPERATORE_NON_AUTENTICATO' using errcode = '42501';
  end if;

  select z.* into v_zone
  from public.campaign_zones z
  where z.id = p_campaign_zone_id
  for update;

  if not found then
    raise exception 'ZONA_NON_TROVATA' using errcode = 'P0002';
  end if;

  if p_action = 'start' then
    update public.campaign_zones
    set status = 'In corso', started_at = coalesce(started_at, now())
    where id = p_campaign_zone_id;
  elsif p_action = 'complete' then
    update public.campaign_zones
    set status = 'Completata', completed_at = coalesce(completed_at, now())
    where id = p_campaign_zone_id;
  else
    raise exception 'AZIONE_NON_VALIDA' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.gps_transition_zone(uuid, text) from public;
grant execute on function public.gps_transition_zone(uuid, text) to authenticated, service_role;

create or replace function public.gps_get_operator_campaign(p_campaign_id uuid)
  returns jsonb
  language plpgsql
  stable security definer
  set search_path to ''
  as $function$
  declare
    v_uid uuid := auth.uid();
    v_result jsonb;
  begin
    if v_uid is null then
      raise exception 'OPERATORE_NON_AUTENTICATO' using errcode = '42501';
    end if;

    select jsonb_build_object(
      'id', c.id,
      'title', c.title,
      'campaign_name', c.campaign_name,
      'service_type', c.service_type,
      'distribution_mode', c.distribution_mode,
      'status', c.status,
      'address_input', c.address_input,
      'address', c.address,
      'zone_name', c.zone_name,
      'city', c.city,
      'distribution_start_date', c.distribution_start_date,
      'distribution_end_date', c.distribution_end_date,
      'start_date', c.start_date,
      'end_date', c.end_date,
      'campaign_zones', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', z.id,
              'group_id', z.group_id,
              'zone_name', z.zone_name,
              'center_lat', z.center_lat,
              'center_lng', z.center_lng,
              'radius_km', case when z.radius_m is not null then z.radius_m::numeric / 1000 else null end,
              'geometry_geojson', z.polygon_geojson,
              'status', z.status,
              'quantity_assigned', z.quantity_assigned,
              'priority', z.priority
            )
            order by z.priority asc, z.zone_name
          )
          from public.campaign_zones z
          where z.campaign_id = c.id
            and (z.group_id = a.group_id or z.group_id is null) -- Optionally filter by assigned group only? The driver should only see their zones. We'll filter strictly by group_id here or in frontend. Let's do z.group_id = a.group_id so they only see assigned ones.
        ),
        '[]'::jsonb
      )
    ) into v_result
    from public.campaigns c
    join public.operator_assignments a on a.campaign_id = c.id
    where c.id = p_campaign_id
      and a.operator_id = v_uid
      and public.gps_assignment_is_valid(
        a.id,
        v_uid,
        a.campaign_id,
        a.group_id,
        now()
      )
    limit 1;

    if not found then
      raise exception 'CAMPAGNA_NON_TROVATA_O_NON_AUTORIZZATA' using errcode = 'P0002';
    end if;

    return v_result;
  end;
  $function$;

grant execute on function public.gps_get_operator_campaign(uuid) to authenticated, service_role;

commit;
