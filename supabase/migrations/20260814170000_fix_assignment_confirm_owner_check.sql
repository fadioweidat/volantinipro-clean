begin;

-- FIX AUDIT-DRIVER-CONFIRM-403: due bug distinti nel ramo 'confirmed' di
-- log_assignment_event, entrambi riprodotti live in E2E.
--
-- BUG 1 (causa del 403 UNAUTHORIZED osservato): il ramo verificava
-- `v_is_admin or v_assignment.operator_id <> v_uid` — un account che risulta
-- admin (public.gps_is_admin()) veniva SEMPRE respinto, anche quando
-- operator_id = auth.uid() (era davvero l'operatore assegnato). Il ramo
-- 'assignment_program_opened', due righe sopra nella stessa funzione, usa
-- correttamente la sola verifica di ownership (`operator_id <> v_uid`), senza
-- alcuna esclusione admin — da qui l'incoerenza: 'opened' passava,
-- 'confirmed' falliva con 403 per lo stesso utente sulla stessa
-- assegnazione. La sola ownership (operator_id = auth.uid()) e' gia' la
-- regola sufficiente e corretta, identica a 'opened'. Non si allarga alcun
-- permesso: restano bloccati driver diversi, anon, customer, e admin che NON
-- sono l'operatore assegnato — cambia solo il caso limite (admin che e'
-- anche l'operatore reale), oggi bloccato per errore.
--
-- BUG 2 (avrebbe bloccato TUTTI gli utenti reali, non solo il caso limite
-- admin/driver): il ramo richiedeva un evento 'assignment_program_sent'
-- precedente a 'opened' prima di accettare 'confirmed'. La correzione
-- separata del falso 'assignment_program_sent' automatico (registrato prima
-- su ogni apertura di wa.me, in violazione di "NON registrare sent se non
-- esiste prova reale") fa si' che 'sent' non venga quasi mai piu' scritto —
-- rendendo questa precondizione strutturalmente irraggiungibile e bloccando
-- 'confirmed' per chiunque, sempre. La precondizione reale e sufficiente e'
-- che 'opened' esista per questa assegnazione (gia' garantito: la UI di
-- conferma e' raggiungibile solo dopo che il caricamento della pagina Driver
-- ha gia' registrato 'opened' con successo) — non serve alcuna dipendenza da
-- 'sent', evento la cui semantica resta "azione Admin esplicita, mai
-- automatica" come richiesto.
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
