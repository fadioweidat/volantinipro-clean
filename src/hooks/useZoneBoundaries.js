import { useEffect, useRef, useState } from 'react';
import { resolveMunicipalityBoundary } from '../lib/geo/resolveMunicipalityBoundary.js';
import { supabase } from '../supabaseClient.js';

// Unica fonte condivisa per "confine reale del comune di una zona campagna",
// usata sia da Admin (GpsMonitor.jsx) sia da Cliente (CampaignTracking.jsx).
// Prima di questo hook ciascuna pagina aveva la propria copia quasi identica
// di questa logica (fetch campaign_zones + resolveMunicipalityBoundary +
// persist best-effort su polygon_geojson quando mancante) — esattamente la
// duplicazione che il refactor doveva eliminare, non introdurre una terza
// implementazione diversa per il desktop/cliente.
//
// resolveMunicipalityBoundary e' lo STESSO helper gia' usato dalla Driver App
// (DriverAssignmentPage/DriverWorkMapPage): stesso confine reale, mai un
// cerchio o un centro inventato quando manca il poligono.
//
// Persistenza: un solo UPDATE campaign_zones.polygon_geojson per zona/mount,
// solo se la colonna era vuota (mai sovrascrive), guardato da
// persistedZoneIdsRef. RLS gia' copre entrambi i chiamanti:
// campaign_zones_admin_update (gps_is_admin()) per Admin,
// campaign_zones_own_update (c.user_id = auth.uid()) per il Cliente
// proprietario — nessuna nuova policy necessaria.
export function useZoneBoundaries(campaignId) {
  const [zoneRows, setZoneRows] = useState([]);
  const [resolvedBoundaries, setResolvedBoundaries] = useState({});
  const persistedZoneIdsRef = useRef(new Set());

  useEffect(() => {
    let cancelled = false;
    if (!campaignId || !supabase) {
      setZoneRows([]);
      return undefined;
    }
    // Ordine stabile e significativo (priority, poi zone_name) — senza
    // ORDER BY l'ordine restituito da Postgres e' indefinito. Con piu' zone
    // per campagna (es. Varese/Barasso/Gavirate/...) un ordine arbitrario
    // faceva scegliere una zona diversa a ogni refresh come "prima zona" a
    // chi legge zoneRows[0] — root cause del bug "Live map mostra zona
    // sbagliata" su campagne multi-comune.
    supabase
      .from('campaign_zones')
      .select('id, zone_name, center_lat, center_lng, polygon_geojson, priority')
      .eq('campaign_id', campaignId)
      .order('priority', { ascending: true, nullsFirst: false })
      .order('zone_name', { ascending: true })
      .then(({ data }) => { if (!cancelled) setZoneRows(data || []); });
    return () => { cancelled = true; };
  }, [campaignId]);

  useEffect(() => {
    let cancelled = false;
    const zonesNeedingBoundary = zoneRows.filter((zone) => zone.zone_name && !resolvedBoundaries[zone.id]);
    zonesNeedingBoundary.forEach((zone) => {
      resolveMunicipalityBoundary(zone.zone_name, { lat: zone.center_lat, lng: zone.center_lng })
        .then((geometry) => {
          if (cancelled || !geometry) return;
          setResolvedBoundaries((prev) => ({ ...prev, [zone.id]: geometry }));
          if (!zone.polygon_geojson && supabase && !persistedZoneIdsRef.current.has(zone.id)) {
            persistedZoneIdsRef.current.add(zone.id);
            supabase.from('campaign_zones').update({ polygon_geojson: geometry }).eq('id', zone.id)
              .then(({ error }) => { if (error) console.warn('[ZONE_BOUNDARY_PERSIST_FAILED]', { zoneId: zone.id, message: error.message }); });
          }
        })
        .catch(() => {
          // Nominatim/analysis-istat non disponibili: nessun confine mostrato,
          // mai un cerchio o un centro inventato al loro posto.
        });
    });
    return () => { cancelled = true; };
  }, [zoneRows, resolvedBoundaries]);

  return { zoneRows, resolvedBoundaries };
}
