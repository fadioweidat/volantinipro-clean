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
  status text not null default 'confermata' check (status in ('bozza', 'confermata', 'in_preparazione', 'distribuzione', 'completata', 'annullata')),
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

create table if not exists public.smart_pairing_waitlist (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references public.clienti(id) on delete set null,
  email text not null,
  telefono text,
  zone text not null,
  preferred_period text,
  note text,
  status text not null default 'open' check (status in ('open', 'matched', 'notified', 'closed')),
  created_at timestamptz not null default now()
);

create table if not exists public.tracking_gps (
  id uuid primary key default gen_random_uuid(),
  campagna_id uuid not null references public.campagne(id) on delete cascade,
  distributor_name text,
  lat double precision not null,
  lng double precision not null,
  flyers_distributed integer not null default 0 check (flyers_distributed >= 0),
  recorded_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.zone_admin (
  id uuid primary key default gen_random_uuid(),
  zone_id text not null,
  zone_name text not null,
  service_type text not null check (service_type in ('d2d', 'h2h', 'b2b')),
  source text not null default 'mock',
  score integer check (score between 0 and 100),
  data jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (zone_id, service_type)
);

alter table public.clienti enable row level security;
alter table public.campagne enable row level security;
alter table public.smart_pairing_waitlist enable row level security;
alter table public.tracking_gps enable row level security;
alter table public.zone_admin enable row level security;

create policy "clienti_select_own"
on public.clienti for select
using (auth.uid() = user_id);

create policy "clienti_insert_own"
on public.clienti for insert
with check (auth.uid() = user_id);

create policy "clienti_update_own"
on public.clienti for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "campagne_select_own"
on public.campagne for select
using (exists (
  select 1 from public.clienti c
  where c.id = campagne.cliente_id and c.user_id = auth.uid()
));

create policy "campagne_insert_own"
on public.campagne for insert
with check (exists (
  select 1 from public.clienti c
  where c.id = campagne.cliente_id and c.user_id = auth.uid()
));

create policy "campagne_update_own"
on public.campagne for update
using (exists (
  select 1 from public.clienti c
  where c.id = campagne.cliente_id and c.user_id = auth.uid()
))
with check (exists (
  select 1 from public.clienti c
  where c.id = campagne.cliente_id and c.user_id = auth.uid()
));

create policy "waitlist_insert_public"
on public.smart_pairing_waitlist for insert
with check (true);

create policy "waitlist_select_own"
on public.smart_pairing_waitlist for select
using (
  cliente_id is not null and exists (
    select 1 from public.clienti c
    where c.id = smart_pairing_waitlist.cliente_id and c.user_id = auth.uid()
  )
);

create policy "tracking_select_campaign_owner"
on public.tracking_gps for select
using (exists (
  select 1
  from public.campagne ca
  join public.clienti c on c.id = ca.cliente_id
  where ca.id = tracking_gps.campagna_id and c.user_id = auth.uid()
));

create policy "zone_admin_read_authenticated"
on public.zone_admin for select
to authenticated
using (true);

-- Admin writes should be performed with the service role key from trusted backend/Edge Functions.

-- ==========================================
-- NEW MULTI-ZONE CAMPAIGNS TABLES (STEP 5)
-- ==========================================

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.clienti(id) on delete cascade,
  title text not null,
  campaign_type text check (campaign_type in ('national', 'regional', 'multi_store', 'multi_city', 'multi_service', 'standard')),
  total_flyers integer not null default 0,
  total_budget numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.campaign_zones (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  zone_order integer not null default 0,
  service_type text not null check (service_type in ('d2d', 'h2h', 'b2b')),
  service_variant text,
  zone_label text,
  store_name text,
  center_lat double precision,
  center_lng double precision,
  radius_km double precision,
  municipality_code text,
  municipality_name text,
  assigned_flyers integer not null default 0,
  assigned_budget numeric(12,2) not null default 0,
  coverage_percent numeric(5,2) default 0,
  recommended_flyers integer default 0,
  start_date date,
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS Enable
alter table public.campaigns enable row level security;
alter table public.campaign_zones enable row level security;

-- Policies for campaigns
create policy "campaigns_select_own"
on public.campaigns for select
using (exists (
  select 1 from public.clienti c
  where c.id = campaigns.customer_id and c.user_id = auth.uid()
));

create policy "campaigns_insert_own"
on public.campaigns for insert
with check (exists (
  select 1 from public.clienti c
  where c.id = campaigns.customer_id and c.user_id = auth.uid()
));

create policy "campaigns_update_own"
on public.campaigns for update
using (exists (
  select 1 from public.clienti c
  where c.id = campaigns.customer_id and c.user_id = auth.uid()
))
with check (exists (
  select 1 from public.clienti c
  where c.id = campaigns.customer_id and c.user_id = auth.uid()
));

create policy "campaigns_delete_own"
on public.campaigns for delete
using (exists (
  select 1 from public.clienti c
  where c.id = campaigns.customer_id and c.user_id = auth.uid()
));

-- Policies for campaign_zones
create policy "campaign_zones_select_campaign_owner"
on public.campaign_zones for select
using (exists (
  select 1 from public.campaigns ca
  join public.clienti c on c.id = ca.customer_id
  where ca.id = campaign_zones.campaign_id and c.user_id = auth.uid()
));

create policy "campaign_zones_insert_campaign_owner"
on public.campaign_zones for insert
with check (exists (
  select 1 from public.campaigns ca
  join public.clienti c on c.id = ca.customer_id
  where ca.id = campaign_zones.campaign_id and c.user_id = auth.uid()
));

create policy "campaign_zones_update_campaign_owner"
on public.campaign_zones for update
using (exists (
  select 1 from public.campaigns ca
  join public.clienti c on c.id = ca.customer_id
  where ca.id = campaign_zones.campaign_id and c.user_id = auth.uid()
))
with check (exists (
  select 1 from public.campaigns ca
  join public.clienti c on c.id = ca.customer_id
  where ca.id = campaign_zones.campaign_id and c.user_id = auth.uid()
));

create policy "campaign_zones_delete_campaign_owner"
on public.campaign_zones for delete
using (exists (
  select 1 from public.campaigns ca
  join public.clienti c on c.id = ca.customer_id
  where ca.id = campaign_zones.campaign_id and c.user_id = auth.uid()
));
