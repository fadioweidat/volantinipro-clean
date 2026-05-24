import { useEffect, useState } from 'react';
import { EMPTY_TRANSPORT_STATE, fetchTransportStopsInRadius, makeTransportState } from '../lib/services/transport-api.js';

export function useTransportStops(lat, lng, radiusKm, serviceType) {
  const [state, setState] = useState(EMPTY_TRANSPORT_STATE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const latR = lat != null ? Math.round(Number(lat) * 10000) / 10000 : null;
  const lngR = lng != null ? Math.round(Number(lng) * 10000) / 10000 : null;
  const radR = radiusKm != null ? Math.round(Number(radiusKm) * 10) / 10 : null;

  useEffect(() => {
    if (serviceType !== 'h2h') {
      setState(EMPTY_TRANSPORT_STATE);
      setLoading(false);
      setError(null);
      return undefined;
    }

    if (!Number.isFinite(latR) || !Number.isFinite(lngR) || !Number.isFinite(radR)) {
      setState(EMPTY_TRANSPORT_STATE);
      setLoading(false);
      setError(null);
      return undefined;
    }

    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      setState(EMPTY_TRANSPORT_STATE);
      try {
        const result = await fetchTransportStopsInRadius({
          centerLat: latR,
          centerLng: lngR,
          radiusKm: radR,
        });
        if (!cancelled) setState(makeTransportState(result.rows));
      } catch (err) {
        if (import.meta.env.DEV) console.debug('[useTransportStops] error:', err?.message);
        if (!cancelled) {
          setError(err?.message || 'TRANSPORT_ERROR');
          setState(EMPTY_TRANSPORT_STATE);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [latR, lngR, radR, serviceType]);

  return { transportState: state, loading, error };
}
