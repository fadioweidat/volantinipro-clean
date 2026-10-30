-- Tracking GPS e foto visibili al Cliente solo se la campagna ha l'extra.
-- Cambiano SOLO i rami "proprietario della campagna" delle letture: Admin,
-- operatori, Driver e Traccar restano identici e nessuna scrittura cambia.
-- Le foto delle segnalazioni hanno una policy propria e restano visibili.
-- Ripristino: db-backups/2026-10-30-paid-extras/rollback.sql

-- Stessi elenchi di src/lib/campaignEntitlements.js.
create or replace function public.campaign_metadata_has_extra(p_metadata jsonb, p_kind text)
returns boolean
language sql immutable parallel safe
set search_path to ''
as $function$
  with keys as (
    select pg_catalog.lower(pg_catalog.btrim(s.k)) as k
    from (
      select v #>> '{}' as k
      from pg_catalog.jsonb_array_elements(case when pg_catalog.jsonb_typeof(p_metadata->'extra_services') = 'array' then p_metadata->'extra_services' else '[]'::jsonb end) v
      where pg_catalog.jsonb_typeof(v) = 'string'
      union all
      select v #>> '{}'
      from pg_catalog.jsonb_array_elements(case when pg_catalog.jsonb_typeof(p_metadata#>'{quote_summary,business,proofs}') = 'array' then p_metadata#>'{quote_summary,business,proofs}' else '[]'::jsonb end) v
      where pg_catalog.jsonb_typeof(v) = 'string'
      union all
      select case when pg_catalog.jsonb_typeof(v) = 'string' then v #>> '{}' else v->>'id' end
      from pg_catalog.jsonb_array_elements(case when pg_catalog.jsonb_typeof(p_metadata->'servizi_extra') = 'array' then p_metadata->'servizi_extra' else '[]'::jsonb end) v
      union all
      select v->>'label'
      from pg_catalog.jsonb_array_elements(case when pg_catalog.jsonb_typeof(p_metadata->'servizi_extra') = 'array' then p_metadata->'servizi_extra' else '[]'::jsonb end) v
      where pg_catalog.jsonb_typeof(v) = 'object'
    ) s
    where s.k is not null
  )
  select exists (
    select 1 from keys
    where keys.k = any (case p_kind
      when 'gps' then array['tracking_gps', 'gps', 'gps_default', 'gps_plus_report', 'control_pro', 'control_pro_99', 'tracking gps', 'tracking gps live', 'gps + report finale', 'controllo pro']
      when 'photos' then array['photo_proof', 'foto', 'foto_localizzate', 'photo_report_advanced', 'control_pro', 'control_pro_99', 'foto proof', 'foto proof base', 'report fotografico', 'report fotografico completo', 'controllo pro', 'foto geolocalizzate']
      else array[]::text[] end)
  );
$function$;

-- Colonne calcolate: le policy leggono un booleano invece di scorrere il
-- metadata (decine di KB) su ogni punto GPS.
alter table public.campaigns
  add column has_gps_extra boolean generated always as (public.campaign_metadata_has_extra(metadata, 'gps')) stored,
  add column has_photo_extra boolean generated always as (public.campaign_metadata_has_extra(metadata, 'photos')) stored;

create or replace function public.current_user_has_campaign_extra(p_campaign_id uuid, p_kind text)
returns boolean
language sql stable security definer
set search_path to ''
as $function$
  select exists (
    select 1 from public.campaigns c
    where c.id = p_campaign_id
      and c.user_id = (select auth.uid())
      and case p_kind when 'gps' then c.has_gps_extra when 'photos' then c.has_photo_extra else false end
  );
$function$;
revoke execute on function public.campaign_metadata_has_extra(jsonb, text) from public, anon;
revoke execute on function public.current_user_has_campaign_extra(uuid, text) from public, anon;
grant execute on function public.campaign_metadata_has_extra(jsonb, text) to authenticated, service_role;
grant execute on function public.current_user_has_campaign_extra(uuid, text) to authenticated, service_role;

drop policy "gps_tracking_points_select_authorized" on public.gps_tracking_points;
create policy "gps_tracking_points_select_authorized" on public.gps_tracking_points for select to authenticated using (
  public.gps_is_admin()
  or public.current_user_has_campaign_extra(gps_tracking_points.campaign_id, 'gps')
  or exists (
    select 1 from public.delivery_sessions s
    where s.id = gps_tracking_points.session_id and s.campaign_id = gps_tracking_points.campaign_id
      and s.driver_id = auth.uid() and s.assignment_id is not null
      and public.gps_assignment_is_valid(s.assignment_id, s.driver_id, s.campaign_id, s.group_id, now())
  )
);
drop policy "gps_tracking_points_select_policy" on public.gps_tracking_points;
create policy "gps_tracking_points_select_policy" on public.gps_tracking_points for select to authenticated using (
  public.jwt_is_admin() or driver_id = auth.uid() or public.current_user_has_campaign_extra(campaign_id, 'gps')
);

drop policy "proof_photos_select_authorized" on public.proof_photos;
create policy "proof_photos_select_authorized" on public.proof_photos for select to authenticated using (
  public.gps_is_admin()
  or (approved_at is not null and public.current_user_has_campaign_extra(proof_photos.campaign_id, 'photos'))
  or exists (
    select 1 from public.delivery_sessions s
    where s.id = proof_photos.session_id and s.campaign_id = proof_photos.campaign_id
      and s.driver_id = auth.uid() and s.assignment_id is not null
      and public.gps_assignment_is_valid(s.assignment_id, s.driver_id, s.campaign_id, s.group_id, now())
  )
);
drop policy "proof_photos_select_policy" on public.proof_photos;
create policy "proof_photos_select_policy" on public.proof_photos for select to authenticated using (
  public.jwt_is_admin() or driver_id = auth.uid() or public.current_user_has_campaign_extra(campaign_id, 'photos')
);

drop policy "proof_photos_storage_select_authorized" on storage.objects;
create policy "proof_photos_storage_select_authorized" on storage.objects for select to authenticated using (
  bucket_id = 'proof-photos'
  and (
    public.gps_is_admin()
    or exists (
      select 1 from public.campaigns c
      where c.id::text = split_part(objects.name, '/', 2) and c.user_id = auth.uid() and c.has_photo_extra
    )
    or exists (
      select 1 from public.delivery_sessions s
      where s.campaign_id::text = split_part(objects.name, '/', 2) and s.id::text = split_part(objects.name, '/', 4)
        and s.driver_id = auth.uid() and s.assignment_id is not null
        and public.gps_assignment_is_valid(s.assignment_id, s.driver_id, s.campaign_id, s.group_id, now())
    )
  )
);

drop policy "campaign_coverage_adjustments_select_customer" on public.campaign_coverage_adjustments;
create policy "campaign_coverage_adjustments_select_customer" on public.campaign_coverage_adjustments for select to authenticated using (
  revoked_at is null and public.current_user_has_campaign_extra(campaign_coverage_adjustments.campaign_id, 'gps')
);

-- La percentuale resta per tutti, la geometria solo con Tracking GPS.
CREATE OR REPLACE FUNCTION public.calculate_campaign_final_coverage(p_campaign_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
        and (v_is_admin or public.current_user_has_campaign_extra(p_campaign_id, 'gps'))
      then public.ST_AsGeoJSON(public.ST_SnapToGrid(v_effective_covered_geom, 0.000001))::jsonb
      else null end
  );
end;
$function$;

-- Approvazione di un extra aggiunto dopo l'invio.
CREATE OR REPLACE FUNCTION public.admin_decide_modification_request(p_request_id uuid, p_decision text, p_admin_note text DEFAULT NULL::text)
 RETURNS campaign_modification_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_req public.campaign_modification_requests%rowtype;
  v_conv_id uuid;
  v_extra_id text;
begin
  if not public.gps_is_admin() then raise exception 'ADMIN_NON_AUTORIZZATO' using errcode = '42501'; end if;
  if p_decision not in ('approved', 'rejected', 'applied', 'cancelled') then
    raise exception 'DECISIONE_NON_VALIDA' using errcode = '22023';
  end if;
  update public.campaign_modification_requests
    set status = p_decision, admin_note = nullif(btrim(p_admin_note), ''), decided_by = v_uid, decided_at = now()
    where id = p_request_id
    returning * into v_req;
  if not found then raise exception 'RICHIESTA_NON_TROVATA' using errcode = 'P0002'; end if;
  -- Extra aggiunto dopo l'invio: l'Admin approva e il servizio si attiva.
  -- Nessun effetto su prezzo o pagamento: l'incasso resta manuale.
  v_extra_id := v_req.requested_value->>'extra_id';
  if v_req.type = 'extra' and p_decision in ('approved', 'applied')
     and v_extra_id in ('tracking_gps', 'photo_report_advanced', 'control_pro') then
    update public.campaigns c
      set metadata = pg_catalog.jsonb_set(
        pg_catalog.jsonb_set(
          coalesce(c.metadata, '{}'::jsonb),
          '{extra_services}',
          case when pg_catalog.jsonb_typeof(c.metadata->'extra_services') = 'array'
            then c.metadata->'extra_services' else '[]'::jsonb end
            || pg_catalog.to_jsonb(v_extra_id)
        ),
        '{extras_activated}',
        case when pg_catalog.jsonb_typeof(c.metadata->'extras_activated') = 'array'
          then c.metadata->'extras_activated' else '[]'::jsonb end
          || pg_catalog.jsonb_build_object('id', v_extra_id, 'request_id', v_req.id, 'activated_at', now(), 'activated_by', v_uid,
            'price', v_req.requested_value->'price')
      )
      where c.id = v_req.campaign_id
        and not (coalesce(c.metadata->'extra_services', '[]'::jsonb) ? v_extra_id);
  end if;
  -- Notifica in-app al Cliente nella conversazione della campagna — mai un
  -- aggiornamento automatico del prezzo/pagamento, solo comunicazione dello
  -- stato (il pricing reale passa dal flusso Admin/pricing esistente).
  -- get-or-create: la conversazione potrebbe non esistere ancora se il
  -- Cliente non ha mai scritto (la richiesta di modifica stessa arriva
  -- sempre da customer_create_modification_request, che la crea, ma
  -- resta un fallback difensivo per dati storici).
  v_conv_id := public.hub_get_or_create_customer_conversation(v_req.campaign_id, v_req.customer_id);
  perform public.admin_send_message(
    v_conv_id,
    'La tua richiesta di modifica (' || v_req.type || ') e'' stata aggiornata: ' || p_decision
      || coalesce(' — ' || p_admin_note, ''),
    null, v_req.id
  );
  return v_req;
end;
$function$;
