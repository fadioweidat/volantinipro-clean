begin;

drop function if exists public.gps_transition_zone(uuid, text);

create or replace function public.gps_transition_zone(p_campaign_zone_id uuid, p_action text)
  returns public.delivery_sessions
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
    raise exception 'OPERATORE_NON_AUTENTICATO' using errcode = '42501';
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

revoke all on function public.gps_transition_zone(uuid, text) from public;
grant execute on function public.gps_transition_zone(uuid, text) to authenticated, service_role;

commit;
