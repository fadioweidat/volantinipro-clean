import { useEffect, useState } from 'react';
import {
  EMPTY_CIVICI_STATE,
  FALLBACK_CIVICI_STATE,
  fetchAddressPointsInRadius,
  makeCiviciState,
} from '../lib/services/address-points-api.js';

const STABLE_EMPTY_RESULT = { civiciState: EMPTY_CIVICI_STATE, loading: false, error: null };
const civiciCache = new Map();

// Civici are only fetched for D2D and only up to MAX_RADIUS_KM
// (matches the guard in address-points-api.js)
const MAX_RADIUS_KM = 3;

export function useAddressPoints(lat, lng, radiusKm, serviceType = 'd2d') {
  const [state, setState] = useState(EMPTY_CIVICI_STATE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const latR = lat != null ? Math.round(Number(lat) * 10000) / 10000 : null;
  const lngR = lng != null ? Math.round(Number(lng) * 10000) / 10000 : null;
  const radR = radiusKm != null ? Math.round(Number(radiusKm) * 10) / 10 : null;

  const canLoad =
    serviceType === 'd2d' &&
    Number.isFinite(latR) &&
    Number.isFinite(lngR) &&
    Number.isFinite(radR) &&
    radR > 0 &&
    radR <= MAX_RADIUS_KM;

  useEffect(() => {
    if (!canLoad) return undefined;

    const requestKey = `osm_${latR}_${lngR}_${radR}`;

    // Return cached result immediately — includes cached timeouts (FALLBACK) and successes
    if (civiciCache.has(requestKey)) {
      if (import.meta.env.DEV) console.log('[ADDRESS_POINTS_FETCH_SKIPPED_CACHE]', { requestKey });
      setState(civiciCache.get(requestKey));
      setError(null);
      setLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      if (import.meta.env.DEV) console.log('[ADDRESS_POINTS_FETCH_START]', { requestKey });

      try {
        const result = await fetchAddressPointsInRadius({
          centerLat: latR,
          centerLng: lngR,
          radiusKm: radR,
          signal: controller.signal,
        });

        if (!cancelled) {
          // Timeout returned as isTimeout:true — show non-blocking fallback message
          if (result.isTimeout) {
            civiciCache.set(requestKey, FALLBACK_CIVICI_STATE);
            setState(FALLBACK_CIVICI_STATE);
            return;
          }

          const totalCount =
            Number(result?.count || 0) ||
            Number(result?.bboxCount || 0) ||
            Number(result?.totalCount || 0) ||
            Number(result?.contentRangeCount || 0) ||
            0;

          const finalState = makeCiviciState(result.rows, totalCount, {
            bboxCount: result?.bboxCount,
            totalCount: result?.totalCount,
            contentRangeCount: result?.contentRangeCount,
            renderedCount: result?.renderedCount,
          });
          civiciCache.set(requestKey, finalState);
          setState(finalState);
        }
      } catch (err) {
        // AbortError is not an error — happens on unmount or new request
        if (err.name === 'AbortError') {
          if (import.meta.env.DEV) console.log('[ADDRESS_POINTS_FETCH_ABORTED]');
          return;
        }

        console.warn('[ADDRESS_POINTS_ERROR]', err?.message || err);
        if (import.meta.env.DEV) console.debug('[DBG address_points error]', err);

        if (!cancelled) {
          setError(err?.message || 'ADDRESS_POINTS_ERROR');
          civiciCache.set(requestKey, FALLBACK_CIVICI_STATE);
          setState(FALLBACK_CIVICI_STATE);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [canLoad, latR, lngR, radR]);

  if (!canLoad) return STABLE_EMPTY_RESULT;
  return { civiciState: state, loading, error };
}
