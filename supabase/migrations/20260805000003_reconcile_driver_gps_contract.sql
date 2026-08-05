begin;

-- gps_calculate_zone_coverage references campaign_zones.geometry. On databases
-- where campaign_zones predated migration 035, CREATE TABLE IF NOT EXISTS did
-- not add that column and the RPC failed at runtime with SQLSTATE 42703.
alter table public.campaign_zones
  add column if not exists geometry public.geometry(Geometry, 4326);

do $$
begin
  update public.campaign_zones
  set geometry = public.ST_SetSRID(public.ST_GeomFromGeoJSON(polygon_geojson), 4326)
  where geometry is null
    and polygon_geojson is not null;
exception when others then
  raise notice 'Existing polygon_geojson backfill skipped: %', sqlerrm;
end;
$$;

create or replace function public.gps_start_session(
  p_assignment_id uuid,
  p_device_id text default null::text,
  p_campaign_zone_id uuid default null::uuid
) returns public.delivery_sessions
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

revoke all on function public.gps_start_session(uuid, text, uuid) from public;
grant execute on function public.gps_start_session(uuid, text, uuid) to authenticated, service_role;

commit;
