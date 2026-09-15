-- RECONSTRUCTED FILE — see "INVESTIGATE 5 REMOTE-ONLY SUPABASE MIGRATIONS"
-- reconciliation ticket (2026-09-15). Applied directly to production 337
-- seconds after 20260831153718 above, name
-- "fix_coverage_batch_parallel_array_unnest" per
-- supabase_migrations.schema_migrations. No file for it ever existed here.
--
-- Not speculative: comparing the already-committed 20260831153621 migration's
-- admin_create_coverage_adjustments_batch() body against the CURRENT live
-- definition (read-only introspection, pg_get_functiondef) shows exactly one
-- semantic change — the INSERT's
-- `from pg_catalog.unnest(v_valid_geoms, v_valid_zones) as t(g, z)` (zipping
-- two parallel arrays via multi-argument unnest, which the migration's own
-- name flags as the bug) was replaced with an explicit
-- `generate_subscripts(v_valid_geoms, 1) as s(i)` index join, indexing both
-- arrays by position (v_valid_geoms[i]/v_valid_zones[i]).
--
-- The body below is copied VERBATIM from the live pg_get_functiondef output
-- (confirmed byte-for-byte after only CRLF/trim normalization) rather than
-- re-derived from the original migration's style: whoever applied this fix
-- live also dropped the original's comments/blank lines/explicit
-- `pg_catalog.` qualification on built-ins (harmless — pg_catalog is always
-- implicitly searched first regardless of `search_path`) — reproducing that
-- exact wording here, rather than my own reformatting, is what makes this
-- reconstruction verifiably exact instead of "close enough".
begin;

create or replace function public.admin_create_coverage_adjustments_batch(p_campaign_id uuid, p_lines jsonb, p_reason text, p_source text default 'automatic_verified'::text, p_line_buffer_m numeric default 12, p_notes text default null::text, p_metadata jsonb default '{}'::jsonb, p_adjustment_type text default 'manual_covered'::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
 set statement_timeout to '300s'
as $function$
declare
  v_uid uuid := auth.uid();
  v_reason text := btrim(coalesce(p_reason, ''));
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_meta jsonb := coalesce(p_metadata, '{}'::jsonb);
  v_buffer numeric := coalesce(p_line_buffer_m, 12);
  v_campaign_zone_ids uuid[];
  v_elem jsonb;
  v_geo jsonb;
  v_zone_txt text;
  v_zone uuid;
  v_geom public.geometry;
  v_gtype text;
  v_valid_geoms public.geometry[] := array[]::public.geometry[];
  v_valid_zones uuid[] := array[]::uuid[];
  v_discarded_idx int[] := array[]::int[];
  v_idx int := 0;
  v_received int := 0;
  v_discarded int := 0;
  v_inserted int := 0;
  v_z uuid;
begin
  if not public.gps_is_admin() then
    raise exception 'ADMIN_NON_AUTORIZZATO' using errcode = '42501';
  end if;
  if p_source not in ('manual_verified', 'automatic_verified') then
    raise exception 'SOURCE_NON_VALIDA' using errcode = '22023';
  end if;
  if p_adjustment_type not in ('manual_covered', 'partially_covered') then
    raise exception 'TIPO_CORREZIONE_NON_VALIDO' using errcode = '22023';
  end if;
  if v_reason = '' then
    raise exception 'MOTIVO_OBBLIGATORIO' using errcode = '22023';
  end if;
  if v_buffer <= 0 or v_buffer > 60 then
    raise exception 'LINE_BUFFER_NON_VALIDO' using errcode = '22023';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'LINES_PAYLOAD_NON_VALIDO' using errcode = '22023';
  end if;
  if not exists (select 1 from public.campaigns where id = p_campaign_id) then
    raise exception 'CAMPAGNA_NON_TROVATA' using errcode = 'P0002';
  end if;

  v_campaign_zone_ids := array(select id from public.campaign_zones where campaign_id = p_campaign_id);

  for v_elem in select * from jsonb_array_elements(p_lines)
  loop
    v_idx := v_idx + 1;
    v_received := v_received + 1;
    v_geo := v_elem -> 'geometry';
    v_zone_txt := nullif(btrim(coalesce(v_elem ->> 'zone_id', '')), '');
    v_zone := case when v_zone_txt is null then null else v_zone_txt::uuid end;

    if v_zone is not null and not (v_zone = any(v_campaign_zone_ids)) then
      raise exception 'ZONA_NON_APPARTIENE_ALLA_CAMPAGNA (indice %)', v_idx using errcode = '22023';
    end if;
    if v_geo is null then
      v_discarded := v_discarded + 1;
      v_discarded_idx := array_append(v_discarded_idx, v_idx);
      continue;
    end if;
    begin
      v_geom := public.ST_MakeValid(public.ST_SetSRID(public.ST_GeomFromGeoJSON(v_geo::text), 4326));
    exception when others then
      v_geom := null;
    end;
    if v_geom is null or public.ST_IsEmpty(v_geom) then
      v_discarded := v_discarded + 1;
      v_discarded_idx := array_append(v_discarded_idx, v_idx);
      continue;
    end if;
    v_gtype := public.GeometryType(v_geom);
    if v_gtype not in ('LINESTRING', 'MULTILINESTRING') or public.ST_NPoints(v_geom) < 2 then
      v_discarded := v_discarded + 1;
      v_discarded_idx := array_append(v_discarded_idx, v_idx);
      continue;
    end if;
    v_valid_geoms := array_append(v_valid_geoms, v_geom);
    v_valid_zones := array_append(v_valid_zones, v_zone);
  end loop;

  if array_length(v_valid_geoms, 1) is null then
    raise exception 'NESSUNA_GEOMETRIA_VALIDA: % linee ricevute, tutte scartate', v_received using errcode = '22023';
  end if;

  perform set_config('app.coverage_batch_mode', '1', true);

  with ins as (
    insert into public.campaign_coverage_adjustments
      (campaign_id, zone_id, adjustment_type, geometry, reason, notes, metadata, created_by,
       source, line_buffer_m, verified_at, verified_by)
    select p_campaign_id,
           v_valid_zones[i],
           p_adjustment_type,
           v_valid_geoms[i],
           v_reason,
           v_notes,
           v_meta,
           v_uid,
           p_source,
           v_buffer,
           now(),
           v_uid
    from generate_subscripts(v_valid_geoms, 1) as s(i)
    returning id, campaign_id, zone_id, adjustment_type, reason, notes, geometry
  ),
  logged as (
    insert into public.campaign_coverage_adjustments_log
      (adjustment_id, campaign_id, zone_id, event_type, adjustment_type, reason, notes, geometry_geojson, changed_by)
    select id, campaign_id, zone_id, 'created', adjustment_type, reason, notes,
           public.ST_AsGeoJSON(geometry)::jsonb, v_uid
    from ins
    returning 1
  )
  select count(*)::int into v_inserted from ins;

  perform set_config('app.coverage_batch_mode', '', true);

  for v_z in
    select distinct v_valid_zones[i]
    from generate_subscripts(v_valid_zones, 1) as s(i)
    where v_valid_zones[i] is not null
  loop
    perform public.sync_campaign_zone_progress_cache(v_z, v_uid);
  end loop;

  return jsonb_build_object(
    'campaign_id', p_campaign_id,
    'source', p_source,
    'adjustment_type', p_adjustment_type,
    'line_buffer_m', v_buffer,
    'received', v_received,
    'inserted', v_inserted,
    'discarded', v_discarded,
    'discarded_indexes', to_jsonb(v_discarded_idx)
  );
end;
$function$;

commit;
