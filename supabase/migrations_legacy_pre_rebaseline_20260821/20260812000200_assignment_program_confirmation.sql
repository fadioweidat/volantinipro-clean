begin;

create unique index if not exists uq_assignment_event_log_one_confirmation
  on public.assignment_event_log (assignment_id)
  where event_type = 'assignment_program_confirmed';

drop policy if exists driver_select_own_assignment_event_log on public.assignment_event_log;
create policy driver_select_own_assignment_event_log
on public.assignment_event_log for select to authenticated
using (operator_id = auth.uid());

create or replace function public.log_assignment_event(
  p_assignment_id uuid,
  p_action text
) returns void
  language plpgsql security definer
  set search_path to ''
  as $$
declare
  v_uid uuid := auth.uid();
  v_assignment public.operator_assignments%rowtype;
  v_is_admin boolean := public.gps_is_admin();
begin
  if v_uid is null then raise exception 'UNAUTHORIZED'; end if;
  if p_action not in ('assignment_program_sent', 'assignment_program_opened', 'assignment_program_confirmed') then
    raise exception 'INVALID_ACTION';
  end if;

  select * into v_assignment from public.operator_assignments where id = p_assignment_id;
  if not found then raise exception 'NOT_FOUND'; end if;

  if p_action = 'assignment_program_sent' and not v_is_admin then raise exception 'UNAUTHORIZED'; end if;
  if p_action = 'assignment_program_opened' and v_assignment.operator_id <> v_uid then raise exception 'UNAUTHORIZED'; end if;

  if p_action = 'assignment_program_confirmed' then
    if v_is_admin or v_assignment.operator_id <> v_uid then raise exception 'UNAUTHORIZED'; end if;
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
        and exists (
          select 1
          from public.assignment_event_log sent
          where sent.assignment_id = p_assignment_id
            and sent.event_type = 'assignment_program_sent'
            and sent.created_at <= opened.created_at
        )
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

revoke all on function public.log_assignment_event(uuid, text) from public;
grant execute on function public.log_assignment_event(uuid, text) to authenticated, service_role;

commit;
