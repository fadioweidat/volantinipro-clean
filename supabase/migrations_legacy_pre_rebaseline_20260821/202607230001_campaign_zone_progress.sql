begin;

-- GPS-PROD-6C — Campaign zone progress design.
-- This migration is intentionally scoped to the production-live model audited in
-- GPS-PROD-6B:
--   auth.users.id -> public.profiles.id -> public.campaigns.user_id
--   public.campaign_zones.id -> public.campaign_zones.campaign_id
--
-- It does not modify gps_is_admin(); that function currently recognizes
-- the production Admin model and must be evaluated as the authoritative admin gate.

create extension if not exists pgcrypto;

create table if not exists public.campaign_zone_progress (
  id uuid primary key default gen_random_uuid(),
  campaign_zone_id uuid not null,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  automatic_percent numeric(5,2) not null default 0,
  manual_percent numeric(5,2),
  manual_override_enabled boolean not null default false,
  effective_percent numeric(5,2)
    generated always as (
      case
        when manual_override_enabled and manual_percent is not null
          then manual_percent
        else automatic_percent
      end
    ) stored,
  override_reason text,
  calculation_version text not null default 'zone-progress-v1',
  source_summary jsonb not null default '{}'::jsonb,
  automatic_updated_at timestamptz,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint campaign_zone_progress_zone_fkey
    foreign key (campaign_zone_id)
    references public.campaign_zones(id)
    on delete cascade,
  constraint campaign_zone_progress_campaign_zone_uidx
    unique (campaign_zone_id),
  constraint campaign_zone_progress_automatic_percent_range
    check (automatic_percent >= 0 and automatic_percent <= 100),
  constraint campaign_zone_progress_manual_percent_range
    check (manual_percent is null or (manual_percent >= 0 and manual_percent <= 100)),
  constraint campaign_zone_progress_override_consistency
    check (
      (
        manual_override_enabled = true
        and manual_percent is not null
        and nullif(btrim(override_reason), '') is not null
      )
      or
      (
        manual_override_enabled = false
        and manual_percent is null
      )
    )
);

create table if not exists public.campaign_zone_progress_history (
  id uuid primary key default gen_random_uuid(),
  progress_id uuid references public.campaign_zone_progress(id) on delete set null,
  campaign_zone_id uuid not null references public.campaign_zones(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  event_type text not null,
  old_automatic_percent numeric(5,2),
  new_automatic_percent numeric(5,2),
  old_manual_percent numeric(5,2),
  new_manual_percent numeric(5,2),
  old_effective_percent numeric(5,2),
  new_effective_percent numeric(5,2),
  old_manual_override_enabled boolean,
  new_manual_override_enabled boolean,
  reason text not null,
  source_summary jsonb,
  calculation_version text,
  changed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),

  constraint campaign_zone_progress_history_event_type_check
    check (event_type in ('automatic_recalc', 'manual_override', 'manual_clear')),
  constraint campaign_zone_progress_history_reason_required
    check (nullif(btrim(reason), '') is not null)
);

create index if not exists campaign_zone_progress_campaign_id_idx
  on public.campaign_zone_progress (campaign_id);

create index if not exists campaign_zone_progress_updated_at_idx
  on public.campaign_zone_progress (updated_at desc);

create index if not exists campaign_zone_progress_history_zone_idx
  on public.campaign_zone_progress_history (campaign_zone_id, created_at desc);

create index if not exists campaign_zone_progress_history_campaign_idx
  on public.campaign_zone_progress_history (campaign_id, created_at desc);

create or replace function public.set_campaign_zone_progress_campaign_id()
returns trigger
language plpgsql
set search_path to ''
as $$
declare
  v_campaign_id uuid;
begin
  select z.campaign_id
    into v_campaign_id
  from public.campaign_zones z
  where z.id = new.campaign_zone_id;

  if v_campaign_id is null then
    raise exception 'ZONA_CAMPAGNA_NON_TROVATA' using errcode = 'P0002';
  end if;

  if new.campaign_id is not null and new.campaign_id <> v_campaign_id then
    raise exception 'ZONA_CAMPAGNA_INCOERENTE' using errcode = '23514';
  end if;

  new.campaign_id := v_campaign_id;
  return new;
end;
$$;

drop trigger if exists set_campaign_zone_progress_campaign_id
  on public.campaign_zone_progress;

create trigger set_campaign_zone_progress_campaign_id
before insert or update of campaign_zone_id, campaign_id
on public.campaign_zone_progress
for each row
execute function public.set_campaign_zone_progress_campaign_id();

drop trigger if exists set_campaign_zone_progress_updated_at
  on public.campaign_zone_progress;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger set_campaign_zone_progress_updated_at
before update on public.campaign_zone_progress
for each row
execute function public.set_updated_at();

alter table public.campaign_zone_progress enable row level security;
alter table public.campaign_zone_progress force row level security;

alter table public.campaign_zone_progress_history enable row level security;
alter table public.campaign_zone_progress_history force row level security;

drop policy if exists campaign_zone_progress_select_customer
  on public.campaign_zone_progress;

create policy campaign_zone_progress_select_customer
on public.campaign_zone_progress
for select
to authenticated
using (
  exists (
    select 1
    from public.campaigns c
    where c.id = campaign_zone_progress.campaign_id
      and c.user_id = auth.uid()
  )
);

drop policy if exists campaign_zone_progress_select_admin
  on public.campaign_zone_progress;

create policy campaign_zone_progress_select_admin
on public.campaign_zone_progress
for select
to authenticated
using (public.gps_is_admin());

drop policy if exists campaign_zone_progress_history_select_admin
  on public.campaign_zone_progress_history;

create policy campaign_zone_progress_history_select_admin
on public.campaign_zone_progress_history
for select
to authenticated
using (public.gps_is_admin());

revoke all on table public.campaign_zone_progress from anon;
revoke all on table public.campaign_zone_progress_history from anon;
revoke all on table public.campaign_zone_progress from authenticated;
revoke all on table public.campaign_zone_progress_history from authenticated;

grant select on table public.campaign_zone_progress to authenticated;
grant select on table public.campaign_zone_progress_history to authenticated;

create or replace function public.get_campaign_zone_progress(
  p_campaign_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean := public.gps_is_admin();
  v_is_owner boolean := false;
  v_result jsonb;
begin
  if v_uid is null and not v_is_admin then
    raise exception 'UTENTE_NON_AUTENTICATO' using errcode = '42501';
  end if;

  select exists (
    select 1
    from public.campaigns c
    where c.id = p_campaign_id
      and c.user_id = v_uid
  ) into v_is_owner;

  if not v_is_admin and not v_is_owner then
    raise exception 'CAMPAGNA_NON_AUTORIZZATA' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(
    case
      when v_is_admin then
        jsonb_build_object(
          'campaign_zone_id', z.id,
          'campaign_id', z.campaign_id,
          'zone_name', z.zone_name,
          'address_label', z.address_label,
          'effective_percent', coalesce(p.effective_percent, 0),
          'updated_at', p.updated_at,
          'automatic_percent', coalesce(p.automatic_percent, 0),
          'manual_percent', p.manual_percent,
          'manual_override_enabled', coalesce(p.manual_override_enabled, false),
          'override_reason', p.override_reason,
          'calculation_version', p.calculation_version,
          'source_summary', coalesce(p.source_summary, '{}'::jsonb),
          'automatic_updated_at', p.automatic_updated_at,
          'updated_by', p.updated_by
        )
      else
        jsonb_build_object(
          'campaign_zone_id', z.id,
          'campaign_id', z.campaign_id,
          'zone_name', z.zone_name,
          'address_label', z.address_label,
          'effective_percent', coalesce(p.effective_percent, 0),
          'updated_at', p.updated_at
        )
    end
    order by z.created_at, z.id
  ), '[]'::jsonb)
  into v_result
  from public.campaign_zones z
  left join public.campaign_zone_progress p
    on p.campaign_zone_id = z.id
   and p.campaign_id = z.campaign_id
  where z.campaign_id = p_campaign_id;

  return v_result;
end;
$$;

create or replace function public.admin_set_zone_manual_progress(
  p_campaign_zone_id uuid,
  p_manual_percent numeric,
  p_reason text
)
returns public.campaign_zone_progress
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
  v_campaign_id uuid;
  v_old public.campaign_zone_progress%rowtype;
  v_new public.campaign_zone_progress%rowtype;
begin
  if not public.gps_is_admin() then
    raise exception 'ADMIN_NON_AUTORIZZATO' using errcode = '42501';
  end if;
  if p_manual_percent is null or p_manual_percent < 0 or p_manual_percent > 100 then
    raise exception 'PERCENTUALE_NON_VALIDA' using errcode = '22023';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'MOTIVO_OBBLIGATORIO' using errcode = '22023';
  end if;

  select z.campaign_id
    into v_campaign_id
  from public.campaign_zones z
  where z.id = p_campaign_zone_id;

  if v_campaign_id is null then
    raise exception 'ZONA_CAMPAGNA_NON_TROVATA' using errcode = 'P0002';
  end if;

  select *
    into v_old
  from public.campaign_zone_progress
  where campaign_zone_id = p_campaign_zone_id
  for update;

  insert into public.campaign_zone_progress (
    campaign_zone_id,
    campaign_id,
    manual_percent,
    manual_override_enabled,
    override_reason,
    updated_by,
    updated_at
  ) values (
    p_campaign_zone_id,
    v_campaign_id,
    p_manual_percent,
    true,
    btrim(p_reason),
    v_uid,
    now()
  )
  on conflict (campaign_zone_id) do update
    set manual_percent = excluded.manual_percent,
        manual_override_enabled = true,
        override_reason = excluded.override_reason,
        updated_by = excluded.updated_by,
        updated_at = now()
  returning * into v_new;

  insert into public.campaign_zone_progress_history (
    progress_id,
    campaign_zone_id,
    campaign_id,
    event_type,
    old_automatic_percent,
    new_automatic_percent,
    old_manual_percent,
    new_manual_percent,
    old_effective_percent,
    new_effective_percent,
    old_manual_override_enabled,
    new_manual_override_enabled,
    reason,
    source_summary,
    calculation_version,
    changed_by
  ) values (
    v_new.id,
    v_new.campaign_zone_id,
    v_new.campaign_id,
    'manual_override',
    v_old.automatic_percent,
    v_new.automatic_percent,
    v_old.manual_percent,
    v_new.manual_percent,
    v_old.effective_percent,
    v_new.effective_percent,
    v_old.manual_override_enabled,
    v_new.manual_override_enabled,
    btrim(p_reason),
    v_new.source_summary,
    v_new.calculation_version,
    v_uid
  );

  return v_new;
end;
$$;

create or replace function public.admin_clear_zone_manual_progress(
  p_campaign_zone_id uuid,
  p_reason text
)
returns public.campaign_zone_progress
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
  v_campaign_id uuid;
  v_old public.campaign_zone_progress%rowtype;
  v_new public.campaign_zone_progress%rowtype;
begin
  if not public.gps_is_admin() then
    raise exception 'ADMIN_NON_AUTORIZZATO' using errcode = '42501';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'MOTIVO_OBBLIGATORIO' using errcode = '22023';
  end if;

  select z.campaign_id
    into v_campaign_id
  from public.campaign_zones z
  where z.id = p_campaign_zone_id;

  if v_campaign_id is null then
    raise exception 'ZONA_CAMPAGNA_NON_TROVATA' using errcode = 'P0002';
  end if;

  select *
    into v_old
  from public.campaign_zone_progress
  where campaign_zone_id = p_campaign_zone_id
  for update;

  insert into public.campaign_zone_progress (
    campaign_zone_id,
    campaign_id,
    manual_percent,
    manual_override_enabled,
    override_reason,
    updated_by,
    updated_at
  ) values (
    p_campaign_zone_id,
    v_campaign_id,
    null,
    false,
    null,
    v_uid,
    now()
  )
  on conflict (campaign_zone_id) do update
    set manual_percent = null,
        manual_override_enabled = false,
        override_reason = null,
        updated_by = excluded.updated_by,
        updated_at = now()
  returning * into v_new;

  insert into public.campaign_zone_progress_history (
    progress_id,
    campaign_zone_id,
    campaign_id,
    event_type,
    old_automatic_percent,
    new_automatic_percent,
    old_manual_percent,
    new_manual_percent,
    old_effective_percent,
    new_effective_percent,
    old_manual_override_enabled,
    new_manual_override_enabled,
    reason,
    source_summary,
    calculation_version,
    changed_by
  ) values (
    v_new.id,
    v_new.campaign_zone_id,
    v_new.campaign_id,
    'manual_clear',
    v_old.automatic_percent,
    v_new.automatic_percent,
    v_old.manual_percent,
    v_new.manual_percent,
    v_old.effective_percent,
    v_new.effective_percent,
    v_old.manual_override_enabled,
    v_new.manual_override_enabled,
    btrim(p_reason),
    v_new.source_summary,
    v_new.calculation_version,
    v_uid
  );

  return v_new;
end;
$$;

revoke all on function public.get_campaign_zone_progress(uuid) from public;
revoke all on function public.admin_set_zone_manual_progress(uuid, numeric, text) from public;
revoke all on function public.admin_clear_zone_manual_progress(uuid, text) from public;

revoke all on function public.get_campaign_zone_progress(uuid) from anon;
revoke all on function public.admin_set_zone_manual_progress(uuid, numeric, text) from anon;
revoke all on function public.admin_clear_zone_manual_progress(uuid, text) from anon;

grant execute on function public.get_campaign_zone_progress(uuid)
  to authenticated, service_role;

grant execute on function public.admin_set_zone_manual_progress(uuid, numeric, text)
  to authenticated, service_role;

grant execute on function public.admin_clear_zone_manual_progress(uuid, text)
  to authenticated, service_role;

commit;
