-- FIX AUTOSAVE — salvataggio ATOMICO della copertura automatica.
--
-- CAUSA (confermata dal DB reale, campagna 7406e420-9999-409c-88a9-e15a81353e35):
-- il frontend salvava le 2474 vie automatiche con 2474 chiamate RPC
-- admin_create_coverage_adjustment sequenziali. Ogni chiamata e' una
-- transazione a se': un singolo fallimento (geometria degenere, timeout,
-- blip di rete, ricarica dell'auto-refresh) interrompeva il loop lasciando
-- committato solo il sottoinsieme gia' inserito (62 righe / 9.09 km su
-- 2474 / 257.17 km).
--
-- SOLUZIONE: una sola RPC batch. Valida/filtra le LineString PRIMA del
-- commit, poi inserisce TUTTE le valide in una singola statement
-- (INSERT ... SELECT unnest) dentro un'unica transazione: o tutto o niente.
-- Restituisce { received, inserted, discarded, discarded_indexes }.
--
-- Il trigger AFTER INSERT FOR EACH ROW (campaign_coverage_adjustments_sync_zone_cache)
-- ricalcolerebbe la copertura zona per OGNI riga (O(n^2) su un batch grande
-- -> timeout). NON viene disabilitato fisicamente (ALTER TABLE DISABLE
-- TRIGGER interferirebbe con le transazioni concorrenti): la sua function
-- ora legge un flag TRANSAZIONE-LOCALE (app.coverage_batch_mode) e, quando
-- attivo, salta il ricalcolo per-riga. Il flag e' LOCAL: sparisce
-- automaticamente a commit/rollback e non e' visibile ad altre sessioni.
-- La RPC batch sincronizza la cache UNA volta per ogni zona toccata.
--
-- NON tocca calculate_campaign_final_coverage (semantica % invariata).
-- NON tocca gps_tracking_points / delivery_sessions / Driver / Auth.

begin;

-- ---------------------------------------------------------------------------
-- 1. Trigger di sync: guardia batch transazione-locale (nessun DISABLE fisico)
-- ---------------------------------------------------------------------------
create or replace function public.campaign_coverage_adjustments_sync_trigger()
returns trigger
  language plpgsql security definer set search_path to ''
as $function$
begin
  -- Modalita' batch: la RPC admin_create_coverage_adjustments_batch imposta
  -- app.coverage_batch_mode='1' come SET LOCAL. Solo dentro QUELLA
  -- transazione il ricalcolo per-riga viene saltato; la RPC batch chiama
  -- sync_campaign_zone_progress_cache una volta per zona alla fine. Ogni
  -- altra transazione concorrente (es. admin_create_coverage_adjustment
  -- singola) NON ha il flag -> comportamento normale del trigger.
  -- current_setting(..., true): missing_ok -> NULL se mai impostato.
  if pg_catalog.current_setting('app.coverage_batch_mode', true) = '1' then
    return new;
  end if;
  if new.zone_id is not null then
    perform public.sync_campaign_zone_progress_cache(new.zone_id, pg_catalog.coalesce(new.updated_by, new.created_by));
  end if;
  return new;
end;
$function$;
alter function public.campaign_coverage_adjustments_sync_trigger() owner to postgres;

-- ---------------------------------------------------------------------------
-- 2. RPC batch atomica
-- ---------------------------------------------------------------------------
create or replace function public.admin_create_coverage_adjustments_batch(
  p_campaign_id uuid,
  p_lines jsonb,                                   -- [{ "geometry": <GeoJSON LineString/MultiLineString>, "zone_id": <uuid|null> }, ...]
  p_reason text,
  p_source text default 'automatic_verified',
  p_line_buffer_m numeric default 12,
  p_notes text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_adjustment_type text default 'manual_covered'
) returns jsonb
  language plpgsql security definer set search_path to ''
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
  -- 2.1) Gate admin (identico alle RPC esistenti).
  if not public.gps_is_admin() then
    raise exception 'ADMIN_NON_AUTORIZZATO' using errcode = '42501';
  end if;

  -- 2.2) Validazioni scalari (fail-fast, nessuna riga scritta).
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
  if p_lines is null or pg_catalog.jsonb_typeof(p_lines) <> 'array' then
    raise exception 'LINES_PAYLOAD_NON_VALIDO' using errcode = '22023';
  end if;
  if not exists (select 1 from public.campaigns where id = p_campaign_id) then
    raise exception 'CAMPAGNA_NON_TROVATA' using errcode = 'P0002';
  end if;

  v_campaign_zone_ids := array(
    select id from public.campaign_zones where campaign_id = p_campaign_id
  );

  -- 2.3) VALIDA / FILTRA ogni linea PRIMA di qualunque INSERT.
  for v_elem in select * from pg_catalog.jsonb_array_elements(p_lines)
  loop
    v_idx := v_idx + 1;
    v_received := v_received + 1;

    v_geo := v_elem -> 'geometry';
    v_zone_txt := nullif(btrim(coalesce(v_elem ->> 'zone_id', '')), '');
    v_zone := case when v_zone_txt is null then null else v_zone_txt::uuid end;

    -- zone_id non nulla deve appartenere alla campagna: errore duro
    -- (bug del chiamante), nessuna riga scritta.
    if v_zone is not null and not (v_zone = any(v_campaign_zone_ids)) then
      raise exception 'ZONA_NON_APPARTIENE_ALLA_CAMPAGNA (indice %)', v_idx using errcode = '22023';
    end if;

    if v_geo is null then
      v_discarded := v_discarded + 1;
      v_discarded_idx := pg_catalog.array_append(v_discarded_idx, v_idx);
      continue;
    end if;

    begin
      v_geom := public.ST_MakeValid(public.ST_SetSRID(public.ST_GeomFromGeoJSON(v_geo::text), 4326));
    exception when others then
      v_geom := null;
    end;

    if v_geom is null or public.ST_IsEmpty(v_geom) then
      v_discarded := v_discarded + 1;
      v_discarded_idx := pg_catalog.array_append(v_discarded_idx, v_idx);
      continue;
    end if;

    v_gtype := public.GeometryType(v_geom);
    if v_gtype not in ('LINESTRING', 'MULTILINESTRING') or public.ST_NPoints(v_geom) < 2 then
      v_discarded := v_discarded + 1;
      v_discarded_idx := pg_catalog.array_append(v_discarded_idx, v_idx);
      continue;
    end if;

    v_valid_geoms := pg_catalog.array_append(v_valid_geoms, v_geom);
    v_valid_zones := pg_catalog.array_append(v_valid_zones, v_zone);
  end loop;

  if pg_catalog.array_length(v_valid_geoms, 1) is null then
    raise exception 'NESSUNA_GEOMETRIA_VALIDA: % linee ricevute, tutte scartate', v_received using errcode = '22023';
  end if;

  -- 2.4) Flag TRANSAZIONE-LOCALE letto dal trigger di sync: durante il batch
  -- il ricalcolo per-riga della cache zona viene saltato. LOCAL (3o arg true)
  -- -> valido solo per questa transazione, sparisce a commit/rollback, non
  -- visibile ad altre sessioni. NIENTE ALTER TABLE DISABLE TRIGGER.
  perform pg_catalog.set_config('app.coverage_batch_mode', '1', true);

  -- 2.5) INSERT ATOMICO: tutte le righe valide in UNA statement. Se anche una
  -- sola viola un vincolo, l'intera statement (e la transazione) fallisce ->
  -- ZERO righe persistite. Il _log e' scritto nella stessa transazione.
  with ins as (
    insert into public.campaign_coverage_adjustments
      (campaign_id, zone_id, adjustment_type, geometry, reason, notes, metadata, created_by,
       source, line_buffer_m, verified_at, verified_by)
    select p_campaign_id, t.z, p_adjustment_type, t.g, v_reason, v_notes, v_meta, v_uid,
           p_source, v_buffer, now(), v_uid
    from pg_catalog.unnest(v_valid_geoms, v_valid_zones) as t(g, z)
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
  select pg_catalog.count(*)::int into v_inserted from ins;

  -- 2.6) Fine modalita' batch per il resto della transazione (le sync qui
  -- sotto non passano dal trigger, ma cosi' ogni scrittura successiva nella
  -- stessa txn torna al comportamento normale).
  perform pg_catalog.set_config('app.coverage_batch_mode', '', true);

  -- 2.7) Sync cache zona UNA volta per zona realmente toccata.
  for v_z in select distinct z from pg_catalog.unnest(v_valid_zones) as z where z is not null
  loop
    perform public.sync_campaign_zone_progress_cache(v_z, v_uid);
  end loop;

  return pg_catalog.jsonb_build_object(
    'campaign_id', p_campaign_id,
    'source', p_source,
    'adjustment_type', p_adjustment_type,
    'line_buffer_m', v_buffer,
    'received', v_received,
    'inserted', v_inserted,
    'discarded', v_discarded,
    'discarded_indexes', pg_catalog.to_jsonb(v_discarded_idx)
  );
end;
$function$;

-- Timeout esteso a livello di FUNZIONE (applicato all'ingresso, ripristinato
-- all'uscita): non dipende dal solo set_config nel body. NB: un gateway HTTP
-- (Kong/PostgREST, tipicamente ~60s) puo' comunque chiudere la richiesta
-- prima -> in quel caso la transazione fallisce/rollback e il frontend
-- mantiene il draft (nessun partial commit). Vedi report per i limiti reali.
alter function public.admin_create_coverage_adjustments_batch(uuid, jsonb, text, text, numeric, text, jsonb, text)
  set statement_timeout = '300s';

alter function public.admin_create_coverage_adjustments_batch(uuid, jsonb, text, text, numeric, text, jsonb, text) owner to postgres;
revoke all on function public.admin_create_coverage_adjustments_batch(uuid, jsonb, text, text, numeric, text, jsonb, text) from public;
grant execute on function public.admin_create_coverage_adjustments_batch(uuid, jsonb, text, text, numeric, text, jsonb, text) to authenticated, service_role;

commit;
