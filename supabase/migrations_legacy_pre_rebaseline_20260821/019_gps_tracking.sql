create extension if not exists pgcrypto;
create extension if not exists postgis;

create table if not exists public.delivery_sessions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null,
  driver_id uuid not null,
  status text not null check (status in ('started', 'paused', 'completed', 'cancelled')),
  started_at timestamptz,
  paused_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists public.gps_tracking_points (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null,
  session_id uuid not null references public.delivery_sessions(id) on delete cascade,
  driver_id uuid not null,
  lat double precision not null,
  lng double precision not null,
  accuracy double precision,
  speed double precision,
  heading double precision,
  recorded_at timestamptz not null,
  created_at timestamptz default now(),
  geom geometry(Point, 4326)
);

create table if not exists public.proof_photos (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null,
  session_id uuid references public.delivery_sessions(id) on delete set null,
  driver_id uuid,
  storage_path text not null,
  lat double precision,
  lng double precision,
  note text,
  taken_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists gps_tracking_points_geom_gix on public.gps_tracking_points using gist (geom);
create index if not exists gps_tracking_points_campaign_id_idx on public.gps_tracking_points (campaign_id);
create index if not exists gps_tracking_points_session_id_idx on public.gps_tracking_points (session_id);
create index if not exists gps_tracking_points_driver_id_idx on public.gps_tracking_points (driver_id);
create index if not exists delivery_sessions_campaign_id_idx on public.delivery_sessions (campaign_id);
create index if not exists proof_photos_campaign_id_idx on public.proof_photos (campaign_id);

create or replace function public.set_gps_tracking_point_geom()
returns trigger
language plpgsql
as $$
begin
  new.geom := ST_SetSRID(ST_MakePoint(new.lng, new.lat), 4326);
  return new;
end;
$$;

drop trigger if exists gps_tracking_points_set_geom on public.gps_tracking_points;
create trigger gps_tracking_points_set_geom
before insert or update of lat, lng on public.gps_tracking_points
for each row execute function public.set_gps_tracking_point_geom();

create or replace function public.jwt_is_admin()
returns boolean
language sql
stable
as $$
  select coalesce(auth.role() = 'service_role', false)
    or coalesce(auth.jwt() ->> 'role', '') in ('admin', 'super_admin')
    or coalesce(auth.jwt() ->> 'app_role', '') in ('admin', 'super_admin');
$$;

create or replace function public.current_user_owns_campaign(p_campaign_id uuid)
returns boolean
language plpgsql
stable
as $$
declare
  has_campaigns boolean;
  ok boolean := false;
begin
  select exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'campaigns'
  ) into has_campaigns;

  if not has_campaigns then
    return false;
  end if;

  execute $q$
    select exists (
      select 1
      from public.campaigns
      where id = $1
        and (
          (to_jsonb(campaigns) ? 'client_id' and (to_jsonb(campaigns)->>'client_id')::uuid = auth.uid())
          or (to_jsonb(campaigns) ? 'customer_id' and (to_jsonb(campaigns)->>'customer_id')::uuid = auth.uid())
          or (to_jsonb(campaigns) ? 'user_id' and (to_jsonb(campaigns)->>'user_id')::uuid = auth.uid())
        )
    )
  $q$ using p_campaign_id into ok;

  return coalesce(ok, false);
exception when others then
  return false;
end;
$$;

alter table public.delivery_sessions enable row level security;
alter table public.gps_tracking_points enable row level security;
alter table public.proof_photos enable row level security;

drop policy if exists delivery_sessions_select_policy on public.delivery_sessions;
create policy delivery_sessions_select_policy
on public.delivery_sessions
for select
using (
  public.jwt_is_admin()
  or driver_id = auth.uid()
  or public.current_user_owns_campaign(campaign_id)
);

drop policy if exists delivery_sessions_insert_driver on public.delivery_sessions;
create policy delivery_sessions_insert_driver
on public.delivery_sessions
for insert
with check (driver_id = auth.uid());

drop policy if exists delivery_sessions_update_driver on public.delivery_sessions;
create policy delivery_sessions_update_driver
on public.delivery_sessions
for update
using (public.jwt_is_admin() or driver_id = auth.uid())
with check (public.jwt_is_admin() or driver_id = auth.uid());

drop policy if exists gps_tracking_points_select_policy on public.gps_tracking_points;
create policy gps_tracking_points_select_policy
on public.gps_tracking_points
for select
using (
  public.jwt_is_admin()
  or driver_id = auth.uid()
  or public.current_user_owns_campaign(campaign_id)
);

drop policy if exists gps_tracking_points_insert_driver on public.gps_tracking_points;
create policy gps_tracking_points_insert_driver
on public.gps_tracking_points
for insert
with check (
  driver_id = auth.uid()
  and exists (
    select 1 from public.delivery_sessions s
    where s.id = session_id
      and s.campaign_id = campaign_id
      and s.driver_id = auth.uid()
      and s.status in ('started', 'paused')
  )
);

drop policy if exists proof_photos_select_policy on public.proof_photos;
create policy proof_photos_select_policy
on public.proof_photos
for select
using (
  public.jwt_is_admin()
  or driver_id = auth.uid()
  or public.current_user_owns_campaign(campaign_id)
);

drop policy if exists proof_photos_insert_driver on public.proof_photos;
create policy proof_photos_insert_driver
on public.proof_photos
for insert
with check (
  driver_id = auth.uid()
  and (
    session_id is null
    or exists (
      select 1 from public.delivery_sessions s
      where s.id = session_id
        and s.campaign_id = campaign_id
        and s.driver_id = auth.uid()
    )
  )
);

insert into storage.buckets (id, name, public)
values ('proof-photos', 'proof-photos', false)
on conflict (id) do nothing;

drop policy if exists proof_photos_storage_insert_driver on storage.objects;
create policy proof_photos_storage_insert_driver
on storage.objects
for insert
with check (
  bucket_id = 'proof-photos'
  and auth.uid() is not null
);

drop policy if exists proof_photos_storage_read_related on storage.objects;
create policy proof_photos_storage_read_related
on storage.objects
for select
using (
  bucket_id = 'proof-photos'
  and (
    public.jwt_is_admin()
    or auth.uid() is not null
  )
);
