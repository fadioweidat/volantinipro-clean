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

  -- FORZATURA CHIUSURA STALE SESSIONS:
  -- Se il driver ha già sessioni appese (started/paused), chiudile in automatico per evitare blocchi
  update public.delivery_sessions
  set status = 'completed',
      ended_at = now(),
      updated_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) || '{"chiusura_tecnica": "sessione chiusa automaticamente per avvio nuova sessione"}'::jsonb
  where driver_id = v_uid and status in ('started', 'paused');

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
