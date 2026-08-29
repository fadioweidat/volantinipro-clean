-- VERIFIED COVERAGE — estende campaign_coverage_adjustments (NON una seconda
-- pipeline): matita a tratto (LineString), fonte esplicita, e gomma su GPS
-- reale come esclusione verificata (mai un DELETE/UPDATE su gps_tracking_points).
--
-- PROPOSTA, NON APPLICATA in questo turno.
--
-- MODELLO
--   source (nuova colonna):
--     manual_verified     — tratto/area disegnata a mano dall'Admin
--     automatic_verified   — parte della generazione automatica confermata
--     gps_exclusion        — la GOMMA sul GPS reale: area da SOTTRARRE alla
--                            geometria GPS nella copertura finale
--   adjustment_type (semantica invariata + un valore nuovo):
--     manual_covered / partially_covered — copertura additiva
--     inaccessible                       — area non distribuibile (riduce il denominatore)
--     exclusion                          — sottrae dalla copertura GPS/effettiva (usata da gps_exclusion)
--   geometry: Polygon/MultiPolygon come oggi, + LineString/MultiLineString per
--             matita a tratto (source manual/automatic). line_buffer_m = raggio
--             di buffer applicato alla linea sia nel calcolo sia a display.
--
-- IMMUTABILITA': gps_tracking_points non viene MAI toccato. La gomma sul GPS
-- reale e' una riga di overlay (source=gps_exclusion) revocabile, mai una
-- cancellazione dello storico.

begin;

-- ---------------------------------------------------------------------------
-- 1. Colonne additive
-- ---------------------------------------------------------------------------
alter table public.campaign_coverage_adjustments
  add column if not exists source text not null default 'manual_verified';
alter table public.campaign_coverage_adjustments
  add column if not exists line_buffer_m numeric;
alter table public.campaign_coverage_adjustments
  add column if not exists verified_at timestamptz;
alter table public.campaign_coverage_adjustments
  add column if not exists verified_by uuid;

-- source ammesse
alter table public.campaign_coverage_adjustments
  drop constraint if exists campaign_coverage_adjustments_source_check;
alter table public.campaign_coverage_adjustments
  add constraint campaign_coverage_adjustments_source_check
  check (source in ('manual_verified', 'automatic_verified', 'gps_exclusion'));

-- adjustment_type: aggiunge 'exclusion' ai valori esistenti (ricreato,
-- nessuna riga esistente lo usa quindi la validazione non fallisce)
alter table public.campaign_coverage_adjustments
  drop constraint if exists campaign_coverage_adjustments_type_check;
alter table public.campaign_coverage_adjustments
  add constraint campaign_coverage_adjustments_type_check
  check (adjustment_type in ('manual_covered', 'partially_covered', 'inaccessible', 'exclusion'));

-- coerenza source <-> type (NOT VALID: non tocca lo storico)
alter table public.campaign_coverage_adjustments
  drop constraint if exists campaign_coverage_adjustments_source_type_chk;
alter table public.campaign_coverage_adjustments
  add constraint campaign_coverage_adjustments_source_type_chk
  check (
    (source = 'gps_exclusion' and adjustment_type = 'exclusion')
    or (source in ('manual_verified', 'automatic_verified')
        and adjustment_type in ('manual_covered', 'partially_covered', 'inaccessible'))
  ) not valid;

-- geometry: la colonna era tipizzata geometry(Polygon,4326) — il typmod
-- rifiuterebbe una LineString ancor prima del CHECK. La rilassiamo a
-- geometry(Geometry,4326): le righe Polygon esistenti restano valide, e ora
-- la matita "a tratto" (LineString) puo' essere salvata. Il tipo ammesso e'
-- comunque ristretto dal CHECK _geometry_type_chk qui sotto + dalla logica
-- delle RPC admin_*_coverage_adjustment.
alter table public.campaign_coverage_adjustments
  alter column geometry type public.geometry(Geometry, 4326) using geometry;

-- geometry: Polygon/MultiPolygon (come oggi) OPPURE LineString/MultiLineString
-- (matita a tratto). Il vincolo esistente _geometry_valid (ST_IsValid AND NOT
-- ST_IsEmpty) resta.
alter table public.campaign_coverage_adjustments
  drop constraint if exists campaign_coverage_adjustments_geometry_type_chk;
alter table public.campaign_coverage_adjustments
  add constraint campaign_coverage_adjustments_geometry_type_chk
  check (public.GeometryType(geometry) in
    ('POLYGON', 'MULTIPOLYGON', 'LINESTRING', 'MULTILINESTRING')) not valid;

-- Il trigger campaign_coverage_adjustments_sync_trigger propaga
-- adjustment_type nella cache campaign_zone_progress: allarghiamo il suo
-- CHECK per accettare 'exclusion', e (sotto) la funzione di sync ignora le
-- righe di sola esclusione GPS nella scelta della "correzione attiva".
alter table public.campaign_zone_progress
  drop constraint if exists campaign_zone_progress_adjustment_type_check;
alter table public.campaign_zone_progress
  add constraint campaign_zone_progress_adjustment_type_check
  check (adjustment_type is null or adjustment_type in
    ('manual_covered', 'partially_covered', 'inaccessible', 'exclusion'));

comment on column public.campaign_coverage_adjustments.source is
  'manual_verified | automatic_verified | gps_exclusion. gps_exclusion = gomma sul GPS reale (overlay, mai DELETE su gps_tracking_points).';
comment on column public.campaign_coverage_adjustments.line_buffer_m is
  'Raggio di buffer (m) applicato a una geometry LineString/MultiLineString, sia nel calcolo copertura sia a display. NULL per le geometrie ad area.';

-- ---------------------------------------------------------------------------
-- 2. calculate_campaign_final_coverage — v2
--    * bufferizza le LineString manuali/automatiche (line_buffer_m, default 12)
--    * sottrae le esclusioni GPS (source=gps_exclusion) dalla geometria GPS
--    * espone final_coverage_geometry (GeoJSON) = ESATTAMENTE la geometria che
--      renderizzano sia l'anteprima Admin "Copertura finale" sia il Cliente
--    Firma invariata. gps_tracking_points intatto.
-- ---------------------------------------------------------------------------
create or replace function public.calculate_campaign_final_coverage(p_campaign_id uuid)
returns jsonb
  language plpgsql stable security definer set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean := public.gps_is_admin();
  v_is_owner boolean := false;
  v_total_geom public.geometry;
  v_gps_geom public.geometry;
  v_gps_exclusion_geom public.geometry;
  v_manual_geom public.geometry;
  v_inaccessible_geom public.geometry;
  v_manual_incremental_geom public.geometry;
  v_effective_covered_geom public.geometry;
  v_total_area numeric := 0;
  v_gps_area numeric := 0;
  v_manual_area numeric := 0;
  v_inaccessible_area numeric := 0;
  v_effective_area numeric := 0;
  v_effective_total_area numeric := 0;
begin
  if v_uid is null and not v_is_admin then
    raise exception 'UTENTE_NON_AUTENTICATO' using errcode = '42501';
  end if;

  select exists (select 1 from public.campaigns c where c.id = p_campaign_id and c.user_id = v_uid) into v_is_owner;
  if not v_is_admin and not v_is_owner then
    raise exception 'CAMPAGNA_NON_AUTORIZZATA' using errcode = '42501';
  end if;

  select public.ST_UnaryUnion(public.ST_Collect(geom))
  into v_total_geom
  from (
    select
      case
        when z.polygon_geojson is not null then
          public.ST_MakeValid(public.ST_SetSRID(public.ST_GeomFromGeoJSON(z.polygon_geojson::text), 4326))
        when z.center_lat is not null and z.center_lng is not null and z.radius_m is not null then
          public.ST_MakeValid(public.ST_Buffer(public.ST_SetSRID(public.ST_MakePoint(z.center_lng::double precision, z.center_lat::double precision), 4326)::public.geography, z.radius_m)::public.geometry)
        else null
      end as geom
    from public.campaign_zones z
    where z.campaign_id = p_campaign_id
  ) zones
  where geom is not null;

  if v_total_geom is null then
    return pg_catalog.jsonb_build_object(
      'campaign_id', p_campaign_id, 'calculation_status', 'zone_geometry_missing',
      'gps_coverage_pct', null, 'manual_coverage_pct', null, 'inaccessible_area_pct', null,
      'final_operational_coverage_pct', null, 'final_coverage_geometry', null
    );
  end if;

  v_total_area := public.ST_Area(v_total_geom::public.geography);

  -- Geometria GPS grezza (bufferata a 30 m), clippata alle zone.
  select public.ST_Intersection(
    public.ST_UnaryUnion(public.ST_Buffer(public.ST_MakeLine(geom order by recorded_at)::public.geography, 30)::public.geometry),
    v_total_geom
  )
  into v_gps_geom
  from public.gps_tracking_points
  where session_id in (select id from public.delivery_sessions where campaign_id = p_campaign_id)
    and lat != 0 and lng != 0 and (accuracy is null or accuracy <= 65)
  having count(*) >= 2;

  if v_gps_geom is null or public.ST_IsEmpty(v_gps_geom) then
    v_gps_geom := public.ST_GeomFromText('POLYGON EMPTY', 4326);
  end if;

  -- GOMMA sul GPS reale: sottrae le aree source=gps_exclusion dalla geometria
  -- GPS. Non tocca gps_tracking_points: e' una maschera di overlay.
  select public.ST_UnaryUnion(public.ST_Collect(public.ST_MakeValid(geometry)))
  into v_gps_exclusion_geom
  from public.campaign_coverage_adjustments
  where campaign_id = p_campaign_id and revoked_at is null and source = 'gps_exclusion';

  if v_gps_exclusion_geom is not null and not public.ST_IsEmpty(v_gps_exclusion_geom) then
    v_gps_geom := public.ST_Difference(v_gps_geom, public.ST_Intersection(v_gps_exclusion_geom, v_total_geom));
    if v_gps_geom is null or public.ST_IsEmpty(v_gps_geom) then
      v_gps_geom := public.ST_GeomFromText('POLYGON EMPTY', 4326);
    end if;
  end if;
  v_gps_area := public.ST_Area(v_gps_geom::public.geography);

  -- Copertura manuale/automatica: LineString bufferate a line_buffer_m (12 m
  -- di default), poi unione. source manual_verified + automatic_verified.
  select public.ST_UnaryUnion(public.ST_Collect(
    case
      when public.GeometryType(geometry) in ('LINESTRING', 'MULTILINESTRING') then
        public.ST_MakeValid(public.ST_Buffer(geometry::public.geography, coalesce(line_buffer_m, 12))::public.geometry)
      else public.ST_MakeValid(geometry)
    end
  ))
  into v_manual_geom
  from public.campaign_coverage_adjustments
  where campaign_id = p_campaign_id and revoked_at is null
    and source in ('manual_verified', 'automatic_verified')
    and adjustment_type in ('manual_covered', 'partially_covered');

  if v_manual_geom is not null and not public.ST_IsEmpty(v_manual_geom) then
    v_manual_geom := public.ST_Intersection(public.ST_MakeValid(v_manual_geom), v_total_geom);
    v_manual_incremental_geom := public.ST_Difference(v_manual_geom, v_gps_geom);
    v_manual_area := public.ST_Area(v_manual_incremental_geom::public.geography);
  else
    v_manual_geom := public.ST_GeomFromText('POLYGON EMPTY', 4326);
    v_manual_incremental_geom := v_manual_geom;
    v_manual_area := 0;
  end if;

  -- Inaccessibile: riduce il denominatore (invariato).
  select public.ST_UnaryUnion(public.ST_Collect(public.ST_MakeValid(geometry)))
  into v_inaccessible_geom
  from public.campaign_coverage_adjustments
  where campaign_id = p_campaign_id and revoked_at is null and adjustment_type = 'inaccessible';

  if v_inaccessible_geom is not null and not public.ST_IsEmpty(v_inaccessible_geom) then
    v_inaccessible_geom := public.ST_Intersection(public.ST_MakeValid(v_inaccessible_geom), v_total_geom);
    v_inaccessible_area := public.ST_Area(v_inaccessible_geom::public.geography);
  else
    v_inaccessible_area := 0;
  end if;

  v_effective_covered_geom := public.ST_UnaryUnion(public.ST_Collect(array[v_gps_geom, v_manual_incremental_geom]));
  if v_effective_covered_geom is null or public.ST_IsEmpty(v_effective_covered_geom) then
    v_effective_covered_geom := public.ST_GeomFromText('POLYGON EMPTY', 4326);
    v_effective_area := 0;
  else
    v_effective_area := public.ST_Area(v_effective_covered_geom::public.geography);
  end if;

  v_effective_total_area := greatest(v_total_area - v_inaccessible_area, 0);

  return pg_catalog.jsonb_build_object(
    'campaign_id', p_campaign_id, 'calculation_status', 'ready',
    'total_area_m2', pg_catalog.round(v_total_area, 2),
    'gps_area_m2', pg_catalog.round(v_gps_area, 2),
    'manual_area_m2', pg_catalog.round(v_manual_area, 2),
    'inaccessible_area_m2', pg_catalog.round(v_inaccessible_area, 2),
    'gps_coverage_pct', case when v_total_area > 0 then least(greatest(round((v_gps_area / v_total_area) * 100, 2), 0), 100) else 0 end,
    'manual_coverage_pct', case when v_total_area > 0 then least(greatest(round((v_manual_area / v_total_area) * 100, 2), 0), 100) else 0 end,
    'inaccessible_area_pct', case when v_total_area > 0 then least(greatest(round((v_inaccessible_area / v_total_area) * 100, 2), 0), 100) else 0 end,
    'final_operational_coverage_pct', case when v_effective_total_area > 0 then least(greatest(round((v_effective_area / v_effective_total_area) * 100, 2), 0), 100) else 0 end,
    -- Geometria UNICA renderizzata identica da Admin ("Copertura finale") e
    -- Cliente ("Copertura verificata"). Nessuna distinzione per source.
    'final_coverage_geometry', case
      when v_effective_covered_geom is not null and not public.ST_IsEmpty(v_effective_covered_geom)
      then public.ST_AsGeoJSON(public.ST_SnapToGrid(v_effective_covered_geom, 0.000001))::jsonb
      else null end
  );
end;
$function$;

-- ---------------------------------------------------------------------------
-- 3. admin_create_coverage_adjustment — v2 (source + line_buffer_m + LineString)
-- ---------------------------------------------------------------------------
create or replace function public.admin_create_coverage_adjustment(
  p_campaign_id uuid, p_zone_id uuid, p_adjustment_type text, p_geometry_geojson jsonb,
  p_reason text, p_notes text default null, p_metadata jsonb default '{}'::jsonb,
  p_source text default 'manual_verified', p_line_buffer_m numeric default null
) returns public.campaign_coverage_adjustments
  language plpgsql security definer set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_geom public.geometry;
  v_gtype text;
  v_new public.campaign_coverage_adjustments%rowtype;
begin
  if not public.gps_is_admin() then
    raise exception 'ADMIN_NON_AUTORIZZATO' using errcode = '42501';
  end if;
  if p_source not in ('manual_verified', 'automatic_verified', 'gps_exclusion') then
    raise exception 'SOURCE_NON_VALIDA' using errcode = '22023';
  end if;
  if p_adjustment_type not in ('manual_covered', 'partially_covered', 'inaccessible', 'exclusion') then
    raise exception 'TIPO_CORREZIONE_NON_VALIDO' using errcode = '22023';
  end if;
  if p_source = 'gps_exclusion' and p_adjustment_type <> 'exclusion' then
    raise exception 'GPS_EXCLUSION_RICHIEDE_TYPE_EXCLUSION' using errcode = '22023';
  end if;
  if p_source in ('manual_verified', 'automatic_verified') and p_adjustment_type = 'exclusion' then
    raise exception 'TYPE_EXCLUSION_SOLO_PER_GPS_EXCLUSION' using errcode = '22023';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'MOTIVO_OBBLIGATORIO' using errcode = '22023';
  end if;
  if p_geometry_geojson is null then
    raise exception 'GEOMETRIA_OBBLIGATORIA' using errcode = '22023';
  end if;
  if not exists (select 1 from public.campaigns where id = p_campaign_id) then
    raise exception 'CAMPAGNA_NON_TROVATA' using errcode = 'P0002';
  end if;

  v_geom := public.ST_MakeValid(public.ST_SetSRID(public.ST_GeomFromGeoJSON(p_geometry_geojson::text), 4326));
  if v_geom is null or public.ST_IsEmpty(v_geom) then
    raise exception 'GEOMETRIA_NON_VALIDA' using errcode = '22023';
  end if;
  v_gtype := public.GeometryType(v_geom);

  -- gps_exclusion + inaccessible: area (Polygon). manual/automatic covered:
  -- Polygon OPPURE LineString (matita a tratto).
  if p_adjustment_type in ('inaccessible', 'exclusion') then
    if v_gtype not in ('POLYGON', 'MULTIPOLYGON') then
      raise exception 'GEOMETRIA_NON_VALIDA' using errcode = '22023';
    end if;
  else
    if v_gtype not in ('POLYGON', 'MULTIPOLYGON', 'LINESTRING', 'MULTILINESTRING') then
      raise exception 'GEOMETRIA_NON_VALIDA' using errcode = '22023';
    end if;
  end if;

  if v_gtype in ('LINESTRING', 'MULTILINESTRING') and (p_line_buffer_m is null or p_line_buffer_m <= 0 or p_line_buffer_m > 60) then
    raise exception 'LINE_BUFFER_NON_VALIDO' using errcode = '22023';
  end if;

  if v_gtype = 'MULTIPOLYGON' then
    if public.ST_NumGeometries(v_geom) <> 1 then
      raise exception 'GEOMETRIA_NON_VALIDA' using errcode = '22023';
    end if;
    v_geom := public.ST_GeometryN(v_geom, 1);
  end if;

  insert into public.campaign_coverage_adjustments
    (campaign_id, zone_id, adjustment_type, geometry, reason, notes, metadata, created_by,
     source, line_buffer_m, verified_at, verified_by)
  values (p_campaign_id, p_zone_id, p_adjustment_type, v_geom, btrim(p_reason),
    nullif(btrim(p_notes), ''), coalesce(p_metadata, '{}'::jsonb), v_uid,
    p_source, case when v_gtype in ('LINESTRING', 'MULTILINESTRING') then p_line_buffer_m else null end,
    now(), v_uid)
  returning * into v_new;

  insert into public.campaign_coverage_adjustments_log
    (adjustment_id, campaign_id, zone_id, event_type, adjustment_type, reason, notes, geometry_geojson, changed_by)
  values (v_new.id, v_new.campaign_id, v_new.zone_id, 'created', v_new.adjustment_type, v_new.reason,
    v_new.notes, public.ST_AsGeoJSON(v_new.geometry)::jsonb, v_uid);

  return v_new;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 4. admin_update_coverage_adjustment — v2 (corregge un tratto: geometry/type/
--    source/line_buffer). Non puo' cambiare campaign_id. Revocata -> errore.
-- ---------------------------------------------------------------------------
create or replace function public.admin_update_coverage_adjustment(
  p_adjustment_id uuid, p_adjustment_type text, p_geometry_geojson jsonb, p_reason text,
  p_notes text default null, p_metadata jsonb default null,
  p_source text default null, p_line_buffer_m numeric default null
) returns public.campaign_coverage_adjustments
  language plpgsql security definer set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_geom public.geometry;
  v_gtype text;
  v_source text;
  v_old public.campaign_coverage_adjustments%rowtype;
  v_new public.campaign_coverage_adjustments%rowtype;
begin
  if not public.gps_is_admin() then
    raise exception 'ADMIN_NON_AUTORIZZATO' using errcode = '42501';
  end if;
  if p_adjustment_type not in ('manual_covered', 'partially_covered', 'inaccessible', 'exclusion') then
    raise exception 'TIPO_CORREZIONE_NON_VALIDO' using errcode = '22023';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'MOTIVO_OBBLIGATORIO' using errcode = '22023';
  end if;

  select * into v_old from public.campaign_coverage_adjustments where id = p_adjustment_id for update;
  if not found then raise exception 'CORREZIONE_NON_TROVATA' using errcode = 'P0002'; end if;
  if v_old.revoked_at is not null then raise exception 'CORREZIONE_GIA_REVOCATA' using errcode = '22023'; end if;

  v_source := coalesce(p_source, v_old.source);
  if v_source not in ('manual_verified', 'automatic_verified', 'gps_exclusion') then
    raise exception 'SOURCE_NON_VALIDA' using errcode = '22023';
  end if;
  if (v_source = 'gps_exclusion') <> (p_adjustment_type = 'exclusion') then
    raise exception 'INCOERENZA_SOURCE_TYPE' using errcode = '22023';
  end if;

  if p_geometry_geojson is not null then
    v_geom := public.ST_MakeValid(public.ST_SetSRID(public.ST_GeomFromGeoJSON(p_geometry_geojson::text), 4326));
    if v_geom is null or public.ST_IsEmpty(v_geom) then
      raise exception 'GEOMETRIA_NON_VALIDA' using errcode = '22023';
    end if;
    v_gtype := public.GeometryType(v_geom);
    if p_adjustment_type in ('inaccessible', 'exclusion') then
      if v_gtype not in ('POLYGON', 'MULTIPOLYGON') then raise exception 'GEOMETRIA_NON_VALIDA' using errcode = '22023'; end if;
    else
      if v_gtype not in ('POLYGON', 'MULTIPOLYGON', 'LINESTRING', 'MULTILINESTRING') then
        raise exception 'GEOMETRIA_NON_VALIDA' using errcode = '22023';
      end if;
    end if;
    if v_gtype in ('LINESTRING', 'MULTILINESTRING') and (coalesce(p_line_buffer_m, v_old.line_buffer_m) is null
        or coalesce(p_line_buffer_m, v_old.line_buffer_m) <= 0 or coalesce(p_line_buffer_m, v_old.line_buffer_m) > 60) then
      raise exception 'LINE_BUFFER_NON_VALIDO' using errcode = '22023';
    end if;
    if v_gtype = 'MULTIPOLYGON' then
      if public.ST_NumGeometries(v_geom) <> 1 then raise exception 'GEOMETRIA_NON_VALIDA' using errcode = '22023'; end if;
      v_geom := public.ST_GeometryN(v_geom, 1);
    end if;
  else
    v_geom := v_old.geometry;
    v_gtype := public.GeometryType(v_geom);
  end if;

  update public.campaign_coverage_adjustments
  set adjustment_type = p_adjustment_type, geometry = v_geom, reason = btrim(p_reason),
      notes = nullif(btrim(p_notes), ''), metadata = coalesce(p_metadata, metadata),
      source = v_source,
      line_buffer_m = case when v_gtype in ('LINESTRING', 'MULTILINESTRING')
        then coalesce(p_line_buffer_m, v_old.line_buffer_m) else null end,
      updated_by = v_uid, updated_at = now(), verified_at = now(), verified_by = v_uid
  where id = p_adjustment_id
  returning * into v_new;

  insert into public.campaign_coverage_adjustments_log
    (adjustment_id, campaign_id, zone_id, event_type, adjustment_type, reason, notes, geometry_geojson, changed_by)
  values (v_new.id, v_new.campaign_id, v_new.zone_id, 'updated', v_new.adjustment_type, v_new.reason,
    v_new.notes, public.ST_AsGeoJSON(v_new.geometry)::jsonb, v_uid);

  return v_new;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 5. get_campaign_coverage_adjustments — v2: espone source/line_buffer_m SOLO
--    all'Admin. Il ramo non-admin resta minimale (nessuna etichetta tecnica):
--    il Cliente NON usa piu' questa RPC per il rendering (vedi frontend), usa
--    calculate_campaign_final_coverage.final_coverage_geometry.
-- ---------------------------------------------------------------------------
create or replace function public.get_campaign_coverage_adjustments(p_campaign_id uuid)
returns jsonb
  language plpgsql stable security definer set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean := public.gps_is_admin();
  v_is_owner boolean := false;
  v_is_driver boolean := false;
  v_result jsonb;
begin
  if v_uid is null and not v_is_admin then
    raise exception 'UTENTE_NON_AUTENTICATO' using errcode = '42501';
  end if;

  select exists (select 1 from public.campaigns c where c.id = p_campaign_id and c.user_id = v_uid) into v_is_owner;
  if not v_is_admin and not v_is_owner then
    select exists (
      select 1 from public.operator_assignments a
      where a.campaign_id = p_campaign_id and a.operator_id = v_uid and a.status = 'active' and a.revoked_at is null
    ) into v_is_driver;
  end if;
  if not v_is_admin and not v_is_owner and not v_is_driver then
    raise exception 'CAMPAGNA_NON_AUTORIZZATA' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(
    case when v_is_admin then
      jsonb_build_object('id', a.id, 'campaign_id', a.campaign_id, 'zone_id', a.zone_id, 'adjustment_type', a.adjustment_type,
        'source', a.source, 'line_buffer_m', a.line_buffer_m,
        'geometry', public.ST_AsGeoJSON(a.geometry)::jsonb, 'reason', a.reason, 'notes', a.notes, 'metadata', a.metadata,
        'created_by', a.created_by, 'created_at', a.created_at, 'updated_at', a.updated_at, 'updated_by', a.updated_by,
        'verified_at', a.verified_at, 'verified_by', a.verified_by,
        'revoked_at', a.revoked_at, 'revoked_by', a.revoked_by, 'revoke_reason', a.revoke_reason)
    else
      -- non-admin: nessuna source/tipo/geometry per riga (evita etichette
      -- tecniche lato Cliente). Solo un marker di presenza.
      jsonb_build_object('id', a.id, 'updated_at', a.updated_at)
    end order by a.created_at
  ), '[]'::jsonb)
  into v_result
  from public.campaign_coverage_adjustments a
  where a.campaign_id = p_campaign_id and (v_is_admin or a.revoked_at is null);

  return v_result;
end;
$function$;

grant execute on function public.admin_create_coverage_adjustment(uuid, uuid, text, jsonb, text, text, jsonb, text, numeric) to authenticated, service_role;
grant execute on function public.admin_update_coverage_adjustment(uuid, text, jsonb, text, text, jsonb, text, numeric) to authenticated, service_role;

-- Le versioni a 7 argomenti (pre-source) restano come overload dopo il
-- CREATE OR REPLACE a 9 arg: le rimuoviamo per evitare ambiguita' PostgREST.
-- Nessun chiamante le usa piu' (coverage-adjustments-api.js passa sempre
-- p_source + p_line_buffer_m).
drop function if exists public.admin_create_coverage_adjustment(uuid, uuid, text, jsonb, text, text, jsonb);
drop function if exists public.admin_update_coverage_adjustment(uuid, text, jsonb, text, text, jsonb);

-- sync cache zona: la "correzione attiva" mostrata in campaign_zone_progress
-- e' una copertura/inaccessibilita', MAI una pura esclusione GPS
-- (source=gps_exclusion / adjustment_type=exclusion), che e' solo una
-- maschera sulla geometria GPS. Un CREATE OR REPLACE minimale che filtra
-- quelle righe nella scelta di v_latest_active; tutto il resto invariato.
create or replace function public.sync_campaign_zone_progress_cache(p_campaign_zone_id uuid, p_changed_by uuid)
returns void
  language plpgsql security definer set search_path to ''
as $function$
declare
  v_campaign_id uuid;
  v_calc jsonb;
  v_latest_active public.campaign_coverage_adjustments%rowtype;
  v_old public.campaign_zone_progress%rowtype;
  v_new public.campaign_zone_progress%rowtype;
begin
  select campaign_id into v_campaign_id from public.campaign_zones where id = p_campaign_zone_id;
  if v_campaign_id is null then return; end if;

  v_calc := public.calculate_zone_final_coverage(p_campaign_zone_id);
  if coalesce(v_calc->>'calculation_status', '') <> 'ready' then return; end if;

  select * into v_latest_active from public.campaign_coverage_adjustments
  where zone_id = p_campaign_zone_id and revoked_at is null
    and adjustment_type in ('manual_covered', 'partially_covered', 'inaccessible')
  order by updated_at desc limit 1;

  select * into v_old from public.campaign_zone_progress where campaign_zone_id = p_campaign_zone_id;

  insert into public.campaign_zone_progress (
    campaign_zone_id, campaign_id, source, automatic_percent, manual_percent, inaccessible_percent, effective_percent,
    adjustment_type, manual_override_enabled, override_reason, notes, calculation_version, updated_by, updated_at
  ) values (
    p_campaign_zone_id, v_campaign_id, 'geometric',
    (v_calc->>'gps_coverage_pct')::numeric,
    case when v_latest_active.id is not null then (v_calc->>'manual_coverage_pct')::numeric else null end,
    (v_calc->>'inaccessible_area_pct')::numeric,
    (v_calc->>'final_operational_coverage_pct')::numeric,
    v_latest_active.adjustment_type, v_latest_active.id is not null, v_latest_active.reason, v_latest_active.notes,
    'zone-progress-geometric-v1', p_changed_by, now()
  )
  on conflict (campaign_zone_id) do update
    set source = 'geometric', automatic_percent = excluded.automatic_percent, manual_percent = excluded.manual_percent,
        inaccessible_percent = excluded.inaccessible_percent, effective_percent = excluded.effective_percent,
        adjustment_type = excluded.adjustment_type, manual_override_enabled = excluded.manual_override_enabled,
        override_reason = excluded.override_reason, notes = excluded.notes, calculation_version = excluded.calculation_version,
        updated_by = excluded.updated_by, updated_at = now()
  returning * into v_new;

  insert into public.campaign_zone_progress_history (
    progress_id, campaign_zone_id, campaign_id, campaign_zone_id_snapshot, campaign_id_snapshot, zone_name_snapshot,
    event_type, old_automatic_percent, new_automatic_percent, old_manual_percent, new_manual_percent,
    old_effective_percent, new_effective_percent, old_manual_override_enabled, new_manual_override_enabled,
    old_adjustment_type, adjustment_type, old_inaccessible_percent, inaccessible_percent, old_notes, notes,
    reason, source_summary, calculation_version, changed_by
  ) values (
    v_new.id, v_new.campaign_zone_id, v_new.campaign_id,
    v_new.campaign_zone_id, v_new.campaign_id, (select zone_name from public.campaign_zones where id = p_campaign_zone_id),
    'geometric_sync',
    v_old.automatic_percent, v_new.automatic_percent, v_old.manual_percent, v_new.manual_percent,
    v_old.effective_percent, v_new.effective_percent, v_old.manual_override_enabled, v_new.manual_override_enabled,
    v_old.adjustment_type, v_new.adjustment_type, v_old.inaccessible_percent, v_new.inaccessible_percent,
    v_old.notes, v_new.notes,
    coalesce('Sincronizzazione automatica da correzione geometrica: ' || coalesce(v_latest_active.reason, 'nessuna correzione attiva'), 'Sincronizzazione automatica'),
    v_calc, 'zone-progress-geometric-v1', p_changed_by
  );
end;
$function$;

-- ---------------------------------------------------------------------------
-- 6. calculate_zone_final_coverage — v2 (stesso motore per zona: usato dal
--    report finale). LineString bufferate + esclusioni GPS sottratte.
-- ---------------------------------------------------------------------------
create or replace function public.calculate_zone_final_coverage(p_campaign_zone_id uuid)
returns jsonb
  language plpgsql stable security definer set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean := public.gps_is_admin();
  v_is_owner boolean := false;
  v_campaign_id uuid;
  v_zone public.campaign_zones%rowtype;
  v_total_geom public.geometry;
  v_gps_geom public.geometry;
  v_gps_exclusion_geom public.geometry;
  v_manual_geom public.geometry;
  v_inaccessible_geom public.geometry;
  v_manual_incremental_geom public.geometry;
  v_effective_covered_geom public.geometry;
  v_total_area numeric := 0;
  v_gps_area numeric := 0;
  v_manual_area numeric := 0;
  v_inaccessible_area numeric := 0;
  v_effective_area numeric := 0;
  v_effective_total_area numeric := 0;
begin
  select * into v_zone from public.campaign_zones where id = p_campaign_zone_id;
  if not found then raise exception 'ZONA_NON_TROVATA' using errcode = 'P0002'; end if;
  v_campaign_id := v_zone.campaign_id;

  select exists (select 1 from public.campaigns c where c.id = v_campaign_id and c.user_id = v_uid) into v_is_owner;
  if not v_is_admin and not v_is_owner then
    raise exception 'CAMPAGNA_NON_AUTORIZZATA' using errcode = '42501';
  end if;

  if v_zone.polygon_geojson is not null then
    v_total_geom := public.ST_MakeValid(public.ST_SetSRID(public.ST_GeomFromGeoJSON(v_zone.polygon_geojson::text), 4326));
  elsif v_zone.center_lat is not null and v_zone.center_lng is not null and v_zone.radius_m is not null then
    v_total_geom := public.ST_MakeValid(public.ST_Buffer(public.ST_SetSRID(public.ST_MakePoint(v_zone.center_lng::double precision, v_zone.center_lat::double precision), 4326)::public.geography, v_zone.radius_m)::public.geometry);
  else
    return pg_catalog.jsonb_build_object('campaign_zone_id', p_campaign_zone_id, 'campaign_id', v_campaign_id,
      'calculation_status', 'zone_geometry_missing', 'gps_coverage_pct', null, 'manual_coverage_pct', null,
      'inaccessible_area_pct', null, 'final_operational_coverage_pct', null);
  end if;

  v_total_area := public.ST_Area(v_total_geom::public.geography);

  select public.ST_Intersection(
    public.ST_UnaryUnion(public.ST_Buffer(public.ST_MakeLine(geom order by recorded_at)::public.geography, 30)::public.geometry),
    v_total_geom
  )
  into v_gps_geom
  from public.gps_tracking_points
  where session_id in (select id from public.delivery_sessions where campaign_zone_id = p_campaign_zone_id)
    and lat != 0 and lng != 0 and (accuracy is null or accuracy <= 65)
  having count(*) >= 2;

  if v_gps_geom is null or public.ST_IsEmpty(v_gps_geom) then
    v_gps_geom := public.ST_GeomFromText('POLYGON EMPTY', 4326);
  end if;

  select public.ST_UnaryUnion(public.ST_Collect(public.ST_MakeValid(geometry)))
  into v_gps_exclusion_geom
  from public.campaign_coverage_adjustments
  where campaign_id = v_campaign_id and revoked_at is null and source = 'gps_exclusion'
    and (zone_id is null or zone_id = p_campaign_zone_id);

  if v_gps_exclusion_geom is not null and not public.ST_IsEmpty(v_gps_exclusion_geom) then
    v_gps_geom := public.ST_Difference(v_gps_geom, public.ST_Intersection(v_gps_exclusion_geom, v_total_geom));
    if v_gps_geom is null or public.ST_IsEmpty(v_gps_geom) then
      v_gps_geom := public.ST_GeomFromText('POLYGON EMPTY', 4326);
    end if;
  end if;
  v_gps_area := public.ST_Area(v_gps_geom::public.geography);

  select public.ST_UnaryUnion(public.ST_Collect(
    case when public.GeometryType(geometry) in ('LINESTRING', 'MULTILINESTRING')
      then public.ST_MakeValid(public.ST_Buffer(geometry::public.geography, coalesce(line_buffer_m, 12))::public.geometry)
      else public.ST_MakeValid(geometry) end
  ))
  into v_manual_geom
  from public.campaign_coverage_adjustments
  where zone_id = p_campaign_zone_id and revoked_at is null
    and source in ('manual_verified', 'automatic_verified')
    and adjustment_type in ('manual_covered', 'partially_covered');

  if v_manual_geom is not null and not public.ST_IsEmpty(v_manual_geom) then
    v_manual_geom := public.ST_Intersection(public.ST_MakeValid(v_manual_geom), v_total_geom);
    v_manual_incremental_geom := public.ST_Difference(v_manual_geom, v_gps_geom);
    v_manual_area := public.ST_Area(v_manual_incremental_geom::public.geography);
  else
    v_manual_incremental_geom := public.ST_GeomFromText('POLYGON EMPTY', 4326);
    v_manual_area := 0;
  end if;

  select public.ST_UnaryUnion(public.ST_Collect(public.ST_MakeValid(geometry)))
  into v_inaccessible_geom
  from public.campaign_coverage_adjustments
  where zone_id = p_campaign_zone_id and revoked_at is null and adjustment_type = 'inaccessible';

  if v_inaccessible_geom is not null and not public.ST_IsEmpty(v_inaccessible_geom) then
    v_inaccessible_geom := public.ST_Intersection(public.ST_MakeValid(v_inaccessible_geom), v_total_geom);
    v_inaccessible_area := public.ST_Area(v_inaccessible_geom::public.geography);
  else
    v_inaccessible_area := 0;
  end if;

  v_effective_covered_geom := public.ST_UnaryUnion(public.ST_Collect(array[v_gps_geom, v_manual_incremental_geom]));
  if v_effective_covered_geom is not null and not public.ST_IsEmpty(v_effective_covered_geom) then
    v_effective_area := public.ST_Area(v_effective_covered_geom::public.geography);
  else
    v_effective_area := 0;
  end if;

  v_effective_total_area := greatest(v_total_area - v_inaccessible_area, 0);

  return pg_catalog.jsonb_build_object(
    'campaign_zone_id', p_campaign_zone_id, 'campaign_id', v_campaign_id, 'calculation_status', 'ready',
    'total_area_m2', pg_catalog.round(v_total_area, 2), 'gps_area_m2', pg_catalog.round(v_gps_area, 2),
    'manual_area_m2', pg_catalog.round(v_manual_area, 2), 'inaccessible_area_m2', pg_catalog.round(v_inaccessible_area, 2),
    'gps_coverage_pct', case when v_total_area > 0 then least(greatest(round((v_gps_area / v_total_area) * 100, 2), 0), 100) else 0 end,
    'manual_coverage_pct', case when v_total_area > 0 then least(greatest(round((v_manual_area / v_total_area) * 100, 2), 0), 100) else 0 end,
    'inaccessible_area_pct', case when v_total_area > 0 then least(greatest(round((v_inaccessible_area / v_total_area) * 100, 2), 0), 100) else 0 end,
    'final_operational_coverage_pct', case when v_effective_total_area > 0 then least(greatest(round((v_effective_area / v_effective_total_area) * 100, 2), 0), 100) else 0 end
  );
exception when others then
  return pg_catalog.jsonb_build_object(
    'campaign_zone_id', p_campaign_zone_id, 'calculation_status', 'calculation_failed', 'reason_not_calculable', SQLERRM
  );
end;
$function$;

commit;
