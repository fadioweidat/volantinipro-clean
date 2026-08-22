begin;

-- GPS-PROD-6M: forward-only concurrency and audit-retention corrections.
-- Requires 202607230001_campaign_zone_progress.sql.

alter table public.campaign_zone_progress_history
  alter column campaign_zone_id drop not null,
  alter column campaign_id drop not null,
  add column if not exists campaign_id_snapshot uuid,
  add column if not exists campaign_zone_id_snapshot uuid,
  add column if not exists zone_name_snapshot text;

update public.campaign_zone_progress_history h
set campaign_id_snapshot = coalesce(h.campaign_id_snapshot, h.campaign_id),
    campaign_zone_id_snapshot = coalesce(
      h.campaign_zone_id_snapshot,
      h.campaign_zone_id
    ),
    zone_name_snapshot = coalesce(
      h.zone_name_snapshot,
      (
        select z.zone_name
        from public.campaign_zones z
        where z.id = h.campaign_zone_id
      )
    )
where h.campaign_id_snapshot is null
   or h.campaign_zone_id_snapshot is null;

alter table public.campaign_zone_progress_history
  alter column campaign_id_snapshot set not null,
  alter column campaign_zone_id_snapshot set not null;

alter table public.campaign_zone_progress_history
  drop constraint if exists campaign_zone_progress_history_campaign_id_fkey,
  drop constraint if exists campaign_zone_progress_history_campaign_zone_id_fkey;

alter table public.campaign_zone_progress_history
  add constraint campaign_zone_progress_history_campaign_id_fkey
    foreign key (campaign_id)
    references public.campaigns(id)
    on delete set null,
  add constraint campaign_zone_progress_history_campaign_zone_id_fkey
    foreign key (campaign_zone_id)
    references public.campaign_zones(id)
    on delete set null;

create or replace function public.protect_campaign_zone_progress_history_snapshots()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if new.campaign_id_snapshot is distinct from old.campaign_id_snapshot
     or new.campaign_zone_id_snapshot is distinct from old.campaign_zone_id_snapshot
     or new.zone_name_snapshot is distinct from old.zone_name_snapshot then
    raise exception 'SNAPSHOT_STORICO_IMMUTABILE' using errcode = '23000';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_campaign_zone_progress_history_snapshots
  on public.campaign_zone_progress_history;

create trigger protect_campaign_zone_progress_history_snapshots
before update of
  campaign_id_snapshot,
  campaign_zone_id_snapshot,
  zone_name_snapshot
on public.campaign_zone_progress_history
for each row
execute function public.protect_campaign_zone_progress_history_snapshots();

revoke all on function public.protect_campaign_zone_progress_history_snapshots()
  from public, anon, authenticated;

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
  v_zone_name text;
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

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_campaign_zone_id::text, 0)
  );

  select z.campaign_id, z.zone_name
    into v_campaign_id, v_zone_name
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
    campaign_zone_id_snapshot,
    campaign_id_snapshot,
    zone_name_snapshot,
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
    v_new.campaign_zone_id,
    v_new.campaign_id,
    v_zone_name,
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
  v_zone_name text;
  v_old public.campaign_zone_progress%rowtype;
  v_new public.campaign_zone_progress%rowtype;
begin
  if not public.gps_is_admin() then
    raise exception 'ADMIN_NON_AUTORIZZATO' using errcode = '42501';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'MOTIVO_OBBLIGATORIO' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_campaign_zone_id::text, 0)
  );

  select z.campaign_id, z.zone_name
    into v_campaign_id, v_zone_name
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
    campaign_zone_id_snapshot,
    campaign_id_snapshot,
    zone_name_snapshot,
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
    v_new.campaign_zone_id,
    v_new.campaign_id,
    v_zone_name,
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

revoke all on function public.admin_set_zone_manual_progress(uuid, numeric, text)
  from public, anon;
revoke all on function public.admin_clear_zone_manual_progress(uuid, text)
  from public, anon;

grant execute on function public.admin_set_zone_manual_progress(uuid, numeric, text)
  to authenticated, service_role;
grant execute on function public.admin_clear_zone_manual_progress(uuid, text)
  to authenticated, service_role;

commit;
