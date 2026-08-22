-- ============================================================
-- CAUSA: gps_get_operator_campaign() (RPC gia' esistente, unica fonte dati
-- campagna per il Driver) non restituisce alcuna geometria di zona — solo
-- campi scalari della campagna. Di conseguenza normalizeZonesFromCampaign()
-- lato client (gia' esistente, usata sia dal geofence "ufficiale" in
-- useGpsTracking sia dalla nuova mappa compatta Driver) riceve sempre un
-- oggetto senza zone, indipendentemente dai dati realmente presenti in
-- public.campaign_zones. RLS su campaigns/campaign_zones (invariata: nessuna
-- policy toccata da questa migration) permette la lettura solo al
-- proprietario campagna o ad Admin — mai all'operatore assegnato — quindi
-- il Driver non ha ALCUN percorso di lettura diretto verso quelle tabelle.
--
-- FIX MINIMO: CREATE OR REPLACE sulla stessa funzione SECURITY DEFINER gia'
-- esistente (nessuna nuova tabella, nessuna nuova policy RLS, nessun nuovo
-- grant: la funzione ha gia' pieno accesso interno a campaign_zones tramite
-- il suo stesso SECURITY DEFINER). Aggiunge un solo campo 'campaign_zones'
-- con i nomi di campo che normalizeZonesFromCampaign() gia' si aspetta
-- (geometry_geojson, radius_km, center_lat, center_lng) cosi' il codice
-- client esistente funziona senza alcuna modifica: radius_m -> radius_km
-- (divisione per 1000), polygon_geojson -> geometry_geojson, invariati per
-- il resto. Ambito ristretto esattamente com'era: solo la campagna con
-- assegnazione attiva e valida dell'operatore autenticato.
-- ============================================================

create or replace function public.gps_get_operator_campaign(p_campaign_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
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
    'end_date', c.end_date,
    'campaign_zones', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'zone_name', z.zone_name,
            'center_lat', z.center_lat,
            'center_lng', z.center_lng,
            'radius_km', case when z.radius_m is not null then z.radius_m::numeric / 1000 else null end,
            'geometry_geojson', z.polygon_geojson
          )
          order by z.zone_name
        )
        from public.campaign_zones z
        where z.campaign_id = c.id
      ),
      '[]'::jsonb
    )
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
$function$;
