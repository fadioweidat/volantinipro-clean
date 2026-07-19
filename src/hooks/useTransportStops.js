import { useEffect, useRef, useState } from 'react';
import { EMPTY_TRANSPORT_STATE, fetchTransportStopsInRadius, makeTransportState } from '../lib/services/transport-api.js';
import { beginLatestRequest, isAbortError } from '../lib/services/request-cancellation.js';

export function useTransportStops(lat, lng, radiusKm, serviceType) {
  const [state, setState] = useState(EMPTY_TRANSPORT_STATE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const latestRequestRef = useRef(0);

  const latR = lat != null ? Math.round(Number(lat) * 10000) / 10000 : null;
  const lngR = lng != null ? Math.round(Number(lng) * 10000) / 10000 : null;
  const radR = radiusKm != null ? Math.round(Number(radiusKm) * 10) / 10 : null;

  useEffect(() => {
    if (serviceType !== 'h2h') {
      latestRequestRef.current += 1;
      setState(EMPTY_TRANSPORT_STATE);
      setLoading(false);
      setError(null);
      return undefined;
    }

    if (!Number.isFinite(latR) || !Number.isFinite(lngR) || !Number.isFinite(radR)) {
      latestRequestRef.current += 1;
      setState(EMPTY_TRANSPORT_STATE);
      setLoading(false);
      setError(null);
      return undefined;
    }

    const request = beginLatestRequest(latestRequestRef);

    (async () => {
      setLoading(true);
      setError(null);
      setState(EMPTY_TRANSPORT_STATE);
      try {
        const result = await fetchTransportStopsInRadius({
          centerLat: latR,
          centerLng: lngR,
          radiusKm: radR,
        }, { signal: request.signal });
        if (request.isCurrent() && !request.signal.aborted) setState(makeTransportState(result.rows));
      } catch (err) {
        if (isAbortError(err) || request.signal.aborted) return;
        if (import.meta.env.DEV) console.debug('[useTransportStops] error:', err?.message);
        if (request.isCurrent()) {
          setError(err?.message || 'TRANSPORT_ERROR');
          setState(EMPTY_TRANSPORT_STATE);
        }
      } finally {
        if (request.isCurrent() && !request.signal.aborted) setLoading(false);
      }
    })();

    return () => { request.controller.abort(); };
  }, [latR, lngR, radR, serviceType]);

  return { transportState: state, loading, error };
}
