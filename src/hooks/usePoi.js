import { useState, useEffect, useRef } from 'react';
import { fetchPois } from '../lib/services/poi-api.js';

// In-module cache: keyed by "lat,lng,radiusKm,svcType".
// Survives re-renders within the session; cleared on page reload.
const _cache = {};

/**
 * Fetches real POI from Overpass for the current map view.
 * Debounced 700ms after input changes. Uses in-memory cache.
 *
 * Returns:
 *   pois — Array<{id, lat, lng, name, category, color, priority, address}>
 *   loading — bool
 *   error   — string | null  (OVERPASS_TIMEOUT | network error)
 */
export function usePoi(lat, lng, radiusKm, serviceType, targetSelection = []) {
  const [pois,    setPois]    = useState([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  // Stable rounded key avoids micro-precision re-fetches from geocoder
  const latR = lat    != null ? Math.round(lat    * 1000) / 1000 : null;
  const lngR = lng    != null ? Math.round(lng    * 1000) / 1000 : null;
  const radR = radiusKm != null ? Math.round(Number(radiusKm) * 10) / 10 : null;
  const targetKey = Array.isArray(targetSelection)
    ? [...targetSelection].filter(Boolean).sort().join('|')
    : String(targetSelection || '');

  useEffect(() => {
    if (!latR || !lngR || !serviceType || !['d2d', 'h2h', 'b2b'].includes(serviceType)) {
      setPois([]);
      setLoading(false);
      setError(null);
      return undefined;
    }

    const cacheKey = `${latR},${lngR},${radR},${serviceType},${targetKey}`;

    if (_cache[cacheKey]) {
      setPois(_cache[cacheKey]);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    let timerId;

    // Mostra subito lo stato di caricamento durante il debounce: in questo
    // intervallo non deve sembrare che i risultati provvisori siano definitivi.
    setLoading(true);
    setError(null);

    timerId = setTimeout(async () => {
      if (cancelled) return;
      setPois([]);

      try {
        const result = await fetchPois({
          centerLat:   latR,
          centerLng:   lngR,
          radiusKm:    radR ?? 5,
          serviceType,
          targetSelection: targetKey ? targetKey.split('|') : [],
        });
        if (!cancelled) {
          _cache[cacheKey] = result;
          setPois(result);
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err?.message ?? 'POI_ERROR';
          setError(msg);
          // Keep existing pois on timeout so map doesn't go blank
          if (msg !== 'OVERPASS_TIMEOUT') setPois([]);
          if (import.meta.env.DEV) console.debug('[usePoi] error:', msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 700);

    return () => {
      cancelled = true;
      clearTimeout(timerId);
    };
  }, [latR, lngR, radR, serviceType, targetKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return { pois, loading, error };
}
