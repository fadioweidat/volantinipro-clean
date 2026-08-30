-- Migration: Supplier Marketplace (Cliente <-> Fornitore <-> Admin)
--
-- PROPOSTA, NON APPLICATA in questo turno.
--
-- Hardening completo (tutti i blocker dell'audit):
--  * Supplier NON puo' auto-verificarsi: nessuna policy UPDATE su
--    supplier_profiles; aggiornamento profilo SOLO via RPC supplier_update_profile
--    con allowlist esplicita. Lo status resta Admin-only (admin_set_supplier_status).
--  * public_code OPACO random (mai da UUID/email/telefono/VAT). NOT NULL + UNIQUE.
--  * Ogni RPC: SECURITY DEFINER + SET search_path TO '' + REVOKE da PUBLIC/anon
--    + GRANT mirato + tutti gli identificatori schema-qualified public.* +
--    zero dynamic SQL.
--  * supplier_submit_quote lato DB: supplier_id server-side, verified gate,
--    campagna disponibile, niente duplicati attivi.
--  * customer_accept_supplier_quote: input SOLO target_quote_id, campagna
--    derivata dalla quota; SELECT ... FOR UPDATE su quota e campagna; single
--    winner; idempotente; MAI tocca le quote piattaforma legacy (supplier_id NULL).
--  * FK quotes.supplier_id / campaigns.supplier_id / operator_profiles.supplier_id
--    -> ON DELETE SET NULL (preserva lo storico offerte).
--  * FORCE ROW LEVEL SECURITY su supplier_profiles.
--  * trigger quotes_marketplace_guard_trg: le quote marketplace (supplier_id
--    NOT NULL) sono immutabili dai client diretti -> solo RPC o admin.
--  * campaigns.marketplace_code: codice opaco persistente, il payload al
--    Fornitore NON contiene mai l'UUID reale della campagna.

begin;

-- ---------------------------------------------------------------------------
-- 1. Ruolo supplier (additivo: 'admin'/'staff'/'client' invariati)
-- ---------------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('admin', 'staff', 'client', 'supplier'));

-- ---------------------------------------------------------------------------
-- 2. supplier_profiles — public_code OPACO, campi privilegiati Admin-only
-- ---------------------------------------------------------------------------
create table if not exists public.supplier_profiles (
  id uuid primary key references public.profiles(id) on delete cascade,
  -- opaco: 10 hex random da gen_random_uuid, NON derivato dall'id del supplier
  public_code text not null unique
    default ('VP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  company_name text not null,
  contact_name text,
  email text,
  phone text,
  vat_number text,
  status text not null default 'pending'
    check (status in ('pending', 'verified', 'suspended', 'rejected')),
  coverage_areas text[] not null default '{}',
  services text[] not null default '{}',
  documents jsonb not null default '{}'::jsonb,
  admin_notes text,
  verified_at timestamptz,
  verified_by uuid references public.profiles(id),
  suspended_at timestamptz,
  suspended_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists supplier_profiles_status_idx on public.supplier_profiles (status);

alter table public.supplier_profiles enable row level security;
alter table public.supplier_profiles force row level security;

update public.supplier_profiles
  set public_code = 'VP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))
  where public_code is null;

-- Admin: tutto. Supplier: SELECT solo la propria riga. NESSUNA policy
-- UPDATE/INSERT/DELETE per il supplier -> lo status e i campi privilegiati
-- non sono modificabili dal supplier.
drop policy if exists supplier_profiles_admin_all on public.supplier_profiles;
create policy supplier_profiles_admin_all on public.supplier_profiles
  for all to authenticated using (public.jwt_is_admin()) with check (public.jwt_is_admin());

drop policy if exists supplier_profiles_own_select on public.supplier_profiles;
create policy supplier_profiles_own_select on public.supplier_profiles
  for select to authenticated using (id = auth.uid());

-- ---------------------------------------------------------------------------
-- 3. campaigns — status superset (tutti i valori legacy mantenuti),
--    supplier_id nullable (FK SET NULL), marketplace_code opaco persistente.
-- ---------------------------------------------------------------------------
alter table public.campaigns drop constraint if exists campaigns_status_check;
alter table public.campaigns add constraint campaigns_status_check
  check (status in (
    'draft', 'requested', 'receiving_quotes', 'quote_selected', 'assigned',
    'pending_review', 'approved', 'scheduled', 'in_progress', 'completed',
    'cancelled', 'archived', 'problem'
  ));

alter table public.campaigns
  add column if not exists supplier_id uuid references public.supplier_profiles(id) on delete set null;
alter table public.campaigns
  add column if not exists marketplace_code text unique;

create index if not exists campaigns_supplier_id_idx
  on public.campaigns (supplier_id) where supplier_id is not null;

create or replace function public.campaigns_set_marketplace_code()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if new.status in ('requested', 'receiving_quotes') and new.marketplace_code is null then
    new.marketplace_code := 'REQ-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  end if;
  return new;
end;
$$;
drop trigger if exists campaigns_marketplace_code on public.campaigns;
create trigger campaigns_marketplace_code
  before insert or update on public.campaigns
  for each row execute function public.campaigns_set_marketplace_code();

update public.campaigns
  set marketplace_code = 'REQ-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))
  where status in ('requested', 'receiving_quotes') and marketplace_code is null;

drop policy if exists campaigns_supplier_assigned_select on public.campaigns;
create policy campaigns_supplier_assigned_select on public.campaigns
  for select to authenticated using (supplier_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 4. quotes — colonne marketplace; supplier_id nullable (FK SET NULL:
--    eliminare un supplier NON cancella lo storico offerte).
--    Le quote piattaforma legacy restano quote_status NULL: i flussi Supplier
--    non le toccano MAI.
-- ---------------------------------------------------------------------------
alter table public.quotes
  add column if not exists supplier_id uuid references public.supplier_profiles(id) on delete set null;
alter table public.quotes
  add column if not exists quote_status text
    check (quote_status is null or quote_status in (
      'draft', 'submitted', 'accepted', 'rejected', 'not_selected', 'expired', 'withdrawn'
    ));
alter table public.quotes add column if not exists valid_until timestamptz;
alter table public.quotes add column if not exists estimated_time text;
alter table public.quotes add column if not exists availability text;
alter table public.quotes add column if not exists allowed_public_notes text;
alter table public.quotes add column if not exists submitted_at timestamptz;
alter table public.quotes add column if not exists decided_at timestamptz;

create index if not exists quotes_marketplace_idx
  on public.quotes (campaign_id) where supplier_id is not null;

drop policy if exists quotes_supplier_own_select on public.quotes;
create policy quotes_supplier_own_select on public.quotes
  for select to authenticated using (supplier_id = auth.uid());

-- Guardia: una quota marketplace (supplier_id NOT NULL) e' immutabile dai
-- client diretti. Solo le RPC (che impostano marketplace.rpc='on') o un admin
-- possono crearla o modificarne stato/importi/supplier_id. Impedisce a un
-- Cliente (che ha quotes_own_update sulle proprie campagne, policy legacy) di
-- accettare/alterare offerte Fornitore bypassando la RPC dedicata.
create or replace function public.quotes_marketplace_guard()
returns trigger language plpgsql security definer set search_path to '' as $$
declare
  v_rpc text := current_setting('marketplace.rpc', true);
  v_admin boolean := public.jwt_is_admin();
begin
  if tg_op = 'INSERT' then
    if new.supplier_id is not null and coalesce(v_rpc, '') <> 'on' and not v_admin then
      raise exception 'QUOTE_MARKETPLACE_RPC_ONLY' using errcode = '42501';
    end if;
    return new;
  end if;
  if old.supplier_id is not null then
    if (new.quote_status is distinct from old.quote_status
        or new.supplier_id is distinct from old.supplier_id
        or new.total_amount is distinct from old.total_amount
        or new.subtotal is distinct from old.subtotal)
       and coalesce(v_rpc, '') <> 'on' and not v_admin then
      raise exception 'QUOTE_MARKETPLACE_RPC_ONLY' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists quotes_marketplace_guard_trg on public.quotes;
create trigger quotes_marketplace_guard_trg
  before insert or update on public.quotes
  for each row execute function public.quotes_marketplace_guard();

-- ---------------------------------------------------------------------------
-- 5. operator_profiles.supplier_id nullable (FK SET NULL)
-- ---------------------------------------------------------------------------
alter table public.operator_profiles
  add column if not exists supplier_id uuid references public.supplier_profiles(id) on delete set null;
create index if not exists operator_profiles_supplier_idx
  on public.operator_profiles (supplier_id) where supplier_id is not null;

drop policy if exists operator_profiles_supplier_select on public.operator_profiles;
create policy operator_profiles_supplier_select on public.operator_profiles
  for select to authenticated using (supplier_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 6. helper interno
-- ---------------------------------------------------------------------------
create or replace function public.is_verified_supplier(p_uid uuid)
returns boolean language sql stable security definer set search_path to '' as $$
  select exists (
    select 1 from public.supplier_profiles s
    where s.id = p_uid and s.status = 'verified'
  );
$$;
revoke all on function public.is_verified_supplier(uuid) from public, anon;
grant execute on function public.is_verified_supplier(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. supplier_update_profile — ALLOWLIST esplicita (mai status/verified_*/
--    admin_notes/public_code/suspension).
-- ---------------------------------------------------------------------------
create or replace function public.supplier_update_profile(
  p_company_name text,
  p_contact_name text default null,
  p_phone text default null,
  p_coverage_areas text[] default null,
  p_services text[] default null
) returns public.supplier_profiles
  language plpgsql security definer set search_path to '' as $$
declare
  v_uid uuid := auth.uid();
  v_row public.supplier_profiles%rowtype;
begin
  if v_uid is null then raise exception 'NON_AUTENTICATO' using errcode = '42501'; end if;
  if not exists (select 1 from public.supplier_profiles where id = v_uid) then
    raise exception 'PROFILO_FORNITORE_ASSENTE' using errcode = 'P0002';
  end if;
  update public.supplier_profiles set
    company_name   = coalesce(nullif(btrim(p_company_name), ''), company_name),
    contact_name   = coalesce(nullif(btrim(p_contact_name), ''), contact_name),
    phone          = coalesce(nullif(btrim(p_phone), ''), phone),
    coverage_areas = coalesce(p_coverage_areas, coverage_areas),
    services       = coalesce(p_services, services),
    updated_at     = now()
  where id = v_uid
  returning * into v_row;
  return v_row;
end;
$$;
revoke all on function public.supplier_update_profile(text, text, text, text[], text[]) from public, anon;
grant execute on function public.supplier_update_profile(text, text, text, text[], text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. admin_set_supplier_status — SOLO Admin cambia lo status
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_supplier_status(p_supplier_id uuid, p_status text, p_notes text default null)
returns public.supplier_profiles
  language plpgsql security definer set search_path to '' as $$
declare
  v_uid uuid := auth.uid();
  v_row public.supplier_profiles%rowtype;
begin
  if not public.jwt_is_admin() then raise exception 'ADMIN_RICHIESTO' using errcode = '42501'; end if;
  if p_status not in ('pending', 'verified', 'suspended', 'rejected') then
    raise exception 'STATUS_NON_VALIDO' using errcode = '22023';
  end if;
  update public.supplier_profiles set
    status       = p_status,
    admin_notes  = coalesce(nullif(btrim(p_notes), ''), admin_notes),
    verified_at  = case when p_status = 'verified' then now() else verified_at end,
    verified_by  = case when p_status = 'verified' then v_uid else verified_by end,
    suspended_at = case when p_status = 'suspended' then now() else suspended_at end,
    suspended_by = case when p_status = 'suspended' then v_uid else suspended_by end,
    updated_at   = now()
  where id = p_supplier_id
  returning * into v_row;
  if not found then raise exception 'FORNITORE_NON_TROVATO' using errcode = 'P0002'; end if;
  return v_row;
end;
$$;
revoke all on function public.admin_set_supplier_status(uuid, text, text) from public, anon;
grant execute on function public.admin_set_supplier_status(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. customer_get_supplier_quotes — payload ANONIMO (solo public_code),
--    nessun supplier_id, nessun subtotal interno.
-- ---------------------------------------------------------------------------
create or replace function public.customer_get_supplier_quotes(p_campaign_id uuid)
returns table (
  quote_id uuid,
  supplier_public_code text,
  total_amount numeric,
  estimated_time text,
  availability text,
  valid_until timestamptz,
  allowed_public_notes text,
  quote_status text
) language plpgsql stable security definer set search_path to '' as $$
begin
  if not exists (
    select 1 from public.campaigns c
    where c.id = p_campaign_id and (c.user_id = auth.uid() or public.jwt_is_admin())
  ) then
    raise exception 'CAMPAGNA_NON_AUTORIZZATA' using errcode = '42501';
  end if;

  return query
  select
    q.id,
    s.public_code,
    q.total_amount,
    q.estimated_time,
    q.availability,
    q.valid_until,
    q.allowed_public_notes,
    q.quote_status
  from public.quotes q
  join public.supplier_profiles s on s.id = q.supplier_id
  where q.campaign_id = p_campaign_id
    and q.supplier_id is not null
    and q.quote_status in ('submitted', 'accepted', 'rejected', 'not_selected', 'expired')
  order by q.total_amount asc nulls last;
end;
$$;
revoke all on function public.customer_get_supplier_quotes(uuid) from public, anon;
grant execute on function public.customer_get_supplier_quotes(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 10. supplier_get_available_requests — verified only, ZERO PII cliente,
--     nessun UUID campagna reale (solo marketplace_code opaco).
-- ---------------------------------------------------------------------------
create or replace function public.supplier_get_available_requests()
returns table (
  request_code text,
  service_type text,
  target_quantity integer,
  distribution_mode text,
  distribution_start_date date,
  distribution_end_date date,
  zone_name text,
  radius_m integer,
  status text
) language plpgsql stable security definer set search_path to '' as $$
begin
  if not (public.jwt_is_admin() or public.is_verified_supplier(auth.uid())) then
    raise exception 'FORNITORE_NON_VERIFICATO' using errcode = '42501';
  end if;

  return query
  select
    c.marketplace_code,
    c.service_type,
    c.target_quantity,
    c.distribution_mode,
    c.distribution_start_date,
    c.distribution_end_date,
    c.zone_name,
    c.radius_m,
    c.status
  from public.campaigns c
  where c.status in ('requested', 'receiving_quotes')
    and c.supplier_id is null
    and c.marketplace_code is not null;
end;
$$;
revoke all on function public.supplier_get_available_requests() from public, anon;
grant execute on function public.supplier_get_available_requests() to authenticated;

-- ---------------------------------------------------------------------------
-- 11. supplier_submit_quote — supplier_id server-side, verified gate,
--     campagna disponibile, niente duplicati attivi.
-- ---------------------------------------------------------------------------
create or replace function public.supplier_submit_quote(
  p_request_code text,
  p_total_amount numeric,
  p_estimated_time text default null,
  p_availability text default null,
  p_allowed_public_notes text default null,
  p_valid_until timestamptz default null
) returns public.quotes
  language plpgsql security definer set search_path to '' as $$
declare
  v_uid uuid := auth.uid();
  v_campaign public.campaigns%rowtype;
  v_quote public.quotes%rowtype;
begin
  if v_uid is null then raise exception 'NON_AUTENTICATO' using errcode = '42501'; end if;
  if not public.is_verified_supplier(v_uid) then
    raise exception 'FORNITORE_NON_VERIFICATO' using errcode = '42501';
  end if;
  if p_total_amount is null or p_total_amount <= 0 then
    raise exception 'IMPORTO_NON_VALIDO' using errcode = '22023';
  end if;

  select * into v_campaign from public.campaigns
    where marketplace_code = p_request_code for update;
  if not found then raise exception 'RICHIESTA_NON_TROVATA' using errcode = 'P0002'; end if;
  if v_campaign.status not in ('requested', 'receiving_quotes') or v_campaign.supplier_id is not null then
    raise exception 'RICHIESTA_NON_DISPONIBILE' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.quotes q
    where q.campaign_id = v_campaign.id and q.supplier_id = v_uid and q.quote_status = 'submitted'
  ) then
    raise exception 'OFFERTA_GIA_INVIATA' using errcode = '23505';
  end if;

  perform set_config('marketplace.rpc', 'on', true);
  insert into public.quotes
    (campaign_id, supplier_id, quote_status, subtotal, total_amount, currency,
     estimated_time, availability, allowed_public_notes, valid_until, submitted_at)
  values
    (v_campaign.id, v_uid, 'submitted', p_total_amount, p_total_amount, 'EUR',
     nullif(btrim(p_estimated_time), ''), nullif(btrim(p_availability), ''),
     nullif(btrim(p_allowed_public_notes), ''), p_valid_until, now())
  returning * into v_quote;

  if v_campaign.status = 'requested' then
    update public.campaigns set status = 'receiving_quotes' where id = v_campaign.id;
  end if;

  return v_quote;
end;
$$;
revoke all on function public.supplier_submit_quote(text, numeric, text, text, text, timestamptz) from public, anon;
grant execute on function public.supplier_submit_quote(text, numeric, text, text, text, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- 12. customer_accept_supplier_quote — input SOLO target_quote_id;
--     SINGLE WINNER con lock; idempotente; legacy-safe.
-- ---------------------------------------------------------------------------
create or replace function public.customer_accept_supplier_quote(p_quote_id uuid)
returns public.campaigns
  language plpgsql security definer set search_path to '' as $$
declare
  v_uid uuid := auth.uid();
  v_quote public.quotes%rowtype;
  v_campaign public.campaigns%rowtype;
begin
  if v_uid is null then raise exception 'NON_AUTENTICATO' using errcode = '42501'; end if;

  select * into v_quote from public.quotes where id = p_quote_id for update;
  if not found then raise exception 'OFFERTA_NON_TROVATA' using errcode = 'P0002'; end if;
  if v_quote.supplier_id is null then
    raise exception 'OFFERTA_NON_MARKETPLACE' using errcode = '22023';
  end if;

  select * into v_campaign from public.campaigns where id = v_quote.campaign_id for update;
  if not found then raise exception 'CAMPAGNA_NON_TROVATA' using errcode = 'P0002'; end if;
  if not (v_campaign.user_id = v_uid or public.jwt_is_admin()) then
    raise exception 'CAMPAGNA_NON_AUTORIZZATA' using errcode = '42501';
  end if;

  -- Idempotenza: stessa quota gia' accettata per questa campagna -> no-op.
  if v_quote.quote_status = 'accepted' and v_campaign.supplier_id = v_quote.supplier_id then
    return v_campaign;
  end if;

  -- Secondo tentativo su un vincitore diverso -> FAIL.
  if v_campaign.supplier_id is not null then
    raise exception 'CAMPAGNA_GIA_ASSEGNATA' using errcode = '42501';
  end if;
  if v_campaign.status not in ('requested', 'receiving_quotes') then
    raise exception 'CAMPAGNA_STATO_NON_COMPATIBILE' using errcode = '42501';
  end if;
  if v_quote.quote_status <> 'submitted' then
    raise exception 'OFFERTA_NON_ACCETTABILE' using errcode = '42501';
  end if;
  if v_quote.valid_until is not null and v_quote.valid_until <= now() then
    raise exception 'OFFERTA_SCADUTA' using errcode = '42501';
  end if;
  if not public.is_verified_supplier(v_quote.supplier_id) then
    raise exception 'FORNITORE_NON_PIU_VERIFICATO' using errcode = '42501';
  end if;

  perform set_config('marketplace.rpc', 'on', true);

  update public.quotes set quote_status = 'accepted', decided_at = now()
    where id = p_quote_id;

  -- Le altre offerte FORNITORE -> not_selected. MAI le quote piattaforma legacy.
  update public.quotes set quote_status = 'not_selected', decided_at = now()
    where campaign_id = v_campaign.id
      and id <> p_quote_id
      and supplier_id is not null
      and quote_status in ('submitted', 'draft');

  update public.campaigns
    set supplier_id = v_quote.supplier_id, status = 'quote_selected'
    where id = v_campaign.id
    returning * into v_campaign;

  return v_campaign;
end;
$$;
revoke all on function public.customer_accept_supplier_quote(uuid) from public, anon;
grant execute on function public.customer_accept_supplier_quote(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 13. supplier_list_own_quotes / supplier_list_assigned_campaigns
-- ---------------------------------------------------------------------------
create or replace function public.supplier_list_own_quotes()
returns table (
  quote_id uuid, request_code text, service_type text, total_amount numeric,
  quote_status text, valid_until timestamptz, submitted_at timestamptz, decided_at timestamptz
) language plpgsql stable security definer set search_path to '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'NON_AUTENTICATO' using errcode = '42501'; end if;
  return query
  select q.id, c.marketplace_code, c.service_type, q.total_amount, q.quote_status,
         q.valid_until, q.submitted_at, q.decided_at
  from public.quotes q
  join public.campaigns c on c.id = q.campaign_id
  where q.supplier_id = v_uid
  order by q.submitted_at desc nulls last;
end;
$$;
revoke all on function public.supplier_list_own_quotes() from public, anon;
grant execute on function public.supplier_list_own_quotes() to authenticated;

create or replace function public.supplier_list_assigned_campaigns()
returns table (
  campaign_id uuid, request_code text, service_type text, target_quantity integer,
  distribution_start_date date, distribution_end_date date, zone_name text, radius_m integer, status text
) language plpgsql stable security definer set search_path to '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'NON_AUTENTICATO' using errcode = '42501'; end if;
  return query
  select c.id, c.marketplace_code, c.service_type, c.target_quantity,
         c.distribution_start_date, c.distribution_end_date, c.zone_name, c.radius_m, c.status
  from public.campaigns c
  where c.supplier_id = v_uid
  order by c.distribution_start_date asc nulls last;
end;
$$;
revoke all on function public.supplier_list_assigned_campaigns() from public, anon;
grant execute on function public.supplier_list_assigned_campaigns() to authenticated;

-- ---------------------------------------------------------------------------
-- 14. Operatori Fornitore — isolamento: Supplier A NON puo' usare i driver
--     di Supplier B, ne' assegnarli a campagne non sue.
-- ---------------------------------------------------------------------------
create or replace function public.supplier_list_own_operators()
returns table (operator_id uuid, display_name text, active boolean)
  language plpgsql stable security definer set search_path to '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'NON_AUTENTICATO' using errcode = '42501'; end if;
  return query
  select op.user_id, op.display_name, op.active
  from public.operator_profiles op
  where op.supplier_id = v_uid;
end;
$$;
revoke all on function public.supplier_list_own_operators() from public, anon;
grant execute on function public.supplier_list_own_operators() to authenticated;

create or replace function public.supplier_assign_operator(p_operator_id uuid, p_campaign_id uuid)
returns public.operator_assignments
  language plpgsql security definer set search_path to '' as $$
declare
  v_uid uuid := auth.uid();
  v_group_id uuid;
  v_row public.operator_assignments%rowtype;
begin
  if v_uid is null then raise exception 'NON_AUTENTICATO' using errcode = '42501'; end if;
  if not public.is_verified_supplier(v_uid) then
    raise exception 'FORNITORE_NON_VERIFICATO' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.operator_profiles op
    where op.user_id = p_operator_id and op.supplier_id = v_uid
  ) then
    raise exception 'OPERATORE_NON_DEL_FORNITORE' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.campaigns c
    where c.id = p_campaign_id and c.supplier_id = v_uid
  ) then
    raise exception 'CAMPAGNA_NON_DEL_FORNITORE' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.operator_assignments a
    where a.campaign_id = p_campaign_id and a.operator_id = p_operator_id and a.revoked_at is null
  ) then
    raise exception 'ASSEGNAZIONE_GIA_PRESENTE' using errcode = '23505';
  end if;

  select a.group_id into v_group_id from public.operator_assignments a
    where a.campaign_id = p_campaign_id limit 1;
  if v_group_id is null then v_group_id := gen_random_uuid(); end if;

  insert into public.operator_assignments (operator_id, campaign_id, group_id, status, created_by)
  values (p_operator_id, p_campaign_id, v_group_id, 'active', v_uid)
  returning * into v_row;
  return v_row;
end;
$$;
revoke all on function public.supplier_assign_operator(uuid, uuid) from public, anon;
grant execute on function public.supplier_assign_operator(uuid, uuid) to authenticated;

commit;
