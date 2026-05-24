import { useState, useEffect } from 'react';
import { fetchOmiZonesAnalysis } from '../lib/services/omi-analysis';

/**
 * Hook per recuperare i dati OMI da `analysis-omi-zones`.
 * Separato da ISTAT/comuni. Non usare `data` per calcolare
 * famiglie, popolazione, volantini o copertura stimata.
 *
 * @param {{ lat: number|null, lng: number|null, radiusKm: number, year?: number, semester?: number, includeGeometry?: boolean }|null} params
 * @returns {{ data: import('../lib/services/omi-analysis').OmiAnalysisResponse|null, loading: boolean, error: string|null }}
 */
export function useOmiZonesAnalysis(params) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const lat = params?.lat ?? null;
  const lng = params?.lng ?? null;
  const radiusKm = params?.radiusKm ?? null;
  const year = params?.year;
  const semester = params?.semester;
  const includeGeometry = params?.includeGeometry;

  useEffect(() => {
    if (lat == null || lng == null || !radiusKm) return;

    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError(null);

      try {
        const result = await fetchOmiZonesAnalysis({ lat, lng, radiusKm, year, semester, includeGeometry });
        if (!cancelled) setData(result);
      } catch (err) {
        if (!cancelled) {
          if (import.meta.env.DEV) {
            console.debug('[useOmiZonesAnalysis] error:', err?.message);
          }
          setError(err?.message || 'OMI_FETCH_ERROR');
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => { cancelled = true; };
  }, [lat, lng, radiusKm, year, semester, includeGeometry]);

  return { data, loading, error };
}
