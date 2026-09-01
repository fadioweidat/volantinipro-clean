-- Analytics Visitatori — FASE 2. Additiva su public.site_events
-- (20260825190000_site_traffic_events.sql). Nessuna modifica a schema
-- GPS/coverage.
--
-- Questa migration è AUTOSUFFICIENTE e IDEMPOTENTE: funziona sia se la
-- migration base site_events è già applicata sul DB live, sia se non lo è
-- (CREATE TABLE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS + DROP/CREATE POLICY).
--
-- Privacy (decisioni FASE 2): mai IP, mai coordinate, mai CAP/indirizzo.
-- Solo country/region/city approssimativa (aggiunte da /api/track via header
-- Vercel). visitor id con TTL 90gg lato client. Retention: raw 90 giorni,
-- rollup 13 mesi (pg_cron sotto).

begin;

-- ---------------------------------------------------------------------------
-- 1. site_events — shape completo (no-op se già esiste)
-- ---------------------------------------------------------------------------
create table if not exists public.site_events (
  id uuid not null default gen_random_uuid(),
  event_name text not null,
  created_at timestamptz not null default now(),
  anonymous_session_id uuid not null,
  path text,
  campaign_id uuid,
  quote_id uuid,
  constraint site_events_pkey primary key (id)
);

-- colonne FASE 2 (tutte nullable, nessuna rottura per i lettori esistenti:
-- platformFlows / platformEvents / CommercialCenter / PlatformStatus)
alter table public.site_events add column if not exists session_id uuid;
alter table public.site_events add column if not exists referrer_host text;
alter table public.site_events add column if not exists referrer_type text;
alter table public.site_events add column if not exists utm_source text;
alter table public.site_events add column if not exists utm_medium text;
alter table public.site_events add column if not exists utm_campaign text;
alter table public.site_events add column if not exists utm_content text;
alter table public.site_events add column if not exists utm_term text;
alter table public.site_events add column if not exists country text;
alter table public.site_events add column if not exists region text;
alter table public.site_events add column if not exists city text;
alter table public.site_events add column if not exists device_type text;
alter table public.site_events add column if not exists browser text;
alter table public.site_events add column if not exists os text;
alter table public.site_events add column if not exists metadata jsonb not null default '{}'::jsonb;

comment on table public.site_events is 'Analytics visitatori first-party, privacy-safe. Nessun PII. anon: solo INSERT (allowlist event_name). admin/super_admin: solo SELECT. Retention raw 90 giorni.';

-- PATCH A — semantica esplicita delle due colonne identificative.
-- Il nome "anonymous_session_id" e storico: NON e una sessione, e il visitor id.
comment on column public.site_events.anonymous_session_id is
'Legacy column name: contiene l''anonymous visitor ID persistente, non la sessione. TTL 90 giorni lato client.';
comment on column public.site_events.session_id is
'ID anonimo della sessione/tab corrente. Nullable per gli eventi storici.';

-- allowlist event_name estesa (NOT VALID: non riscansiona lo storico)
alter table public.site_events drop constraint if exists site_events_event_name_check;
alter table public.site_events add constraint site_events_event_name_check check (
  event_name = any (array[
    'page_view','session_started','quote_started','quote_completed','consultation_requested',
    'municipality_selected','quantity_selected','service_selected','extras_selected',
    'quote_step_reached','quote_abandoned'
  ]::text[])
) not valid;

alter table public.site_events drop constraint if exists site_events_device_type_check;
alter table public.site_events add constraint site_events_device_type_check check (
  device_type is null or device_type = any (array['mobile','desktop','tablet','bot']::text[])
) not valid;

-- indici (i primi 3 possono già esistere dalla base)
create index if not exists site_events_created_at_idx on public.site_events (created_at desc);
create index if not exists site_events_event_name_created_at_idx on public.site_events (event_name, created_at desc);
create index if not exists site_events_anonymous_session_id_idx on public.site_events (anonymous_session_id);
create index if not exists site_events_session_id_idx on public.site_events (session_id);
create index if not exists site_events_country_created_at_idx on public.site_events (country, created_at desc) where country is not null;
create index if not exists site_events_city_created_at_idx on public.site_events (city, created_at desc) where city is not null;
create index if not exists site_events_utm_source_created_at_idx on public.site_events (utm_source, created_at desc) where utm_source is not null;

alter table public.site_events enable row level security;

drop policy if exists site_events_insert_anon on public.site_events;
create policy site_events_insert_anon on public.site_events
  for insert to anon
  with check (event_name = any (array[
    'page_view','session_started','quote_started','quote_completed','consultation_requested',
    'municipality_selected','quantity_selected','service_selected','extras_selected',
    'quote_step_reached','quote_abandoned'
  ]::text[]));

drop policy if exists site_events_insert_authenticated on public.site_events;
create policy site_events_insert_authenticated on public.site_events
  for insert to authenticated
  with check (event_name = any (array[
    'page_view','session_started','quote_started','quote_completed','consultation_requested',
    'municipality_selected','quantity_selected','service_selected','extras_selected',
    'quote_step_reached','quote_abandoned'
  ]::text[]));

drop policy if exists site_events_admin_all on public.site_events;
create policy site_events_admin_all on public.site_events to authenticated
  using (exists (select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = any (array['admin','super_admin']::text[])))
  with check (exists (select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = any (array['admin','super_admin']::text[])));

grant insert on public.site_events to anon;
grant insert, select on public.site_events to authenticated;

-- ---------------------------------------------------------------------------
-- 2. analytics_daily_rollup — aggregati per giorno × dimensione
-- ---------------------------------------------------------------------------
create table if not exists public.analytics_daily_rollup (
  day date not null,
  dimension text not null,   -- overview|country|region|city|source|page|device|funnel_step|municipality|service|quantity_bucket
  key text not null,
  visitors integer not null default 0,
  sessions integer not null default 0,
  page_views integer not null default 0,
  events integer not null default 0,
  quotes_started integer not null default 0,
  quotes_completed integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint analytics_daily_rollup_pkey primary key (day, dimension, key)
);
create index if not exists analytics_daily_rollup_day_idx on public.analytics_daily_rollup (day desc);
comment on table public.analytics_daily_rollup is 'Rollup giornaliero di site_events per la dashboard Analytics Visitatori. Scritto solo da analytics_run_daily_rollup (service role / pg_cron). Retention 13 mesi.';

alter table public.analytics_daily_rollup enable row level security;
drop policy if exists analytics_daily_rollup_admin_read on public.analytics_daily_rollup;
create policy analytics_daily_rollup_admin_read on public.analytics_daily_rollup
  for select to authenticated
  using (exists (select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = any (array['admin','super_admin']::text[])));
-- nessuna policy insert/update/delete: solo service role (bypassa RLS)
grant select on public.analytics_daily_rollup to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Funzione di rollup — idempotente per (day)
-- ---------------------------------------------------------------------------
create or replace function public.analytics_run_daily_rollup(p_day date default ((now() at time zone 'Europe/Rome')::date - 1))
returns void
  language plpgsql security definer set search_path to ''
as $$
declare
  v_from timestamptz := (p_day::timestamp at time zone 'Europe/Rome');
  v_to timestamptz := ((p_day + 1)::timestamp at time zone 'Europe/Rome');
begin
  delete from public.analytics_daily_rollup where day = p_day;

  -- PATCH B — session_uid = coalesce(session_id, anonymous_session_id).
  -- Per gli eventi storici session_id IS NULL, quindi session_uid degrada al
  -- visitor id (stesso fallback gia usato dal funnel). Nessun backfill.
  --   visitors = count(distinct anonymous_session_id)   (INVARIATO)
  --   sessions = count(distinct session_uid)            (era: count session_started)
  with ev as (
    select *, pg_catalog.coalesce(session_id, anonymous_session_id) as session_uid
    from public.site_events where created_at >= v_from and created_at < v_to
  )
  insert into public.analytics_daily_rollup (day, dimension, key, visitors, sessions, page_views, events, quotes_started, quotes_completed)
  -- overview
  select p_day, 'overview', 'all',
    pg_catalog.count(distinct anonymous_session_id),
    pg_catalog.count(distinct session_uid),
    pg_catalog.count(*) filter (where event_name = 'page_view'),
    pg_catalog.count(*),
    pg_catalog.count(*) filter (where event_name = 'quote_started'),
    pg_catalog.count(*) filter (where event_name = 'quote_completed')
  from ev
  union all
  -- country / region / city
  select p_day, 'country', country,
    pg_catalog.count(distinct anonymous_session_id), pg_catalog.count(distinct session_uid),
    0, pg_catalog.count(*), 0, 0
  from ev where country is not null group by country
  union all
  select p_day, 'region', region,
    pg_catalog.count(distinct anonymous_session_id), pg_catalog.count(distinct session_uid),
    0, pg_catalog.count(*), 0, 0
  from ev where region is not null group by region
  union all
  select p_day, 'city', city,
    pg_catalog.count(distinct anonymous_session_id), pg_catalog.count(distinct session_uid),
    0, pg_catalog.count(*), 0, 0
  from ev where city is not null group by city
  union all
  -- source (semplificata: utm_source | referrer_type | direct)
  select p_day, 'source', pg_catalog.coalesce(nullif(utm_source, ''), nullif(referrer_type, ''), 'direct'),
    pg_catalog.count(distinct anonymous_session_id), pg_catalog.count(distinct session_uid),
    0, pg_catalog.count(*), 0, 0
  from ev group by 3
  union all
  -- page
  select p_day, 'page', path,
    0,
    pg_catalog.count(distinct session_uid) filter (where event_name = 'page_view'),
    pg_catalog.count(*) filter (where event_name = 'page_view'),
    pg_catalog.count(*), 0, 0
  from ev where path is not null and event_name = 'page_view' group by path
  union all
  -- device
  select p_day, 'device', device_type,
    pg_catalog.count(distinct anonymous_session_id), pg_catalog.count(distinct session_uid),
    0, pg_catalog.count(*), 0, 0
  from ev where device_type is not null group by device_type
  union all
  -- funnel step (sessioni distinte che raggiungono lo stadio)
  select p_day, 'funnel_step', s.stage, 0, pg_catalog.count(distinct s.sid), 0, 0, 0, 0
  from (
    select 'homepage'::text as stage, pg_catalog.coalesce(session_id, anonymous_session_id) as sid from ev
      where event_name = 'page_view' and pg_catalog.lower(pg_catalog.coalesce(path,'')) in ('/', '', '/index.html', '/home')
    union all
    select 'quote', pg_catalog.coalesce(session_id, anonymous_session_id) from ev
      where event_name = 'quote_started'
         or (event_name = 'page_view' and (pg_catalog.lower(path) like '/preventivo%' or pg_catalog.lower(path) like '/configuratore%'))
         or (event_name = 'quote_step_reached' and (metadata->>'step') = '1')
    union all
    select 'municipality', pg_catalog.coalesce(session_id, anonymous_session_id) from ev where event_name = 'municipality_selected'
    union all
    select 'quantity', pg_catalog.coalesce(session_id, anonymous_session_id) from ev where event_name = 'quantity_selected'
    union all
    select 'step3', pg_catalog.coalesce(session_id, anonymous_session_id) from ev where event_name = 'quote_step_reached' and (metadata->>'step') = '3'
    union all
    select 'step4', pg_catalog.coalesce(session_id, anonymous_session_id) from ev where event_name = 'quote_step_reached' and (metadata->>'step') = '4'
    union all
    select 'completed', pg_catalog.coalesce(session_id, anonymous_session_id) from ev where event_name = 'quote_completed'
  ) s
  where s.sid is not null
  group by s.stage
  union all
  -- domanda commerciale
  select p_day, 'municipality', metadata->>'municipality', pg_catalog.count(distinct anonymous_session_id), 0, 0, pg_catalog.count(*), 0, 0
  from ev where event_name = 'municipality_selected' and metadata->>'municipality' is not null group by metadata->>'municipality'
  union all
  select p_day, 'service', metadata->>'service', 0, 0, 0, pg_catalog.count(*), 0, 0
  from ev where metadata->>'service' is not null group by metadata->>'service'
  union all
  select p_day, 'quantity_bucket', metadata->>'quantity_bucket', 0, 0, 0, pg_catalog.count(*), 0, 0
  from ev where metadata->>'quantity_bucket' is not null group by metadata->>'quantity_bucket';
end;
$$;

alter function public.analytics_run_daily_rollup(date) owner to postgres;
revoke all on function public.analytics_run_daily_rollup(date) from public;
grant execute on function public.analytics_run_daily_rollup(date) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Prune — raw 90 giorni, rollup 13 mesi
-- ---------------------------------------------------------------------------
create or replace function public.analytics_prune(p_raw_days integer default 90, p_rollup_months integer default 13)
returns void
  language plpgsql security definer set search_path to ''
as $$
begin
  delete from public.site_events
  where created_at < now() - (pg_catalog.greatest(p_raw_days, 1) || ' days')::interval;
  delete from public.analytics_daily_rollup
  where day < (now() at time zone 'Europe/Rome')::date - (pg_catalog.greatest(p_rollup_months, 1) * 31);
end;
$$;
alter function public.analytics_prune(integer, integer) owner to postgres;
revoke all on function public.analytics_prune(integer, integer) from public;
grant execute on function public.analytics_prune(integer, integer) to service_role;

commit;

-- ---------------------------------------------------------------------------
-- 5. pg_cron — rollup + prune notturni. Guardato: se pg_cron non è
--    abilitato, la migration NON fallisce; abilitare l'estensione dal
--    dashboard Supabase e rilanciare solo questo blocco.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
  end if;

  if to_regproc('cron.schedule(text,text,text)') is not null then
    perform cron.unschedule('analytics_daily_rollup') where exists (select 1 from cron.job where jobname = 'analytics_daily_rollup');
    perform cron.unschedule('analytics_prune') where exists (select 1 from cron.job where jobname = 'analytics_prune');
    -- 02:15 ogni notte: rollup del giorno precedente
    perform cron.schedule('analytics_daily_rollup', '15 2 * * *', $cron$select public.analytics_run_daily_rollup();$cron$);
    -- 03:15 ogni notte: prune raw > 90gg e rollup > 13 mesi
    perform cron.schedule('analytics_prune', '15 3 * * *', $cron$select public.analytics_prune(90, 13);$cron$);
  else
    raise notice 'pg_cron non disponibile: abilitare l''estensione e schedulare analytics_run_daily_rollup / analytics_prune manualmente.';
  end if;
end;
$$;
