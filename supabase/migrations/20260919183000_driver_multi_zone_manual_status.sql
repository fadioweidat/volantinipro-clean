-- Multiple operational zones can be started/completed manually by a driver/supervisor.
-- GPS session ownership remains independent and unchanged.
begin;

create or replace function public.driver_set_zone_work_status(
  p_assignment_id uuid,
  p_zone_id uuid,
  p_status text,
  p_access_token text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_assignment public.operator_assignments%rowtype;
  v_zone public.campaign_zones%rowtype;
begin
  if p_assignment_id is null or p_zone_id is null then
    raise exception 'PARAMETRI_MANCANTI' using errcode = '22023';
  end if;

  if p_status not in ('In corso', 'Completata') then
    raise exception 'STATO_ZONA_NON_VALIDO' using errcode = '22023';
  end if;

  if p_access_token is not null then
    select * into v_assignment
    from public.operator_assignments
    where id = p_assignment_id
      and access_token = p_access_token
      and status = 'active'
      and revoked_at is null
      and starts_at <= now()
      and (ends_at is null or ends_at > now());
  elsif v_uid is not null then
    select * into v_assignment
    from public.operator_assignments
    where id = p_assignment_id
      and operator_id = v_uid
      and status = 'active'
      and revoked_at is null
      and starts_at <= now()
      and (ends_at is null or ends_at > now());
  end if;

  if not found then
    raise exception 'ASSEGNAZIONE_NON_AUTORIZZATA' using errcode = '42501';
  end if;

  select z.* into v_zone
  from public.campaign_zones z
  where z.id = p_zone_id
    and z.campaign_id = v_assignment.campaign_id
    and exists (
      select 1
      from public.operator_assignment_zones oaz
      where oaz.assignment_id = v_assignment.id
        and oaz.zone_id = z.id
    )
  for update;

  if not found then
    raise exception 'ZONA_NON_AUTORIZZATA' using errcode = '42501';
  end if;

  if p_status = 'In corso' then
    update public.campaign_zones
    set status = 'In corso',
        started_at = coalesce(started_at, now()),
        completed_at = null,
        updated_at = now()
    where id = p_zone_id
    returning * into v_zone;
  else
    update public.campaign_zones
    set status = 'Completata',
        completed_at = coalesce(completed_at, now()),
        updated_at = now()
    where id = p_zone_id
    returning * into v_zone;
  end if;

  insert into public.gps_operator_audit_log
    (operator_id, action, campaign_id, assignment_id, session_id, context)
  values (
    coalesce(v_assignment.operator_id, v_assignment.id),
    case when p_status = 'In corso' then 'zone_work_started' else 'zone_work_completed' end,
    v_assignment.campaign_id,
    v_assignment.id,
    null,
    jsonb_build_object('campaign_zone_id', p_zone_id, 'status', p_status, 'source', 'driver_manual_zone_control')
  );

  return jsonb_build_object(
    'id', v_zone.id,
    'zone_name', v_zone.zone_name,
    'status', v_zone.status,
    'started_at', v_zone.started_at,
    'completed_at', v_zone.completed_at
  );
end;
$$;

revoke all on function public.driver_set_zone_work_status(uuid, uuid, text, text) from public;
grant execute on function public.driver_set_zone_work_status(uuid, uuid, text, text) to anon, authenticated;

commit;
