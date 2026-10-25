import { useEffect, useMemo, useRef, useState } from 'react';
import { resolveMunicipalityBoundary } from '../lib/geo/resolveMunicipalityBoundary.js';
import { radiusZoneFromRow } from '../lib/geofence/geofenceEngine.js';
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
// Zone a raggio (campaign_zones.radius_m) senza poligono e senza un comune
// riconoscibile nel nome: il cerchio NON e' inventato, e' la definizione
// salvata della zona (stesso dato che la Driver App riceve come
// territory_type 'radius'). Lo esponiamo in radiusZones solo dopo che la
// ricerca del confine e' fallita, cosi' le zone con un comune nel nome
// continuano a mostrare il confine del comune come oggi.
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
  const [unresolvedZoneIds, setUnresolvedZoneIds] = useState(() => new Set());
  const persistedZoneIdsRef = useRef(new Set());

  useEffect(() => {
    let cancelled = false;
    // Reset SEMPRE al cambio campagna: nessun residuo di zone/confini della
    // campagna precedente. Senza questo, resolvedBoundaries si accumulava fra
    // campagne/zone e una geometria stale (es. Milano di una campagna vista
    // prima) contaminava la vista corrente — root cause del bug
    // "header Bergamo, mappa Milano".
    setZoneRows([]);
    setResolvedBoundaries({});
    persistedZoneIdsRef.current = new Set();
    setUnresolvedZoneIds(new Set());
    if (!campaignId || !supabase) {
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
      .select('id, zone_name, center_lat, center_lng, radius_m, polygon_geojson, priority')
      .eq('campaign_id', campaignId)
      .order('priority', { ascending: true, nullsFirst: false })
      .order('zone_name', { ascending: true })
      .then(({ data }) => {
        if (cancelled) return;
        const rows = data || [];
        setZoneRows(rows);
        // PRIORITÀ A del ticket "Bergamo→Milano": il confine reale
        // campaign_zones.polygon_geojson (persistito) va usato SUBITO, senza
        // attendere Nominatim. resolveMunicipalityBoundary (priorità C) resta
        // solo per le zone che nel DB non hanno ancora un poligono.
        const seeded = {};
        for (const zone of rows) {
          const g = zone.polygon_geojson;
          if (g && typeof g === 'object' && g.type && Array.isArray(g.coordinates)) {
            seeded[zone.id] = g;
          }
        }
        if (Object.keys(seeded).length) {
          setResolvedBoundaries((prev) => ({ ...prev, ...seeded }));
        }
        const unnamed = rows.filter((zone) => !zone.zone_name && !seeded[zone.id]).map((zone) => zone.id);
        if (unnamed.length) setUnresolvedZoneIds(new Set(unnamed));
      });
    return () => { cancelled = true; };
  }, [campaignId]);

  useEffect(() => {
    let cancelled = false;
    const zonesNeedingBoundary = zoneRows.filter((zone) => zone.zone_name && !resolvedBoundaries[zone.id])
      .filter((zone) => !unresolvedZoneIds.has(zone.id));
    const markUnresolved = (zoneId) => setUnresolvedZoneIds((prev) => (prev.has(zoneId) ? prev : new Set(prev).add(zoneId)));
    zonesNeedingBoundary.forEach((zone) => {
      resolveMunicipalityBoundary(zone.zone_name, { lat: zone.center_lat, lng: zone.center_lng })
        .then((geometry) => {
          if (cancelled) return;
          if (!geometry) { markUnresolved(zone.id); return; }
          setResolvedBoundaries((prev) => ({ ...prev, [zone.id]: geometry }));
          if (!zone.polygon_geojson && supabase && !persistedZoneIdsRef.current.has(zone.id)) {
            persistedZoneIdsRef.current.add(zone.id);
            supabase.from('campaign_zones').update({ polygon_geojson: geometry }).eq('id', zone.id)
              .then(({ error }) => { if (error) console.warn('[ZONE_BOUNDARY_PERSIST_FAILED]', { zoneId: zone.id, message: error.message }); });
          }
        })
        .catch(() => {
          // Nominatim/analysis-istat non disponibili: nessun confine mostrato,
          // mai un cerchio o un centro inventato al loro posto (solo il raggio
          // salvato della zona, se c'e', via radiusZones).
          if (!cancelled) markUnresolved(zone.id);
        });
    });
    return () => { cancelled = true; };
  }, [zoneRows, resolvedBoundaries, unresolvedZoneIds]);

  // Memo: identita' stabile, altrimenti la mappa si ricentrerebbe a ogni render.
  const radiusZones = useMemo(() => zoneRows
    .filter((zone) => !resolvedBoundaries[zone.id] && unresolvedZoneIds.has(zone.id))
    .map(radiusZoneFromRow)
    .filter(Boolean), [zoneRows, resolvedBoundaries, unresolvedZoneIds]);

  return { zoneRows, resolvedBoundaries, radiusZones };
}
