-- GOMMA PARZIALE + TIMEOUT — correzioni sorgente, mai il poligono finale.
--
-- CONTESTO RUNTIME (campagna 7406e420-9999-409c-88a9-e15a81353e35, ~2474
-- righe source=automatic_verified attive nella zona Bergamo):
--   1) "canceling statement due to statement timeout" su revoca/modifica:
--      il trigger AFTER UPDATE campaign_coverage_adjustments_sync_zone_cache
--      chiama sync_campaign_zone_progress_cache -> calculate_zone_final_coverage
--      che unisce/bufferizza TUTTE le righe attive della zona. Con ~2474
--      linee una singola modifica supera il statement_timeout del gateway.
--   2) la GOMMA su un tratto salvato revocava SEMPRE l'intera LineString,
--      anche quando il click ne toccava solo una porzione.
--
-- FIX (nessuna modifica alla semantica delle percentuali, al batch automatico
-- gia' funzionante, a calculate_campaign_final_coverage):
--   A) statement_timeout esteso a livello di FUNZIONE per il percorso di
--      sync (una sola ricalcolo per operazione, ma piu' lungo del default
--      del gateway). NB: un gateway HTTP (Kong/PostgREST) puo' comunque
--      cappare ~60s -> vedi report per il limite reale.
--   B) admin_split_coverage_adjustment: revoca la correzione sorgente e crea
--      i segmenti residui in UNA transazione atomica, con UNA sola sync
--      finale (flag transazione-locale app.coverage_batch_mode, gia' letto
--      dal trigger dalla migration 20260831120000). Se non restano segmenti
--      residui = revoca completa (accettabile). Ownership/source/zone/
--      metadata dei residui = quelli della sorgente.

begin;

-- ---------------------------------------------------------------------------
-- A. Timeout esteso sul percorso di sync (nessuna modifica al corpo)
-- ---------------------------------------------------------------------------
alter function public.calculate_zone_final_coverage(uuid) set statement_timeout = '300s';
alter function public.sync_campaign_zone_progress_cache(uuid, uuid) set statement_timeout = '300s';
alter function public.admin_revoke_coverage_adjustment(uuid, text) set statement_timeout = '300s';
alter function public.admin_update_coverage_adjustment(uuid, text, jsonb, text, text, jsonb, text, numeric) set statement_timeout = '300s';

-- ---------------------------------------------------------------------------
-- B. admin_split_coverage_adjustment — GOMMA parziale atomica
-- ---------------------------------------------------------------------------
create or replace function public.admin_split_coverage_adjustment(
  p_adjustment_id uuid,
  p_residual_lines jsonb,                          -- [ <GeoJSON LineString/MultiLineString>, ... ]  (segmenti che RESTANO)
  p_reason text default 'admin_partial_erase'
) returns jsonb
  language plpgsql security definer set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_src public.campaign_coverage_adjustments%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_elem jsonb;
  v_geom public.geometry;
  v_gtype text;
  v_valid_geoms public.geometry[] := array[]::public.geometry[];
  v_discarded int := 0;
  v_created int := 0;
  v_created_ids uuid[] := array[]::uuid[];
begin
  if not public.gps_is_admin() then
    raise exception 'ADMIN_NON_AUTORIZZATO' using errcode = '42501';
  end if;

  select * into v_src from public.campaign_coverage_adjustments where id = p_adjustment_id for update;
  if not found then
    raise exception 'CORREZIONE_NON_TROVATA' using errcode = 'P0002';
  end if;
  if v_src.revoked_at is not null then
    raise exception 'CORREZIONE_GIA_REVOCATA' using errcode = '22023';
  end if;
  if v_reason is null then v_reason := 'admin_partial_erase'; end if;
  if p_residual_lines is null or pg_catalog.jsonb_typeof(p_residual_lines) <> 'array' then
    raise exception 'RESIDUAL_LINES_NON_VALIDO' using errcode = '22023';
  end if;

  -- Valida i segmenti residui PRIMA di scrivere. Solo LineString/
  -- MultiLineString: i residui di una GOMMA sono sempre lineari.
  for v_elem in select * from pg_catalog.jsonb_array_elements(p_residual_lines)
  loop
    begin
      v_geom := public.ST_MakeValid(public.ST_SetSRID(public.ST_GeomFromGeoJSON(v_elem::text), 4326));
    exception when others then
      v_geom := null;
    end;
    if v_geom is null or public.ST_IsEmpty(v_geom) then
      v_discarded := v_discarded + 1;
      continue;
    end if;
    v_gtype := public.GeometryType(v_geom);
    if v_gtype not in ('LINESTRING', 'MULTILINESTRING') or public.ST_NPoints(v_geom) < 2 then
      v_discarded := v_discarded + 1;
      continue;
    end if;
    v_valid_geoms := pg_catalog.array_append(v_valid_geoms, v_geom);
  end loop;

  -- Flag TRANSAZIONE-LOCALE: il trigger di sync per-riga salta il ricalcolo.
  -- Una sola sync finale sotto (vedi migration 20260831120000 per la guardia).
  perform pg_catalog.set_config('app.coverage_batch_mode', '1', true);

  -- 1) revoca la correzione sorgente
  update public.campaign_coverage_adjustments
  set revoked_at = now(), revoked_by = v_uid, revoke_reason = v_reason, updated_by = v_uid, updated_at = now()
  where id = p_adjustment_id;

  insert into public.campaign_coverage_adjustments_log
    (adjustment_id, campaign_id, zone_id, event_type, adjustment_type, reason, notes, geometry_geojson, changed_by)
  values (v_src.id, v_src.campaign_id, v_src.zone_id, 'revoked', v_src.adjustment_type, v_reason, v_src.notes,
    public.ST_AsGeoJSON(v_src.geometry)::jsonb, v_uid);

  -- 2) crea i segmenti residui (0..N) copiando ownership/source/zone/metadata
  -- della sorgente. 0 residui = GOMMA che copre tutta la linea = revoca
  -- completa (accettabile).
  if pg_catalog.array_length(v_valid_geoms, 1) is not null then
    with ins as (
      insert into public.campaign_coverage_adjustments
        (campaign_id, zone_id, adjustment_type, geometry, reason, notes, metadata, created_by,
         source, line_buffer_m, verified_at, verified_by)
      select v_src.campaign_id, v_src.zone_id, v_src.adjustment_type, g, v_src.reason, v_src.notes,
             v_src.metadata, v_uid, v_src.source, v_src.line_buffer_m, now(), v_uid
      from pg_catalog.unnest(v_valid_geoms) as g
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
    select pg_catalog.count(*)::int, pg_catalog.array_agg(id)
    into v_created, v_created_ids
    from ins;
  end if;

  perform pg_catalog.set_config('app.coverage_batch_mode', '', true);

  -- 3) UNA sola sync della cache zona per l'intera operazione.
  if v_src.zone_id is not null then
    perform public.sync_campaign_zone_progress_cache(v_src.zone_id, v_uid);
  end if;

  return pg_catalog.jsonb_build_object(
    'revoked_id', v_src.id,
    'source', v_src.source,
    'zone_id', v_src.zone_id,
    'created_count', v_created,
    'discarded', v_discarded,
    'created_ids', pg_catalog.to_jsonb(v_created_ids)
  );
end;
$function$;

alter function public.admin_split_coverage_adjustment(uuid, jsonb, text) set statement_timeout = '300s';
alter function public.admin_split_coverage_adjustment(uuid, jsonb, text) owner to postgres;
revoke all on function public.admin_split_coverage_adjustment(uuid, jsonb, text) from public;
grant execute on function public.admin_split_coverage_adjustment(uuid, jsonb, text) to authenticated, service_role;

commit;
