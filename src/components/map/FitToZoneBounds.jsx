import { useEffect } from 'react';
import L from 'leaflet';
import { useMap } from 'react-leaflet';

// Estratto da GpsMonitor.jsx (dove risolveva lo stesso identico bug per la
// mappa GPS REALE) — riusato qui invece di duplicato, per ZoneCoverageMap.jsx
// (AUTOMATICO ADMIN) e CoverageAdjustmentPanel.jsx (MANUALE ADMIN).
//
// Il "center" di MapContainer fissa solo la posizione INIZIALE al mount. Se
// il confine reale arriva dopo (resa asincrona di resolveMunicipalityBoundary,
// piu' lenta del caricamento dei punti GPS gia' presenti), la mappa gia'
// montata sul fallback (GPS Driver o Milano) non si sposta da sola: serve un
// fitBounds esplicito che si ri-applica ogni volta che la geometria cambia o
// arriva, non solo al mount.
export function FitToZoneBounds({ geometry }) {
  const map = useMap();
  useEffect(() => {
    if (!geometry) return;
    try {
      const bounds = L.geoJSON(geometry).getBounds();
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [24, 24] });
    } catch {
      // geometria non valida per Leaflet: la mappa resta dov'e', nessun crash.
    }
  }, [geometry, map]);
  return null;
}
