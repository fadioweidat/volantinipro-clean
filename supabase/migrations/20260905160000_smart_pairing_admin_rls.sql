-- 20260905160000_smart_pairing_admin_rls.sql
--
-- Completa la persistenza DB del workflow Admin Smart Pairing gia' spedito
-- (src/pages/admin/SmartPairingWaitlist.jsx + src/lib/services/admin-api.js).
-- NON e' ancora applicata in produzione (repo-only in questo commit).
--
-- MODELLO LIFECYCLE (fonte: admin-api.js::adminUpdateSmartPairingStatus):
--   status  = stato canonico a 6 valori, sorgente di verita':
--               non terminali: open | reviewing | proposal_sent
--               terminali:     accepted | rejected | closed
--   gestita = booleano DERIVATO "richiesta chiusa": true sse status terminale
--             (accepted/rejected/closed) o chiusura esplicita; sincronizzato ad
--             ogni scrittura Admin. NON rimosso: letture legacy + flusso
--             "Chiudi / Archivia" continuano a dipenderne.
--
-- Additiva e idempotente. NIENTE drop table/column, niente truncate/delete di
-- dati, niente modifica ad auth o ad altre tabelle, niente grant a service_role.

-- ---------------------------------------------------------------------------
-- 1. Colonne status + admin_notes (persistenza reale del workflow Admin)
-- ---------------------------------------------------------------------------
alter table if exists public.smart_pairing_waitlist
  add column if not exists status text default 'open',
  add column if not exists admin_notes text;

comment on column public.smart_pairing_waitlist.status is
  'Stato canonico richiesta Smart Pairing: open | reviewing | proposal_sent | accepted | rejected | closed. I valori terminali (accepted/rejected/closed) corrispondono a gestita = true. DEFAULT open per le nuove righe.';
comment on column public.smart_pairing_waitlist.admin_notes is
  'Note interne Admin; riservate al workflow Admin, mai customer-facing. Nota: RLS non filtra per colonna, quindi finche'' le letture Admin non passano da una RPC SECURITY DEFINER il richiedente puo'' tecnicamente leggere questo campo sulla PROPRIA riga (oggi mai popolato da alcuna UI).';

-- ---------------------------------------------------------------------------
-- 2. Backfill storico (vive SOLO dentro questa migration).
--    Le righe gia' chiuse (gestita = true) non devono restare 'open' per via
--    del DEFAULT. 'closed' e' il valore terminale generico atteso dal modello
--    applicativo (bottone "Chiudi / Archivia" invia esattamente 'closed').
-- ---------------------------------------------------------------------------
update public.smart_pairing_waitlist
   set status = 'closed'
 where gestita = true
   and coalesce(status, 'open') = 'open';

-- ---------------------------------------------------------------------------
-- 3. RLS (gia' abilitata in produzione; ENABLE e' idempotente)
-- ---------------------------------------------------------------------------
alter table if exists public.smart_pairing_waitlist enable row level security;

-- ---------------------------------------------------------------------------
-- 4. Ripristino del privilegio INSERT pubblico.
--    Le policy RLS INSERT (smart_pairing_waitlist_insert_anon /
--    smart_pairing_waitlist_insert_authenticated) esistono, ma il privilegio
--    di TABELLA INSERT per anon/authenticated e' assente in produzione
--    (has_table_privilege = false) -> la submission dal browser fallisce con
--    42501. La validazione resta interamente nelle policy RLS gia' presenti
--    (nome >= 2, email valida, gestita = false, regole cliente_id).
--    NIENTE grant SELECT / UPDATE / DELETE aggiuntivo ad anon qui.
-- ---------------------------------------------------------------------------
grant insert on table public.smart_pairing_waitlist to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Accesso completo Admin (SELECT/INSERT/UPDATE/DELETE) legato al modello
--    admin corrente public.jwt_is_admin(). Policy ADDITIVA: "waitlist_own"
--    resta e continua a mostrare al richiedente SOLO la propria riga; le
--    policy INSERT pubbliche restano invariate.
--    USING  -> visibilita' riga per SELECT/UPDATE/DELETE (solo admin).
--    WITH CHECK -> riga risultante per INSERT/UPDATE (solo admin).
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'smart_pairing_waitlist'
      and policyname = 'smart_pairing_waitlist_admin_all'
  ) then
    create policy "smart_pairing_waitlist_admin_all"
      on public.smart_pairing_waitlist
      for all
      to authenticated
      using (public.jwt_is_admin())
      with check (public.jwt_is_admin());
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Dedupe 10 minuti.
--    Chiave: lower(email) + lower(comune) + lower(coalesce(servizio,'d2d')).
--    Blocca/unifica SOLO mentre la richiesta precedente e' ancora attiva
--    (status non terminale E gestita = false): una richiesta
--    accepted/rejected/closed NON sopprime una nuova richiesta.
--    RETURN NULL sopprime l'insert duplicato aggiornando la riga esistente:
--    saveSmartPairingWaitlist tratta la risposta HTTP 2xx senza errore come
--    submission riuscita -> il cliente NON vede un errore.
--    SECURITY DEFINER + search_path esplicito (hardening standard per le
--    funzioni definer di questo progetto).
-- ---------------------------------------------------------------------------
create or replace function public.trg_smart_pairing_waitlist_dedupe()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_existing_id uuid;
begin
  select id into v_existing_id
  from public.smart_pairing_waitlist
  where lower(email) = lower(new.email)
    and lower(coalesce(comune, '')) = lower(coalesce(new.comune, ''))
    and lower(coalesce(servizio, 'd2d')) = lower(coalesce(new.servizio, 'd2d'))
    and coalesce(status, 'open') not in ('accepted', 'rejected', 'closed')
    and gestita = false
    and created_at >= (now() - interval '10 minutes')
  order by created_at desc
  limit 1;

  if v_existing_id is not null then
    update public.smart_pairing_waitlist
    set
      nome = coalesce(nullif(new.nome, ''), nome),
      whatsapp = coalesce(new.whatsapp, whatsapp),
      date_preferite = coalesce(new.date_preferite, date_preferite),
      note = coalesce(new.note, note),
      created_at = now()
    where id = v_existing_id;

    return null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_smart_pairing_waitlist_dedupe on public.smart_pairing_waitlist;
create trigger trg_smart_pairing_waitlist_dedupe
  before insert on public.smart_pairing_waitlist
  for each row
  execute function public.trg_smart_pairing_waitlist_dedupe();
