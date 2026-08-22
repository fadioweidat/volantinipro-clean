create table if not exists public.gtfs_routes (
  id uuid primary key default gen_random_uuid(), source text not null, agency text, route_id text not null,
  route_short_name text, route_long_name text, route_type integer, raw_payload jsonb not null default '{}'::jsonb,
  imported_at timestamptz not null default now(), unique (source, route_id)
);
create table if not exists public.gtfs_stop_times (
  id bigint generated always as identity primary key, source text not null, trip_id text not null, route_id text,
  stop_id text not null, arrival_time text, departure_time text, stop_sequence integer not null,
  raw_payload jsonb not null default '{}'::jsonb, imported_at timestamptz not null default now(),
  unique (source, trip_id, stop_sequence)
);
create index if not exists gtfs_stop_times_stop_idx on public.gtfs_stop_times (source, stop_id);
create index if not exists gtfs_stop_times_route_idx on public.gtfs_stop_times (source, route_id);

create or replace function public.upsert_gtfs_routes_batch(rows jsonb)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare affected integer := jsonb_array_length(coalesce(rows, '[]'::jsonb));
begin
  insert into public.gtfs_routes (source, agency, route_id, route_short_name, route_long_name, route_type, raw_payload)
  select item->>'source', nullif(item->>'agency',''), item->>'route_id', nullif(item->>'route_short_name',''),
    nullif(item->>'route_long_name',''), nullif(item->>'route_type','')::integer, item
  from jsonb_array_elements(coalesce(rows, '[]'::jsonb)) item
  on conflict (source, route_id) do update set agency=excluded.agency, route_short_name=excluded.route_short_name,
    route_long_name=excluded.route_long_name, route_type=excluded.route_type, raw_payload=excluded.raw_payload, imported_at=now();
  return affected;
end $$;

create or replace function public.upsert_gtfs_stop_times_batch(rows jsonb)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare affected integer := jsonb_array_length(coalesce(rows, '[]'::jsonb));
begin
  insert into public.gtfs_stop_times (source, trip_id, route_id, stop_id, arrival_time, departure_time, stop_sequence, raw_payload)
  select item->>'source', item->>'trip_id', nullif(item->>'route_id',''), item->>'stop_id',
    nullif(item->>'arrival_time',''), nullif(item->>'departure_time',''), (item->>'stop_sequence')::integer, item
  from jsonb_array_elements(coalesce(rows, '[]'::jsonb)) item
  on conflict (source, trip_id, stop_sequence) do update set route_id=excluded.route_id, stop_id=excluded.stop_id,
    arrival_time=excluded.arrival_time, departure_time=excluded.departure_time, raw_payload=excluded.raw_payload, imported_at=now();
  return affected;
end $$;

alter table public.gtfs_routes enable row level security;
alter table public.gtfs_stop_times enable row level security;
drop policy if exists gtfs_routes_read_public on public.gtfs_routes;
drop policy if exists gtfs_stop_times_read_public on public.gtfs_stop_times;
create policy gtfs_routes_read_public on public.gtfs_routes for select using (true);
create policy gtfs_stop_times_read_public on public.gtfs_stop_times for select using (true);
grant select on public.gtfs_routes, public.gtfs_stop_times to anon, authenticated, service_role;
grant execute on function public.upsert_gtfs_routes_batch(jsonb), public.upsert_gtfs_stop_times_batch(jsonb) to service_role;
revoke execute on function public.upsert_gtfs_routes_batch(jsonb), public.upsert_gtfs_stop_times_batch(jsonb) from anon, authenticated;
