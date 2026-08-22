begin;

-- P1 ADMIN CONTROL + ROLLBACK — aggiunge 'archived' al check constraint
-- reale di campaigns.status. Nome constraint verificato contro lo schema
-- realmente esportato (local_pre_reconcile_backup.sql:529 — pg_dump del DB
-- live), non solo dedotto dal testo della migration che lo ha introdotto.
--
-- ARCHIVED != CANCELLED (decisione esplicita): "cancelled" = campagna
-- annullata operativamente; "archived" = campagna chiusa/nascosta
-- amministrativamente con storico intatto. Stesso campaigns.status resta
-- l'unica source of truth (nessuna seconda colonna, nessun workaround in
-- metadata) — solo un nuovo valore ammesso, aggiunto al set esistente.
--
-- Sicurezza: nessun DROP TABLE, nessuna DELETE, nessun UPDATE di dati
-- esistenti. Drop+add del solo CHECK CONSTRAINT (non della colonna): tutti
-- gli 8 valori gia' ammessi restano ammessi, se ne aggiunge un nono. Poiche'
-- il nuovo set e' un superset del vecchio, nessuna riga esistente puo'
-- violare il nuovo constraint — la validazione automatica che Postgres fa
-- su ADD CONSTRAINT passera' per costruzione. Idempotente: rieseguibile
-- senza effetti diversi (drop-if-exists + re-add allo stesso stato finale).
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'campaigns_status_check'
      and conrelid = 'public.campaigns'::regclass
  ) then
    alter table public.campaigns drop constraint campaigns_status_check;
  end if;
end $$;

alter table public.campaigns
  add constraint campaigns_status_check
  check (status = any (array[
    'draft', 'pending_review', 'approved', 'scheduled',
    'in_progress', 'completed', 'cancelled', 'archived', 'problem'
  ]));

commit;
