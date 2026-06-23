import { useState, useEffect } from 'react';
import { fetchSectors, parseSectorsGeoJSON } from '../lib/services/sectors-api.js';

/**
 * Fetches operational sectors for the current map view.
 *
 * Returns:
 *   sectors — Array<{id, numero, name, municipalityCode, geometry}> | null
 *     null  → backend not ready (map shows 'n/d' badge)
 *     []    → backend ready but no sectors in this area (map shows 'n/d' badge)
 *     [...] → sectors to render as micro-zone polygons
 */
export function useSectors(lat, lng, radiusKm, serviceType) {
  const [sectors, setSectors] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  // Round to 3 decimal places (~100 m) so geocoder micro-precision doesn't cause
  // redundant re-fetches when the same city is re-selected.
  const latR = lat      != null ? Math.round(lat      * 1000) / 1000 : null;
  const lngR = lng      != null ? Math.round(lng      * 1000) / 1000 : null;
  const radR = radiusKm != null ? Math.round(radiusKm * 10)  / 10   : null;

  useEffect(() => {
    if (!latR || !lngR || !serviceType) return;
    
    const controller = new AbortController();
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      setSectors(null);
      try {
        const raw = await fetchSectors({
          serviceType,
          centerLat: latR,
          centerLng: lngR,
          radiusKm:  radR ?? 5,
          signal: controller.signal
        });
        if (!cancelled) {
          // null  → RPC not available (table missing) → show 'n/d'
          // []    → RPC ok, no sectors in this area   → show 'n/d'
          // [...] → render sector polygons
          setSectors(raw ? parseSectorsGeoJSON(raw) : null);
        }
      } catch (err) {
        if (err.name === 'AbortError') return;
        if (import.meta.env.DEV) console.debug('[useSectors] error:', err?.message);
        if (!cancelled) {
          setError(err?.message ?? 'SECTORS_ERROR');
          setSectors(null); // fallback handled correctly
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [latR, lngR, radR, serviceType]); // eslint-disable-line react-hooks/exhaustive-deps

  return { sectors, loading, error };
}
