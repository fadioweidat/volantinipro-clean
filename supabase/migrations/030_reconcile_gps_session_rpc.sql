begin;

-- GPS PHASE 4 — Production RPC Migration Reconciliation.
--
-- Ricostruisce in Git le tabelle e le RPC di sessione GPS gia' esistenti in
-- produzione ma mai committate. Estratte in sola lettura il 2026-07-30 via
-- `supabase db dump --linked -s public --schema-only` (pg_get_functiondef
-- equivalente, nessuna riga di dati letta) sul progetto collegato. Nessuna
-- modifica applicata a produzione da questa migration.
--
-- Scope: le 6 RPC richieste (gps_start_session, gps_transition_session,
-- gps_insert_point, gps_heartbeat_session, gps_get_operator_campaign,
-- gps_is_admin) piu' l'unica dipendenza diretta non ancora in Git
-- (gps_assignment_is_valid, richiamata da 4 delle 6 RPC) e le tabelle senza
-- le quali quelle 7 funzioni non potrebbero ne' essere create ne' eseguite
-- correttamente. Nessuna policy RLS su delivery_sessions/gps_tracking_points/
-- proof_photos (gia' tracciate da 019_gps_tracking.sql) viene toccata: sono
-- fuori scope da questo ticket, che riguarda le RPC, non la riconciliazione
-- RLS completa di quelle tabelle (vedi rischi residui nel report).
--
-- Idempotente: CREATE TABLE/INDEX IF NOT EXISTS, ADD COLUMN IF NOT EXISTS,
-- ADD CONSTRAINT solo se assente, CREATE OR REPLACE FUNCTION, DROP POLICY IF
-- EXISTS + CREATE POLICY. Additiva: nessuna colonna/tabella/riga rimossa.
-- Non allarga permessi: GRANT identici a produzione (solo authenticated e
-- service_role, mai anon/public su alcuna delle funzioni).
--
-- gps_register_proof_photo esiste anch'essa in produzione ma non e' tra le 6
-- RPC richieste e non e' una dipendenza delle 6: intenzionalmente esclusa da
-- questa migration per rispettare lo scope del ticket.

create extension if not exists pgcrypto;

-- ============================================================
-- Tabelle prerequisite mancanti da Git
-- ============================================================
-- public.campaigns e public.profiles sono gia' referenziate come foreign key
-- da 202607230001_campaign_zone_progress.sql ma non erano mai state create
-- da nessuna migration committata: senza queste due tabelle l'intera chain
-- non e' replayable su un database vuoto, indipendentemente da questo
-- ticket. Le colonne ricalcano esattamente lo schema reale verificato.

create table if not exists public.profiles (
  id uuid primary key,
  full_name text,
  phone text,
  company_name text,
  role text not null default 'client',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_role_check check (role = any (array['admin', 'staff', 'client']))
);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  title text not null default 'Campagna senza titolo',
  service_type text not null,
  distribution_mode text,
  status text not null default 'draft',
  address_input text,
  place_id text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  radius_m integer,
  target_quantity integer,
  distribution_start_date date,
  distribution_end_date date,
  notes text,
  ai_summary text,
  estimated_price numeric(12,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  address text,
  client_name text,
  client_phone text,
  client_email text,
  campaign_name text,
  zone_name text,
  city text,
  lat double precision,
  lng double precision,
  radius_km numeric,
  quantity integer,
  total_amount numeric,
  is_test boolean default false,
  metadata jsonb default '{}'::jsonb,
  start_date date,
  end_date date,
  source text default 'manual',
  constraint campaigns_status_check check (status = any (array['draft', 'pending_review', 'approved', 'scheduled', 'in_progress', 'completed', 'cancelled', 'problem']))
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'campaigns_user_id_fkey') then
    alter table public.campaigns
      add constraint campaigns_user_id_fkey foreign key (user_id) references public.profiles(id);
  end if;
end $$;

create index if not exists idx_campaigns_user_id on public.campaigns using btree (user_id);

create table if not exists public.operational_groups (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null,
  name text not null,
  lead_name text,
  notes text,
  created_at timestamptz default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'operational_groups_campaign_id_fkey') then
    alter table public.operational_groups
      add constraint operational_groups_campaign_id_fkey foreign key (campaign_id) references public.campaigns(id);
  end if;
end $$;

create index if not exists operational_groups_campaign_id_idx on public.operational_groups using btree (campaign_id);
create unique index if not exists operational_groups_id_campaign_uidx on public.operational_groups using btree (id, campaign_id);

create table if not exists public.operator_profiles (
  user_id uuid primary key,
  display_name text not null,
  active boolean not null default true,
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operator_profiles_disabled_state_check check ((active and disabled_at is null) or (not active))
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'operator_profiles_user_id_fkey') then
    alter table public.operator_profiles
      add constraint operator_profiles_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
end $$;

create table if not exists public.operator_assignments (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null,
  campaign_id uuid not null,
  group_id uuid not null,
  status text not null default 'active',
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  revoked_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operator_assignments_period_check check (ends_at is null or ends_at > starts_at),
  constraint operator_assignments_revocation_check check (status <> 'revoked' or revoked_at is not null),
  constraint operator_assignments_status_check check (status = any (array['active', 'completed', 'revoked']))
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'operator_assignments_campaign_id_fkey') then
    alter table public.operator_assignments
      add constraint operator_assignments_campaign_id_fkey foreign key (campaign_id) references public.campaigns(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'operator_assignments_created_by_fkey') then
    alter table public.operator_assignments
      add constraint operator_assignments_created_by_fkey foreign key (created_by) references public.profiles(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'operator_assignments_group_campaign_fkey') then
    alter table public.operator_assignments
      add constraint operator_assignments_group_campaign_fkey foreign key (group_id, campaign_id) references public.operational_groups(id, campaign_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'operator_assignments_operator_id_fkey') then
    alter table public.operator_assignments
      add constraint operator_assignments_operator_id_fkey foreign key (operator_id) references public.operator_profiles(user_id);
  end if;
end $$;

create index if not exists operator_assignments_campaign_idx on public.operator_assignments using btree (campaign_id, group_id, status);
create index if not exists operator_assignments_operator_idx on public.operator_assignments using btree (operator_id, status, starts_at, ends_at);
create unique index if not exists operator_assignments_one_current_group_uidx
  on public.operator_assignments using btree (operator_id, campaign_id, group_id)
  where (status = 'active' and revoked_at is null);

create table if not exists public.gps_operator_audit_log (
  id bigint generated always as identity primary key,
  operator_id uuid,
  action text not null,
  campaign_id uuid,
  assignment_id uuid,
  session_id uuid,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists gps_operator_audit_operator_idx on public.gps_operator_audit_log using btree (operator_id, created_at desc);
create index if not exists gps_operator_audit_session_idx on public.gps_operator_audit_log using btree (session_id, created_at desc);

-- ============================================================
-- Colonne mancanti su delivery_sessions (tabella gia' creata da
-- 019_gps_tracking.sql): additive, nessuna colonna esistente toccata.
-- ============================================================

alter table public.delivery_sessions
  add column if not exists driver_name text,
  add column if not exists driver_phone text,
  add column if not exists device_id text,
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists group_id uuid,
  add column if not exists updated_at timestamptz default now(),
  add column if not exists assignment_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'delivery_sessions_assignment_id_fkey') then
    alter table public.delivery_sessions
      add constraint delivery_sessions_assignment_id_fkey foreign key (assignment_id) references public.operator_assignments(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'delivery_sessions_group_id_fkey') then
    alter table public.delivery_sessions
      add constraint delivery_sessions_group_id_fkey foreign key (group_id) references public.operational_groups(id) on delete set null;
  end if;
end $$;

create index if not exists delivery_sessions_assignment_idx on public.delivery_sessions using btree (assignment_id, status);

-- Un solo autista puo' avere una sessione started/paused alla volta per
-- assegnazione+campagna: gps_start_session intercetta la violazione di
-- questo indice e la traduce nell'errore applicativo SESSIONE_GIA_ATTIVA.
create unique index if not exists delivery_sessions_one_active_operator_campaign_uidx
  on public.delivery_sessions using btree (driver_id, campaign_id)
  where (assignment_id is not null and status = any (array['started', 'paused']));

-- ============================================================
-- Funzioni RPC — corpi identici a quelli verificati in produzione.
-- SECURITY DEFINER + search_path vuoto su tutte, come in produzione.
-- Devono precedere le policy RLS sotto: le espressioni USING/WITH CHECK
-- sono validate contro il catalogo alla creazione della policy, quindi
-- gps_is_admin() deve gia' esistere.
-- ============================================================

create or replace function public.gps_is_admin() returns boolean
  language sql stable security definer
  set search_path to ''
  as $$
  select coalesce(auth.role() = 'service_role', false)
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
    );
$$;

create or replace function public.gps_assignment_is_valid(
  p_assignment_id uuid, p_operator_id uuid, p_campaign_id uuid, p_group_id uuid,
  p_at timestamp with time zone default now()
) returns boolean
  language sql stable security definer
  set search_path to ''
  as $$
  select exists (
    select 1
    from public.operator_assignments a
    join public.operator_profiles o on o.user_id = a.operator_id
    join public.campaigns c on c.id = a.campaign_id
    join public.operational_groups g
      on g.id = a.group_id and g.campaign_id = a.campaign_id
    where a.id = p_assignment_id
      and a.operator_id = p_operator_id
      and a.campaign_id = p_campaign_id
      and a.group_id = p_group_id
      and a.status = 'active'
      and a.revoked_at is null
      and a.starts_at <= p_at
      and (a.ends_at is null or a.ends_at > p_at)
      and o.active
      and o.disabled_at is null
      and c.status = 'in_progress'
  );
$$;

create or replace function public.gps_get_operator_campaign(p_campaign_id uuid) returns jsonb
  language plpgsql stable security definer
  set search_path to ''
  as $$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'OPERATORE_NON_AUTENTICATO' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'id', c.id,
    'title', c.title,
    'campaign_name', c.campaign_name,
    'service_type', c.service_type,
    'distribution_mode', c.distribution_mode,
    'status', c.status,
    'address_input', c.address_input,
    'address', c.address,
    'zone_name', c.zone_name,
    'city', c.city,
    'distribution_start_date', c.distribution_start_date,
    'distribution_end_date', c.distribution_end_date,
    'start_date', c.start_date,
    'end_date', c.end_date
  ) into v_result
  from public.campaigns c
  join public.operator_assignments a on a.campaign_id = c.id
  where c.id = p_campaign_id
    and a.operator_id = v_uid
    and public.gps_assignment_is_valid(
      a.id, a.operator_id, a.campaign_id, a.group_id, now()
    )
  limit 1;

  if v_result is null then
    raise exception 'ASSEGNAZIONE_NON_AUTORIZZATA' using errcode = '42501';
  end if;
  return v_result;
end;
$$;

create or replace function public.gps_start_session(p_assignment_id uuid, p_device_id text default null::text)
returns public.delivery_sessions
  language plpgsql security definer
  set search_path to ''
  as $$
declare
  v_uid uuid := auth.uid();
  v_assignment public.operator_assignments%rowtype;
  v_session public.delivery_sessions%rowtype;
  v_group_name text;
begin
  if v_uid is null then
    raise exception 'OPERATORE_NON_AUTENTICATO' using errcode = '42501';
  end if;

  select a.* into v_assignment
  from public.operator_assignments a
  where a.id = p_assignment_id
    and a.operator_id = v_uid
  for update;

  if not found or not public.gps_assignment_is_valid(
    v_assignment.id,
    v_uid,
    v_assignment.campaign_id,
    v_assignment.group_id,
    now()
  ) then
    raise exception 'ASSEGNAZIONE_NON_AUTORIZZATA' using errcode = '42501';
  end if;

  select g.name into v_group_name
  from public.operational_groups g
  where g.id = v_assignment.group_id
    and g.campaign_id = v_assignment.campaign_id;

  begin
    insert into public.delivery_sessions (
      assignment_id, campaign_id, group_id, driver_id, device_id,
      status, started_at, paused_at, ended_at, metadata, updated_at
    ) values (
      v_assignment.id, v_assignment.campaign_id, v_assignment.group_id,
      v_uid, nullif(btrim(p_device_id), ''),
      'started', now(), null, null,
      jsonb_build_object(
        'source', 'gps3a_authenticated_operator',
        'group_id', v_assignment.group_id,
        'group_name', v_group_name
      ), now()
    ) returning * into v_session;
  exception when unique_violation then
    raise exception 'SESSIONE_GIA_ATTIVA' using errcode = '23505';
  end;

  insert into public.gps_operator_audit_log (
    operator_id, action, campaign_id, assignment_id, session_id,
    context
  ) values (
    v_uid, 'session_started', v_session.campaign_id,
    v_session.assignment_id, v_session.id,
    jsonb_build_object('has_device_id', v_session.device_id is not null)
  );

  return v_session;
end;
$$;

create or replace function public.gps_transition_session(p_session_id uuid, p_action text)
returns public.delivery_sessions
  language plpgsql security definer
  set search_path to ''
  as $$
declare
  v_uid uuid := auth.uid();
  v_session public.delivery_sessions%rowtype;
  v_is_admin boolean := public.gps_is_admin();
begin
  if v_uid is null then
    raise exception 'OPERATORE_NON_AUTENTICATO' using errcode = '42501';
  end if;

  select * into v_session
  from public.delivery_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'SESSIONE_NON_TROVATA' using errcode = 'P0002';
  end if;

  if not v_is_admin and (
    v_session.driver_id <> v_uid
    or v_session.assignment_id is null
    or not public.gps_assignment_is_valid(
      v_session.assignment_id, v_uid, v_session.campaign_id,
      v_session.group_id, now()
    )
  ) then
    raise exception 'SESSIONE_NON_AUTORIZZATA' using errcode = '42501';
  end if;

  if p_action = 'pause' and v_session.status = 'started' then
    update public.delivery_sessions
      set status = 'paused', paused_at = now(), updated_at = now()
      where id = p_session_id returning * into v_session;
  elsif p_action = 'resume' and v_session.status = 'paused' then
    update public.delivery_sessions
      set status = 'started', paused_at = null, updated_at = now()
      where id = p_session_id returning * into v_session;
  elsif p_action = 'complete' and v_session.status in ('started', 'paused') then
    update public.delivery_sessions
      set status = 'completed', ended_at = now(), updated_at = now()
      where id = p_session_id returning * into v_session;
  else
    raise exception 'TRANSIZIONE_SESSIONE_NON_VALIDA' using errcode = '22023';
  end if;

  insert into public.gps_operator_audit_log (
    operator_id, action, campaign_id, assignment_id, session_id
  ) values (
    v_uid, 'session_' || p_action, v_session.campaign_id,
    v_session.assignment_id, v_session.id
  );

  return v_session;
end;
$$;

create or replace function public.gps_insert_point(
  p_session_id uuid, p_lat double precision, p_lng double precision,
  p_accuracy double precision default null::double precision,
  p_speed double precision default null::double precision,
  p_heading double precision default null::double precision,
  p_recorded_at timestamp with time zone default now()
) returns public.gps_tracking_points
  language plpgsql security definer
  set search_path to ''
  as $$
declare
  v_uid uuid := auth.uid();
  v_session public.delivery_sessions%rowtype;
  v_point public.gps_tracking_points%rowtype;
begin
  if v_uid is null then
    raise exception 'OPERATORE_NON_AUTENTICATO' using errcode = '42501';
  end if;
  if p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then
    raise exception 'COORDINATE_NON_VALIDE' using errcode = '22023';
  end if;

  select * into v_session
  from public.delivery_sessions s
  where s.id = p_session_id
    and s.driver_id = v_uid
    and s.status in ('started', 'paused')
    and s.assignment_id is not null
    and public.gps_assignment_is_valid(
      s.assignment_id, v_uid, s.campaign_id, s.group_id, now()
    );

  if not found then
    raise exception 'SESSIONE_NON_AUTORIZZATA' using errcode = '42501';
  end if;

  insert into public.gps_tracking_points (
    campaign_id, session_id, driver_id, lat, lng,
    accuracy, speed, heading, recorded_at
  ) values (
    v_session.campaign_id, v_session.id, v_uid, p_lat, p_lng,
    p_accuracy, p_speed, p_heading, coalesce(p_recorded_at, now())
  ) returning * into v_point;

  return v_point;
end;
$$;

create or replace function public.gps_heartbeat_session(p_session_id uuid) returns public.delivery_sessions
  language plpgsql security definer
  set search_path to ''
  as $$
declare
  v_uid uuid := auth.uid();
  v_session public.delivery_sessions%rowtype;
begin
  if v_uid is null then
    raise exception 'OPERATORE_NON_AUTENTICATO' using errcode = '42501';
  end if;

  select * into v_session
  from public.delivery_sessions s
  where s.id = p_session_id
    and s.driver_id = v_uid
    and s.status in ('started', 'paused')
    and s.assignment_id is not null
    and public.gps_assignment_is_valid(
      s.assignment_id, v_uid, s.campaign_id, s.group_id, now()
    )
  for update;

  if not found then
    raise exception 'SESSIONE_NON_AUTORIZZATA' using errcode = '42501';
  end if;

  update public.delivery_sessions
    set updated_at = now()
    where id = p_session_id returning * into v_session;
  return v_session;
end;
$$;

-- ============================================================
-- RLS sulle tabelle nuove — solo policy verificate identiche in
-- produzione, nessuna inventata. FORCE RLS replicato dove verificato.
-- ============================================================

alter table public.profiles enable row level security;

drop policy if exists profiles_own_select on public.profiles;
create policy profiles_own_select on public.profiles for select using (auth.uid() = id);

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select to authenticated using (auth.uid() = id);

drop policy if exists profiles_own_update on public.profiles;
create policy profiles_own_update on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

alter table public.campaigns enable row level security;

drop policy if exists campaigns_own_select on public.campaigns;
create policy campaigns_own_select on public.campaigns for select to authenticated using (auth.uid() = user_id);

drop policy if exists campaigns_own_insert on public.campaigns;
create policy campaigns_own_insert on public.campaigns for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists campaigns_own_update on public.campaigns;
create policy campaigns_own_update on public.campaigns for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists campaigns_admin_all on public.campaigns;
create policy campaigns_admin_all on public.campaigns to authenticated
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = any (array['admin', 'super_admin'])))
  with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = any (array['admin', 'super_admin'])));

alter table public.operational_groups enable row level security;
alter table public.operational_groups force row level security;

drop policy if exists operational_groups_admin_all on public.operational_groups;
create policy operational_groups_admin_all on public.operational_groups to authenticated
  using (public.gps_is_admin()) with check (public.gps_is_admin());

drop policy if exists operational_groups_select_authorized on public.operational_groups;
create policy operational_groups_select_authorized on public.operational_groups for select to authenticated
  using (
    public.gps_is_admin()
    or exists (select 1 from public.campaigns c where c.id = operational_groups.campaign_id and c.user_id = auth.uid())
    or exists (select 1 from public.operator_assignments a where a.group_id = operational_groups.id and a.operator_id = auth.uid())
  );

alter table public.operator_assignments enable row level security;
alter table public.operator_assignments force row level security;

drop policy if exists operator_assignments_admin_all on public.operator_assignments;
create policy operator_assignments_admin_all on public.operator_assignments to authenticated
  using (public.gps_is_admin()) with check (public.gps_is_admin());

drop policy if exists operator_assignments_own_select on public.operator_assignments;
create policy operator_assignments_own_select on public.operator_assignments for select to authenticated
  using (operator_id = auth.uid());

alter table public.operator_profiles enable row level security;
alter table public.operator_profiles force row level security;

drop policy if exists operator_profiles_admin_all on public.operator_profiles;
create policy operator_profiles_admin_all on public.operator_profiles to authenticated
  using (public.gps_is_admin()) with check (public.gps_is_admin());

drop policy if exists operator_profiles_own_select on public.operator_profiles;
create policy operator_profiles_own_select on public.operator_profiles for select to authenticated
  using (user_id = auth.uid());

alter table public.gps_operator_audit_log enable row level security;
alter table public.gps_operator_audit_log force row level security;

drop policy if exists gps_operator_audit_admin_select on public.gps_operator_audit_log;
create policy gps_operator_audit_admin_select on public.gps_operator_audit_log for select to authenticated
  using (public.gps_is_admin());

-- ============================================================
-- GRANT/REVOKE — identici a produzione: solo authenticated e service_role,
-- mai anon/public.
-- ============================================================

revoke all on function public.gps_is_admin() from public;
grant execute on function public.gps_is_admin() to authenticated, service_role;

revoke all on function public.gps_assignment_is_valid(uuid, uuid, uuid, uuid, timestamp with time zone) from public;
grant execute on function public.gps_assignment_is_valid(uuid, uuid, uuid, uuid, timestamp with time zone) to authenticated, service_role;

revoke all on function public.gps_get_operator_campaign(uuid) from public;
grant execute on function public.gps_get_operator_campaign(uuid) to authenticated, service_role;

revoke all on function public.gps_start_session(uuid, text) from public;
grant execute on function public.gps_start_session(uuid, text) to authenticated, service_role;

revoke all on function public.gps_transition_session(uuid, text) from public;
grant execute on function public.gps_transition_session(uuid, text) to authenticated, service_role;

revoke all on function public.gps_insert_point(uuid, double precision, double precision, double precision, double precision, double precision, timestamp with time zone) from public;
grant execute on function public.gps_insert_point(uuid, double precision, double precision, double precision, double precision, double precision, timestamp with time zone) to authenticated, service_role;

revoke all on function public.gps_heartbeat_session(uuid) from public;
grant execute on function public.gps_heartbeat_session(uuid) to authenticated, service_role;

commit;
