-- The original project bootstrap lived only in supabase/schema.sql, which is
-- not replayed by `supabase db reset`. Keep the legacy customer/campaign
-- prerequisites in the first migration so the chain is self-contained.
create extension if not exists pgcrypto;

create table if not exists public.clienti (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete cascade,
  email text unique not null,
  nome text,
  telefono text,
  azienda text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.campagne (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clienti(id) on delete cascade,
  service_type text not null check (service_type in ('d2d', 'h2h', 'b2b')),
  status text not null default 'confermata'
    check (status in ('bozza', 'confermata', 'in_preparazione', 'distribuzione', 'completata', 'annullata')),
  city_name text,
  zone_ids text[] not null default '{}',
  flyer_quantity integer not null default 0 check (flyer_quantity >= 0),
  flyer_format text,
  start_date date,
  end_date date,
  smart_pairing_discount numeric(5,2) not null default 0,
  total_amount numeric(12,2) not null default 0,
  quote_pdf_url text,
  report_pdf_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.clienti enable row level security;
alter table public.campagne enable row level security;

drop policy if exists clienti_select_own on public.clienti;
create policy clienti_select_own on public.clienti
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists clienti_insert_own on public.clienti;
create policy clienti_insert_own on public.clienti
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists clienti_update_own on public.clienti;
create policy clienti_update_own on public.clienti
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists campagne_select_own on public.campagne;
create policy campagne_select_own on public.campagne
  for select to authenticated
  using (exists (
    select 1 from public.clienti c
    where c.id = campagne.cliente_id and c.user_id = auth.uid()
  ));

drop policy if exists campagne_insert_own on public.campagne;
create policy campagne_insert_own on public.campagne
  for insert to authenticated
  with check (exists (
    select 1 from public.clienti c
    where c.id = campagne.cliente_id and c.user_id = auth.uid()
  ));

drop policy if exists campagne_update_own on public.campagne;
create policy campagne_update_own on public.campagne
  for update to authenticated
  using (exists (
    select 1 from public.clienti c
    where c.id = campagne.cliente_id and c.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.clienti c
    where c.id = campagne.cliente_id and c.user_id = auth.uid()
  ));

alter table public.campagne add column if not exists
  stato_pagamento text default 'in_attesa'
  check (stato_pagamento in ('in_attesa','pagato','annullato'));

alter table public.campagne add column if not exists
  pagamento_tipo text default 'bonifico';

alter table public.campagne add column if not exists
  pagamento_confermato_at timestamptz;

alter table public.campagne add column if not exists
  causale_bonifico text;

create or replace function public.genera_causale()
returns trigger as $$
begin
  if new.causale_bonifico is null then
    new.causale_bonifico := 'VP-' ||
      to_char(now(), 'YYYYMMDD') || '-' ||
      upper(substring(new.id::text, 1, 6));
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_causale on public.campagne;

create trigger set_causale
  before insert on public.campagne
  for each row execute function public.genera_causale();
