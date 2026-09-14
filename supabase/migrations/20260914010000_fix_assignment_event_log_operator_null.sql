BEGIN;

-- 1. Relax operator_id nullability in assignment_event_log
ALTER TABLE public.assignment_event_log ALTER COLUMN operator_id DROP NOT NULL;

-- 2. Update log_assignment_event RPC
CREATE OR REPLACE FUNCTION public.log_assignment_event(
  p_assignment_id uuid, p_action text, p_access_token text DEFAULT NULL::text
) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
declare
  v_uid uuid := auth.uid();
  v_assignment public.operator_assignments%rowtype;
  v_is_admin boolean := public.gps_is_admin();
  v_authorized boolean := false;
begin
  if p_action not in (
    'assignment_program_sent', 'assignment_program_opened',
    'assignment_program_confirmed', 'assignment_program_revoked'
  ) then
    raise exception 'INVALID_ACTION';
  end if;

  select * into v_assignment from public.operator_assignments where id = p_assignment_id;
  if not found then raise exception 'NOT_FOUND'; end if;

  -- 1. Token authorization (canonical access model for driver/supplier links)
  if p_access_token is not null and v_assignment.access_token is not null and v_assignment.access_token = p_access_token then
    v_authorized := true;
  end if;

  -- 2. Session authorization (admin or assigned operator)
  if not v_authorized then
    if v_is_admin then
      v_authorized := true;
    elsif v_uid is not null and v_assignment.operator_id is not null and v_assignment.operator_id = v_uid then
      v_authorized := true;
    end if;
  end if;

  if not v_authorized then
    raise exception 'UNAUTHORIZED';
  end if;

  -- Action-specific role guards
  if p_action in ('assignment_program_sent', 'assignment_program_revoked') and not v_is_admin then
    raise exception 'UNAUTHORIZED';
  end if;

  -- 3. Confirm action: requires prior assignment_program_opened
  if p_action = 'assignment_program_confirmed' then
    if v_assignment.status <> 'active'
       or (v_assignment.starts_at is not null and v_assignment.starts_at > now())
       or (v_assignment.ends_at is not null and v_assignment.ends_at <= now()) then
      raise exception 'ASSIGNMENT_NOT_ACTIVE';
    end if;

    if not exists (
      select 1 from public.assignment_event_log opened
      where opened.assignment_id = p_assignment_id
        and opened.event_type = 'assignment_program_opened'
    ) then
      raise exception 'PROGRAM_NOT_OPENED';
    end if;

    insert into public.assignment_event_log (assignment_id, operator_id, campaign_id, event_type)
    values (p_assignment_id, v_assignment.operator_id, v_assignment.campaign_id, p_action)
    on conflict do nothing;
    return;
  end if;

  if p_action = 'assignment_program_revoked' then
    insert into public.assignment_event_log (assignment_id, operator_id, campaign_id, event_type)
    values (p_assignment_id, v_assignment.operator_id, v_assignment.campaign_id, p_action);
    return;
  end if;

  -- 4. Open and Sent actions: idempotent (do not create duplicate rows)
  if exists (
    select 1 from public.assignment_event_log
    where assignment_id = p_assignment_id and event_type = p_action
  ) then
    return;
  end if;

  insert into public.assignment_event_log (assignment_id, operator_id, campaign_id, event_type)
  values (p_assignment_id, v_assignment.operator_id, v_assignment.campaign_id, p_action);
end;
$$;

ALTER FUNCTION public.log_assignment_event(uuid, text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.log_assignment_event(uuid, text, text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.log_assignment_event(uuid, text, text) TO anon;
GRANT ALL ON FUNCTION public.log_assignment_event(uuid, text, text) TO authenticated;
GRANT ALL ON FUNCTION public.log_assignment_event(uuid, text, text) TO service_role;

COMMIT;
