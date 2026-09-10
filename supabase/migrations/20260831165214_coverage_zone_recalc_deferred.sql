-- TIMEOUT DOPO GOMMA — disaccoppia il ricalcolo pesante dall'edit.
--
-- RUNTIME (campagna 7406e420-9999-409c-88a9-e15a81353e35, ~2474 righe
-- automatic_verified attive): la modifica geometrica (revoca sorgente +
-- segmenti residui) e' transazionalmente OK, ma la sync FINALE della cache
-- zona va in "canceling statement due to statement timeout".
--
-- COLLO DI BOTTIGLIA: sync_campaign_zone_progress_cache -> calculate_zone_
-- final_coverage fa ST_UnaryUnion(ST_Collect(ST_Buffer(geometry::geography, 12)))
-- su ~2474 LineString. E' un union di ~2474 poligoni bufferati: costo assoluto
-- alto (decine di secondi). statement_timeout=300s a livello di funzione NON
-- basta perche' il gateway HTTP di PostgREST (Kong, ~60s) chiude comunque la
-- richiesta; alla chiusura della connessione Postgres annulla lo statement e
-- l'INTERA transazione dell'edit farebbe rollback.
--
-- FIX (Strategia C — piu' piccola e sicura): l'edit NON esegue il ricalcolo
-- pesante nella stessa request.
--   * il trigger AFTER INSERT/UPDATE marca la zona "da ricalcolare"
--     (campaign_zone_progress.stale_since) con un UPDATE indicizzato O(1) —
--     nessun ST_UnaryUnion nella transazione dell'edit;
--   * admin_split_coverage_adjustment marca la zona dirty e ritorna subito
--     (edit committato, transazionalmente sicuro);
--   * il ricalcolo pesante vive in una RPC separata admin_recalc_zone_coverage,
--     chiamata dal frontend DOPO l'edit (best-effort). Se quella va in timeout
--     l'edit resta committato, la zona resta dirty e un retry/cron completa.
--
-- La copertura mostrata all'Admin/Cliente ("finale verificata") e'
-- calculate_campaign_final_coverage, gia' calcolata LIVE dalle righe di
-- campaign_coverage_adjustments -> corretta subito dopo l'edit, senza la
-- cache zona. La cache campaign_zone_progress serve solo a ZoneProgressPanel
-- (nascosto in modalita' simple) e al report finale.
--
-- NON cambia: hit-test GOMMA, batch automatico, semantica di
-- calculate_campaign_final_coverage, Driver/Auth/Supplier/Navbar/Studio Avanzato.

begin;

-- ---------------------------------------------------------------------------
-- 1. Marcatore "cache zona da ricalcolare"
-- ---------------------------------------------------------------------------
alter table public.campaign_zone_progress
  add column if not exists stale_since timestamptz;

comment on column public.campaign_zone_progress.stale_since is
  'Non NULL = la copertura geometrica della zona e'' cambiata ma il ricalcolo pesante (calculate_zone_final_coverage) non e'' ancora stato eseguito. Lo azzera admin_recalc_zone_coverage.';

-- ---------------------------------------------------------------------------
-- 2. Trigger di sync: NON ricalcola piu' nella transazione dell'edit.
--    Marca solo la zona dirty (UPDATE indicizzato, O(1)). Guardia batch
--    (app.coverage_batch_mode) invariata.
-- ---------------------------------------------------------------------------
create or replace function public.campaign_coverage_adjustments_sync_trigger()
returns trigger
  language plpgsql security definer set search_path to ''
as $function$
begin
  if pg_catalog.current_setting('app.coverage_batch_mode', true) = '1' then
    return new;
  end if;
  if new.zone_id is not null then
    -- Solo marcatura dirty: nessun ST_UnaryUnion qui. Il ricalcolo pesante
    -- e' delegato a admin_recalc_zone_coverage (chiamata separata).
    insert into public.campaign_zone_progress (campaign_zone_id, campaign_id, source, stale_since)
    values (new.zone_id, new.campaign_id, 'geometric', now())
    on conflict (campaign_zone_id) do update set stale_since = now();
  end if;
  return new;
end;
$function$;
alter function public.campaign_coverage_adjustments_sync_trigger() owner to postgres;

-- ---------------------------------------------------------------------------
-- 3. admin_split_coverage_adjustment — niente sync pesante nella request.
--    Stesso corpo di 20260831130000, ma il passo (3) marca la zona dirty
--    invece di chiamare sync_campaign_zone_progress_cache.
-- ---------------------------------------------------------------------------
create or replace function public.admin_split_coverage_adjustment(
  p_adjustment_id uuid,
  p_residual_lines jsonb,
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

  -- Valida i segmenti residui PRIMA di scrivere. Solo LineString/MultiLineString.
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

  -- Flag TRANSAZIONE-LOCALE: il trigger salta anche la marcatura per-riga;
  -- si marca la zona dirty UNA volta sotto.
  perform pg_catalog.set_config('app.coverage_batch_mode', '1', true);

  -- 1) revoca la correzione sorgente
  update public.campaign_coverage_adjustments
  set revoked_at = now(), revoked_by = v_uid, revoke_reason = v_reason, updated_by = v_uid, updated_at = now()
  where id = p_adjustment_id;

  insert into public.campaign_coverage_adjustments_log
    (adjustment_id, campaign_id, zone_id, event_type, adjustment_type, reason, notes, geometry_geojson, changed_by)
  values (v_src.id, v_src.campaign_id, v_src.zone_id, 'revoked', v_src.adjustment_type, v_reason, v_src.notes,
    public.ST_AsGeoJSON(v_src.geometry)::jsonb, v_uid);

  -- 2) crea i segmenti residui (0..N) copiando ownership/source/zone/metadata.
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

  -- 3) MARCA la zona dirty (O(1)). Nessun ricalcolo pesante nella request:
  -- lo fa admin_recalc_zone_coverage, chiamata separatamente dal frontend.
  if v_src.zone_id is not null then
    insert into public.campaign_zone_progress (campaign_zone_id, campaign_id, source, stale_since)
    values (v_src.zone_id, v_src.campaign_id, 'geometric', now())
    on conflict (campaign_zone_id) do update set stale_since = now();
  end if;

  return pg_catalog.jsonb_build_object(
    'revoked_id', v_src.id,
    'source', v_src.source,
    'zone_id', v_src.zone_id,
    'created_count', v_created,
    'discarded', v_discarded,
    'created_ids', pg_catalog.to_jsonb(v_created_ids),
    'zone_recalc_pending', v_src.zone_id is not null
  );
end;
$function$;

-- l'RPC ora e' leggera: timeout modesto (il pesante e' in admin_recalc_zone_coverage)
alter function public.admin_split_coverage_adjustment(uuid, jsonb, text) set statement_timeout = '60s';
alter function public.admin_split_coverage_adjustment(uuid, jsonb, text) owner to postgres;

-- ---------------------------------------------------------------------------
-- 4. admin_recalc_zone_coverage — il ricalcolo PESANTE, separato dall'edit.
--    Chiamato dal frontend DOPO l'edit (best-effort). Se va in timeout,
--    l'edit e' gia' committato, la zona resta dirty, un retry lo completa.
-- ---------------------------------------------------------------------------
create or replace function public.admin_recalc_zone_coverage(p_campaign_zone_id uuid)
returns jsonb
  language plpgsql security definer set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_campaign_id uuid;
  v_started timestamptz := pg_catalog.clock_timestamp();
begin
  if not public.gps_is_admin() then
    raise exception 'ADMIN_NON_AUTORIZZATO' using errcode = '42501';
  end if;
  select campaign_id into v_campaign_id from public.campaign_zones where id = p_campaign_zone_id;
  if v_campaign_id is null then
    raise exception 'ZONA_NON_TROVATA' using errcode = 'P0002';
  end if;

  perform public.sync_campaign_zone_progress_cache(p_campaign_zone_id, v_uid);
  update public.campaign_zone_progress set stale_since = null where campaign_zone_id = p_campaign_zone_id;

  return pg_catalog.jsonb_build_object(
    'campaign_zone_id', p_campaign_zone_id,
    'recalculated', true,
    'duration_ms', pg_catalog.round(pg_catalog.extract(epoch from (pg_catalog.clock_timestamp() - v_started)) * 1000)::int
  );
end;
$function$;

alter function public.admin_recalc_zone_coverage(uuid) set statement_timeout = '600s';
alter function public.admin_recalc_zone_coverage(uuid) owner to postgres;
revoke all on function public.admin_recalc_zone_coverage(uuid) from public;
grant execute on function public.admin_recalc_zone_coverage(uuid) to authenticated, service_role;

commit;
