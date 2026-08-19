begin;

-- P1 ADMIN CONTROL + ROLLBACK — audit generico per azioni Admin su
-- campagna/pagamento/programma (cancel, archive, reopen, payment revoke,
-- program revoke...). Nessuna delle tre tabelle di log gia' esistenti
-- (assignment_event_log, gps_operator_audit_log,
-- campaign_zone_progress_history) e' generica abbastanza: sono tutte
-- scoped a un dominio diverso (assignment/GPS/zona).
--
-- REVISIONE (audit-survives-delete): la prima bozza aveva
-- `campaign_id ... on delete cascade`, sbagliato per un log append-only —
-- un hard-delete di una campagna (bozza/test, ammesso solo se senza
-- dipendenze operative) avrebbe cancellato anche la prova che l'eliminazione
-- e' avvenuta. Corretto riusando ESATTAMENTE il pattern gia' collaudato in
-- produzione per campaign_zone_progress_history
-- (20260724101527_campaign_zone_progress_predeploy_fixes.sql):
--   - campaign_id nullable + on delete set null (la riga di log sopravvive)
--   - campaign_id_snapshot / campaign_title_snapshot: colonne separate,
--     SENZA foreign key, valorizzate una sola volta all'insert e protette
--     da un trigger che blocca qualunque UPDATE successivo — identita'
--     storica immutabile anche se la campagna viene poi eliminata.
create table if not exists public.campaign_admin_action_log (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.campaigns(id) on delete set null,
  campaign_id_snapshot uuid not null,
  campaign_title_snapshot text not null,
  action text not null,
  previous_state text,
  new_state text,
  reason text not null,
  actor_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),

  constraint campaign_admin_action_log_reason_required
    check (nullif(btrim(reason), '') is not null),
  -- Whitelist stabile ma NON un enum Postgres rigido (ALTER TYPE ADD VALUE
  -- ha vincoli transazionali fastidiosi e i valori non si possono
  -- rimuovere) — un CHECK su text si evolve con un semplice
  -- drop/add constraint in una futura migration, stesso compromesso gia'
  -- scelto per assignment_event_log ed event_type altrove nel progetto.
  constraint campaign_admin_action_log_action_check
    check (action in (
      'campaign_cancelled',
      'campaign_archived',
      'campaign_reopened',
      'payment_confirmation_revoked',
      'program_revoked'
    ))
);

create index if not exists campaign_admin_action_log_campaign_idx
  on public.campaign_admin_action_log (campaign_id, created_at desc);

-- campaign_id puo' diventare NULL dopo un hard-delete: lo snapshot resta
-- l'unico modo affidabile di interrogare lo storico per identita' campagna.
create index if not exists campaign_admin_action_log_snapshot_idx
  on public.campaign_admin_action_log (campaign_id_snapshot, created_at desc);

alter table public.campaign_admin_action_log enable row level security;
alter table public.campaign_admin_action_log force row level security;

drop policy if exists campaign_admin_action_log_select_admin
  on public.campaign_admin_action_log;

create policy campaign_admin_action_log_select_admin
on public.campaign_admin_action_log
for select
to authenticated
using (public.gps_is_admin());

revoke all on table public.campaign_admin_action_log from anon;
revoke all on table public.campaign_admin_action_log from authenticated;
grant select on table public.campaign_admin_action_log to authenticated;

-- Immutabilita' snapshot: stesso trigger-pattern di
-- protect_campaign_zone_progress_history_snapshots, adattato a questa
-- tabella. Blocca qualunque UPDATE delle due colonne snapshot, anche se
-- eseguito con privilegi elevati per errore/bug futuro.
create or replace function public.protect_campaign_admin_action_log_snapshots()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if new.campaign_id_snapshot is distinct from old.campaign_id_snapshot
     or new.campaign_title_snapshot is distinct from old.campaign_title_snapshot then
    raise exception 'SNAPSHOT_STORICO_IMMUTABILE' using errcode = '23000';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_campaign_admin_action_log_snapshots
  on public.campaign_admin_action_log;

create trigger protect_campaign_admin_action_log_snapshots
before update of campaign_id_snapshot, campaign_title_snapshot
on public.campaign_admin_action_log
for each row
execute function public.protect_campaign_admin_action_log_snapshots();

revoke all on function public.protect_campaign_admin_action_log_snapshots()
  from public, anon, authenticated;

-- RPC di scrittura. NON modifica campaigns.status/metadata — resta
-- responsabilita' delle RPC specifiche (admin_cancel_campaign etc, vedi
-- 20260818120200_admin_campaign_transitions.sql) chiamarla internamente
-- come ultimo passo della STESSA transazione, cosi' che stato e audit
-- restino atomici insieme (vedi commento in quel file).
--
-- INDURIMENTO (integrita' audit): EXECUTE su questa funzione e' revocato
-- ad `authenticated` e concesso solo a `service_role`. Una funzione
-- SECURITY DEFINER chiamata da un'ALTRA funzione SECURITY DEFINER (via
-- `perform`) viene eseguita con i privilegi dell'OWNER della funzione
-- chiamante, non del client originale — quindi le 5 RPC di transizione
-- continuano a funzionare chiamandola internamente, ma nessun client admin
-- puo' piu' invocarla direttamente per scrivere una riga di audit fittizia
-- non collegata a un vero cambio di stato.
create or replace function public.admin_log_campaign_action(
  p_campaign_id uuid,
  p_action text,
  p_previous_state text,
  p_new_state text,
  p_reason text
)
returns public.campaign_admin_action_log
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
  v_title text;
  v_row public.campaign_admin_action_log%rowtype;
begin
  if not public.gps_is_admin() then
    raise exception 'ADMIN_NON_AUTORIZZATO' using errcode = '42501';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'MOTIVO_OBBLIGATORIO' using errcode = '22023';
  end if;

  select title into v_title from public.campaigns where id = p_campaign_id;
  if v_title is null then
    raise exception 'CAMPAGNA_NON_TROVATA' using errcode = 'P0002';
  end if;

  insert into public.campaign_admin_action_log (
    campaign_id, campaign_id_snapshot, campaign_title_snapshot,
    action, previous_state, new_state, reason, actor_id
  ) values (
    p_campaign_id, p_campaign_id, v_title,
    p_action, p_previous_state, p_new_state, btrim(p_reason), v_uid
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.admin_log_campaign_action(uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_log_campaign_action(uuid, text, text, text, text)
  to service_role;

commit;
