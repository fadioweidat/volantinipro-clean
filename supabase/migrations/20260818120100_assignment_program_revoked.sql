begin;

-- P1 ADMIN CONTROL + ROLLBACK — aggiunge il solo valore
-- 'assignment_program_revoked' alla whitelist di log_assignment_event.
--
-- ATTENZIONE (scoperta in fase di verifica pre-apply, con
-- `supabase db query --linked` contro il DB reale): la versione live di
-- questa funzione NON e' quella descritta in
-- 20260814170000_fix_assignment_confirm_owner_check.sql (2 argomenti,
-- p_assignment_id uuid, p_action text). La firma REALE sul database
-- collegato e' a 3 argomenti:
--   log_assignment_event(p_assignment_id uuid, p_action text, p_access_token text default null)
-- con supporto aggiuntivo per il flusso Driver via link pubblico
-- (v_uid risolto da operator_assignments.access_token quando auth.uid() e'
-- null) — introdotto da una migration successiva non presente nella
-- cartella locale migrations/ in questa sessione (probabilmente
-- 20260816160000_driver_gps_access_token.sql, il cui contenuto non
-- coincide con cio' che questa migration avrebbe sovrascritto). Un
-- `create or replace function log_assignment_event(uuid, text)` a 2
-- argomenti NON avrebbe sostituito la funzione reale: in Postgres due
-- funzioni con lo stesso nome ma firma diversa sono overload distinti —
-- avrebbe creato una funzione morta mai chiamata dall'app (che usa sempre
-- la firma a 3 argomenti), lasciando quella vera invariata e priva del
-- nuovo branch 'assignment_program_revoked'. Corpo qui sotto copiato
-- VERBATIM dalla definizione live (pg_get_functiondef), con la sola
-- aggiunta del branch 'assignment_program_revoked' in coda — ogni altro
-- ramo (sent/opened/confirmed, risoluzione v_uid via access_token) e'
-- invariato byte-per-byte.
create or replace function public.log_assignment_event(
  p_assignment_id uuid,
  p_action text,
  p_access_token text default null::text
) returns void
  language plpgsql security definer
  set search_path to ''
  as $$
declare
  v_uid uuid := auth.uid();
  v_assignment public.operator_assignments%rowtype;
  v_is_admin boolean := public.gps_is_admin();
begin
  if p_action not in (
    'assignment_program_sent',
    'assignment_program_opened',
    'assignment_program_confirmed',
    'assignment_program_revoked'
  ) then
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

  -- Solo Admin puo' revocare un programma inviato — mai il driver stesso
  -- (ne' via sessione autenticata ne' via access_token pubblico), coerente
  -- con 'assignment_program_sent' (azione Admin esplicita). v_is_admin e'
  -- gia' calcolato sopra da auth.uid() PRIMA dell'eventuale risoluzione via
  -- access_token, quindi un accesso via link pubblico (v_uid impostato solo
  -- dal ramo access_token, auth.uid() reale nullo) non puo' mai risultare
  -- admin qui: v_is_admin resta false in quel caso.
  if p_action = 'assignment_program_revoked' then
    if not v_is_admin then raise exception 'UNAUTHORIZED'; end if;

    insert into public.assignment_event_log (assignment_id, operator_id, campaign_id, event_type)
    values (p_assignment_id, v_assignment.operator_id, v_assignment.campaign_id, p_action);
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
grant execute on function public.log_assignment_event(uuid, text, text) to authenticated, service_role, anon;

commit;
