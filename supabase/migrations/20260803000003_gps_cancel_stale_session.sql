-- migration to add 'cancel' action to gps_transition_session

CREATE OR REPLACE FUNCTION public.gps_transition_session(p_session_id uuid, p_action text)
 RETURNS delivery_sessions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_session public.delivery_sessions%rowtype;
  v_is_admin boolean := public.gps_is_admin();
begin
  if v_uid is null then
    raise exception 'OPERATORE_NON_AUTENTICATO' using errcode = '42501';
  end if;

  select * into v_session
  from public.delivery_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'SESSIONE_NON_TROVATA' using errcode = 'P0002';
  end if;

  if not v_is_admin and (
    v_session.driver_id <> v_uid
    or v_session.assignment_id is null
    or not public.gps_assignment_is_valid(
      v_session.assignment_id, v_uid, v_session.campaign_id,
      v_session.group_id, now()
    )
  ) then
    raise exception 'SESSIONE_NON_AUTORIZZATA' using errcode = '42501';
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
$function$;
