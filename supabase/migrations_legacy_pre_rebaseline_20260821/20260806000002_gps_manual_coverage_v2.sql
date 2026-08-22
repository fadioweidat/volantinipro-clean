begin;

-- Add adjustment_type and inaccessible_percent (idempotent: IF NOT EXISTS su
-- ogni colonna, cosi' una seconda esecuzione non fallisce su "column already
-- exists"; i CHECK restano quelli originali, applicati solo alla creazione).
alter table public.campaign_zone_progress
add column if not exists adjustment_type text,
add column if not exists inaccessible_percent numeric(5,2),
add column if not exists notes text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'campaign_zone_progress_adjustment_type_check') then
    alter table public.campaign_zone_progress
      add constraint campaign_zone_progress_adjustment_type_check
      check (adjustment_type in ('manual_covered', 'partially_covered', 'inaccessible'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'campaign_zone_progress_inaccessible_percent_check') then
    alter table public.campaign_zone_progress
      add constraint campaign_zone_progress_inaccessible_percent_check
      check (inaccessible_percent is null or (inaccessible_percent >= 0 and inaccessible_percent <= 100));
  end if;
end $$;

alter table public.campaign_zone_progress_history
add column if not exists adjustment_type text,
add column if not exists inaccessible_percent numeric(5,2),
add column if not exists notes text,
add column if not exists old_adjustment_type text,
add column if not exists old_inaccessible_percent numeric(5,2),
add column if not exists old_notes text;

-- Reconciliation: existing manual_percent becomes additional. Guardia
-- "adjustment_type is null" aggiunta per idempotenza: senza di essa, una
-- seconda esecuzione sottrarrebbe automatic_percent una seconda volta dalle
-- righe gia' riconciliate (perdita/corruzione dati). Dopo la prima corsa ogni
-- riga toccata ha adjustment_type = 'partially_covered', quindi resta esclusa
-- da qualunque riesecuzione futura.
update public.campaign_zone_progress
set manual_percent = greatest(0, manual_percent - automatic_percent),
    adjustment_type = 'partially_covered'
where manual_override_enabled = true and manual_percent is not null and adjustment_type is null;

-- Recreate generated column for effective_percent — solo se non e' gia'
-- stata presa in carico da 20260806000003 (che la converte in colonna
-- normale, popolata dal proprio trigger canonico per le righe 'geometric').
-- Senza questa guardia, una riesecuzione di QUESTO file dopo che 003 e' gia'
-- passato ricreerebbe la colonna come GENERATED con la vecchia formula
-- automatic+manual, cancellando i valori canonici delle zone geometriche
-- (perdita dati). Se la colonna non e' (o non e' piu') generata, significa
-- che 003 ha gia' consolidato: si salta, 003 restera' l'unico proprietario.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'campaign_zone_progress' and column_name = 'effective_percent'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'campaign_zone_progress'
      and column_name = 'effective_percent' and is_generated = 'ALWAYS'
  ) then
    raise notice 'effective_percent already consolidated by 20260806000003 as a plain column, skipping recreate';
  else
    alter table public.campaign_zone_progress drop column if exists effective_percent;
    alter table public.campaign_zone_progress
      add column effective_percent numeric(5,2)
      generated always as (
        case
          when manual_override_enabled then
            least(100, automatic_percent + coalesce(manual_percent, 0))
          else
            automatic_percent
        end
      ) stored;
  end if;
end $$;

-- Drop and replace RPCs
drop function if exists public.get_campaign_zone_progress(uuid);
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
          'geometry', z.geometry,
          'effective_percent', coalesce(p.effective_percent, 0),
          'updated_at', p.updated_at,
          'automatic_percent', coalesce(p.automatic_percent, 0),
          'manual_percent', p.manual_percent,
          'inaccessible_percent', p.inaccessible_percent,
          'adjustment_type', p.adjustment_type,
          'manual_override_enabled', coalesce(p.manual_override_enabled, false),
          'override_reason', p.override_reason,
          'notes', p.notes,
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
          'geometry', z.geometry,
          'effective_percent', coalesce(p.effective_percent, 0),
          'automatic_percent', coalesce(p.automatic_percent, 0),
          'manual_percent', p.manual_percent,
          'inaccessible_percent', p.inaccessible_percent,
          'adjustment_type', p.adjustment_type,
          'manual_override_enabled', coalesce(p.manual_override_enabled, false),
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

drop function if exists public.admin_set_zone_manual_progress(uuid, numeric, text);
drop function if exists public.admin_set_zone_manual_progress(uuid, text, numeric, numeric, text, text);
create or replace function public.admin_set_zone_manual_progress(
  p_campaign_zone_id uuid,
  p_adjustment_type text,
  p_manual_percent numeric,
  p_inaccessible_percent numeric,
  p_reason text,
  p_notes text
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
  if p_adjustment_type not in ('manual_covered', 'partially_covered', 'inaccessible') then
    raise exception 'TIPO_CORREZIONE_NON_VALIDA' using errcode = '22023';
  end if;
  if p_manual_percent is not null and (p_manual_percent < 0 or p_manual_percent > 100) then
    raise exception 'PERCENTUALE_NON_VALIDA' using errcode = '22023';
  end if;
  if p_inaccessible_percent is not null and (p_inaccessible_percent < 0 or p_inaccessible_percent > 100) then
    raise exception 'PERCENTUALE_NON_VALIDA' using errcode = '22023';
  end if;
  if p_adjustment_type = 'inaccessible' and nullif(btrim(p_reason), '') is null then
    raise exception 'MOTIVO_OBBLIGATORIO' using errcode = '22023';
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
    adjustment_type,
    manual_percent,
    inaccessible_percent,
    manual_override_enabled,
    override_reason,
    notes,
    updated_by,
    updated_at
  ) values (
    p_campaign_zone_id,
    v_campaign_id,
    p_adjustment_type,
    p_manual_percent,
    p_inaccessible_percent,
    true,
    btrim(p_reason),
    btrim(p_notes),
    v_uid,
    now()
  )
  on conflict (campaign_zone_id) do update
    set adjustment_type = excluded.adjustment_type,
        manual_percent = excluded.manual_percent,
        inaccessible_percent = excluded.inaccessible_percent,
        manual_override_enabled = true,
        override_reason = excluded.override_reason,
        notes = excluded.notes,
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
    old_adjustment_type,
    adjustment_type,
    old_inaccessible_percent,
    inaccessible_percent,
    old_notes,
    notes,
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
    v_old.adjustment_type,
    v_new.adjustment_type,
    v_old.inaccessible_percent,
    v_new.inaccessible_percent,
    v_old.notes,
    v_new.notes,
    btrim(p_reason),
    v_new.source_summary,
    v_new.calculation_version,
    v_uid
  );

  return v_new;
end;
$$;

drop function if exists public.admin_clear_zone_manual_progress(uuid, text);
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
    adjustment_type,
    manual_percent,
    inaccessible_percent,
    manual_override_enabled,
    override_reason,
    notes,
    updated_by,
    updated_at
  ) values (
    p_campaign_zone_id,
    v_campaign_id,
    null,
    null,
    null,
    false,
    null,
    null,
    v_uid,
    now()
  )
  on conflict (campaign_zone_id) do update
    set adjustment_type = null,
        manual_percent = null,
        inaccessible_percent = null,
        manual_override_enabled = false,
        override_reason = null,
        notes = null,
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
    old_adjustment_type,
    adjustment_type,
    old_inaccessible_percent,
    inaccessible_percent,
    old_notes,
    notes,
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
    v_old.adjustment_type,
    v_new.adjustment_type,
    v_old.inaccessible_percent,
    v_new.inaccessible_percent,
    v_old.notes,
    v_new.notes,
    btrim(p_reason),
    v_new.source_summary,
    v_new.calculation_version,
    v_uid
  );

  return v_new;
end;
$$;

revoke all on function public.get_campaign_zone_progress(uuid) from public;
revoke all on function public.admin_set_zone_manual_progress(uuid, text, numeric, numeric, text, text) from public;
revoke all on function public.admin_clear_zone_manual_progress(uuid, text) from public;

revoke all on function public.get_campaign_zone_progress(uuid) from anon;
revoke all on function public.admin_set_zone_manual_progress(uuid, text, numeric, numeric, text, text) from anon;
revoke all on function public.admin_clear_zone_manual_progress(uuid, text) from anon;

grant execute on function public.get_campaign_zone_progress(uuid) to authenticated, service_role;
grant execute on function public.admin_set_zone_manual_progress(uuid, text, numeric, numeric, text, text) to authenticated, service_role;
grant execute on function public.admin_clear_zone_manual_progress(uuid, text) to authenticated, service_role;

commit;
