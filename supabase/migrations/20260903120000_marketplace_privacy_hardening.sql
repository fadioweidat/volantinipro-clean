-- Migration: Marketplace Fornitore — privacy & integrity hardening (P1 + P3)
--
-- Chiude due falle trovate dall'audit del flusso Marketplace end-to-end.
-- Migration ADDITIVA / hardening: nessun DROP TABLE/COLUMN, nessuna modifica
-- dei dati esistenti, nessun cambiamento frontend.
--
-- P1 — PRIVACY SUPPLIER
--   La policy `campaigns_supplier_assigned_select` (20260830160000) concedeva
--   al fornitore assegnatario la SELECT sull'INTERA riga `public.campaigns`
--   (RLS PostgreSQL = OR con `campaigns_own_select`). La tabella campaigns
--   contiene PII cliente e importi non previsti dal modello Marketplace:
--   client_name, client_phone, client_email, customer_name, customer_id,
--   address, address_input, notes, estimated_price, total_amount, total_budget.
--   Un fornitore verificato con una campagna vinta poteva leggerli con un
--   semplice `select ... from campaigns where supplier_id = auth.uid()`.
--   La Dashboard Fornitore NON usa mai `.from('campaigns')` diretto (verificato):
--   legge solo via RPC SECURITY DEFINER a payload minimo
--   (supplier_list_assigned_campaigns, supplier_list_campaign_assignments).
--   -> la policy e' rimossa; l'accesso fornitore alle campagne resta 100% RPC.
--
-- P3 — INTEGRITA' ASSEGNAZIONE CAMPAGNA
--   `campaigns_own_update` (baseline) permette al cliente proprietario di
--   aggiornare la propria riga campagna SENZA restrizione di colonna: poteva
--   quindi scrivere direttamente `supplier_id` e portare `status` a
--   'quote_selected'/'assigned' scavalcando `customer_accept_supplier_quote`
--   (single-winner, lock, validazioni). Non puo' fabbricare una quote
--   (quotes_marketplace_guard lo blocca), ma puo' corrompere lo stato di
--   assegnazione della propria campagna.
--   -> trigger BEFORE UPDATE: `supplier_id` e le transizioni verso
--      'quote_selected'/'assigned' sono modificabili SOLO da una RPC ufficiale
--      Marketplace (marketplace.rpc = 'on') o da un admin (jwt_is_admin()).
--      Speculare a `quotes_marketplace_guard`. Gli altri campi campagna
--      restano liberamente aggiornabili dal proprietario (campaigns_own_update
--      invariata).

begin;

-- ---------------------------------------------------------------------------
-- P1 — rimozione policy di lettura diretta campaigns per il fornitore
-- ---------------------------------------------------------------------------
drop policy if exists campaigns_supplier_assigned_select on public.campaigns;

-- ---------------------------------------------------------------------------
-- P3 — guardia su supplier_id / transizione a stati marketplace sensibili
-- ---------------------------------------------------------------------------
create or replace function public.campaigns_marketplace_assignment_guard()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_rpc   text    := current_setting('marketplace.rpc', true);
  v_admin boolean := public.jwt_is_admin();
begin
  -- Percorsi autorizzati: RPC ufficiale Marketplace o admin.
  if coalesce(v_rpc, '') = 'on' or v_admin then
    return new;
  end if;

  -- Il fornitore non e' mai il proprietario (campaigns_own_update: user_id):
  -- qui arriva solo il cliente proprietario via UPDATE diretto.
  if new.supplier_id is distinct from old.supplier_id then
    raise exception 'CAMPAGNA_SUPPLIER_RPC_ONLY' using errcode = '42501';
  end if;

  if new.status is distinct from old.status
     and new.status in ('quote_selected', 'assigned')
     and coalesce(old.status, '') not in ('quote_selected', 'assigned') then
    raise exception 'CAMPAGNA_STATO_MARKETPLACE_RPC_ONLY' using errcode = '42501';
  end if;

  return new;
end;
$$;

alter function public.campaigns_marketplace_assignment_guard() owner to postgres;
revoke all on function public.campaigns_marketplace_assignment_guard() from public, anon;

drop trigger if exists campaigns_marketplace_assignment_guard_trg on public.campaigns;
create trigger campaigns_marketplace_assignment_guard_trg
  before update on public.campaigns
  for each row execute function public.campaigns_marketplace_assignment_guard();

commit;
