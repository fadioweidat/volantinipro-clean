begin;

-- P1 ADMIN CONTROL + ROLLBACK — PROPOSTA, NON APPLICATA.
-- Aggiunge 'campaign_hard_deleted' alla whitelist di
-- campaign_admin_action_log.action (20260818120000_campaign_admin_action_log.sql
-- ne definiva 5, senza questo — necessario prima che
-- admin_hard_delete_campaign() possa inserire una riga con questa azione).
-- Solo ADDITIVA: drop+add dello stesso CHECK constraint con un valore in
-- piu' nel set consentito, nessun valore esistente rimosso, nessuna riga
-- toccata (nessun UPDATE/DELETE su dati).
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'campaign_admin_action_log_action_check'
      and conrelid = 'public.campaign_admin_action_log'::regclass
  ) then
    alter table public.campaign_admin_action_log
      drop constraint campaign_admin_action_log_action_check;
  end if;
end $$;

alter table public.campaign_admin_action_log
  add constraint campaign_admin_action_log_action_check
  check (action in (
    'campaign_cancelled',
    'campaign_archived',
    'campaign_reopened',
    'payment_confirmation_revoked',
    'program_revoked',
    'campaign_hard_deleted'
  ));

commit;
