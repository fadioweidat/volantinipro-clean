import { useEffect, useState } from 'react';
import { EMPTY_CIVICI_STATE, fetchAddressPointsInRadius, makeCiviciState } from '../lib/services/address-points-api.js';

export function useAddressPoints(lat, lng, radiusKm) {
  const [state, setState] = useState(EMPTY_CIVICI_STATE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const latR = lat != null ? Math.round(Number(lat) * 10000) / 10000 : null;
  const lngR = lng != null ? Math.round(Number(lng) * 10000) / 10000 : null;
  const radR = radiusKm != null ? Math.round(Number(radiusKm) * 10) / 10 : null;

  useEffect(() => {
    if (!Number.isFinite(latR) || !Number.isFinite(lngR) || !Number.isFinite(radR)) {
      setState(EMPTY_CIVICI_STATE);
      setLoading(false);
      setError(null);
      return undefined;
    }

    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      setState(EMPTY_CIVICI_STATE);
      try {
        const result = await fetchAddressPointsInRadius({
          centerLat: latR,
          centerLng: lngR,
          radiusKm: radR,
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
        if (import.meta.env.DEV) console.debug('[useAddressPoints] error:', err?.message);
        if (!cancelled) {
          setError(err?.message || 'ADDRESS_POINTS_ERROR');
          setState(EMPTY_CIVICI_STATE);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [latR, lngR, radR]);

  return { civiciState: state, loading, error };
}
