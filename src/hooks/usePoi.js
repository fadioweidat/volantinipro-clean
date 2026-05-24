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
export function usePoi(lat, lng, radiusKm, serviceType) {
  const [pois,    setPois]    = useState([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  // Stable rounded key avoids micro-precision re-fetches from geocoder
  const latR = lat    != null ? Math.round(lat    * 1000) / 1000 : null;
  const lngR = lng    != null ? Math.round(lng    * 1000) / 1000 : null;
  const radR = radiusKm != null ? Math.round(Number(radiusKm) * 10) / 10 : null;

  useEffect(() => {
    if (!latR || !lngR || !serviceType) return;
    // POI only meaningful for these service types (d2d too, but optional)
    if (!['d2d', 'h2h', 'b2b'].includes(serviceType)) return;

    const cacheKey = `${latR},${lngR},${radR},${serviceType}`;

    if (_cache[cacheKey]) {
      setPois(_cache[cacheKey]);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    let timerId;

    timerId = setTimeout(async () => {
      if (cancelled) return;
      setLoading(true);
      setError(null);
      setPois([]);

      try {
        const result = await fetchPois({
          centerLat:   latR,
          centerLng:   lngR,
          radiusKm:    radR ?? 5,
          serviceType,
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
  }, [latR, lngR, radR, serviceType]); // eslint-disable-line react-hooks/exhaustive-deps

  return { pois, loading, error };
}
