import { useEffect, useState } from 'react';
import { EMPTY_CIVICI_STATE, FALLBACK_CIVICI_STATE, fetchAddressPointsInRadius, makeCiviciState } from '../lib/services/address-points-api.js';

const STABLE_EMPTY_RESULT = { civiciState: EMPTY_CIVICI_STATE, loading: false, error: null };

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
    radR <= 5;

  useEffect(() => {
    if (!canLoad) return undefined;

    const controller = new AbortController();
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchAddressPointsInRadius({
          centerLat: latR,
          centerLng: lngR,
          radiusKm: radR,
          signal: controller.signal
        });
        const totalCount =
          Number(result?.count || 0) ||
          Number(result?.bboxCount || 0) ||
          Number(result?.totalCount || 0) ||
          Number(result?.contentRangeCount || 0) ||
          0;
        if (!cancelled) {
          setState(makeCiviciState(result.rows, totalCount, {
            bboxCount: result?.bboxCount,
            totalCount: result?.totalCount,
            contentRangeCount: result?.contentRangeCount,
            renderedCount: result?.renderedCount,
          }));
        }
      } catch (err) {
        if (err.name === 'AbortError') return;
        
        console.error("[ADDRESS_POINTS_ERROR]", err, null, null, err?.message || err);
        if (import.meta.env.DEV) console.debug('[DBG address_points error]', err?.message);
        if (!cancelled) {
          setError(err?.message || 'ADDRESS_POINTS_ERROR');
          setState(FALLBACK_CIVICI_STATE); // Graceful fallback
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
