begin;

create table if not exists public.assignment_event_log (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.operator_assignments(id) on delete cascade,
  operator_id uuid not null references public.operator_profiles(user_id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  event_type text not null,
  created_at timestamptz not null default now()
);

-- Index for querying
create index if not exists idx_assignment_event_log_assignment on public.assignment_event_log(assignment_id);

-- RLS
alter table public.assignment_event_log enable row level security;
alter table public.assignment_event_log force row level security;

-- Admin can select all
drop policy if exists admin_select_assignment_event_log on public.assignment_event_log;
create policy admin_select_assignment_event_log on public.assignment_event_log for select to authenticated
using (public.gps_is_admin());

-- No direct INSERT allowed from frontend (only via RPC)

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
  if p_action not in ('assignment_program_sent', 'assignment_program_opened') then raise exception 'INVALID_ACTION'; end if;

  select * into v_assignment from public.operator_assignments where id = p_assignment_id;
  if not found then raise exception 'NOT_FOUND'; end if;

  if p_action = 'assignment_program_sent' and not v_is_admin then
    raise exception 'UNAUTHORIZED';
  end if;
  if p_action = 'assignment_program_opened' and v_assignment.operator_id <> v_uid then
    raise exception 'UNAUTHORIZED';
  end if;

  -- Idempotenza / Debounce 5 minutes
  if exists (
    select 1 from public.assignment_event_log
    where assignment_id = p_assignment_id 
      and event_type = p_action
      and created_at > now() - interval '5 minutes'
  ) then
    return;
  end if;

  insert into public.assignment_event_log (
    assignment_id, operator_id, campaign_id, event_type
  ) values (
    p_assignment_id, v_assignment.operator_id, v_assignment.campaign_id, p_action
  );
end;
$$;

revoke all on function public.log_assignment_event(uuid, text) from public;
grant execute on function public.log_assignment_event(uuid, text) to authenticated, service_role;

commit;
