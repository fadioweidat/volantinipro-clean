import { useState, useEffect } from 'react';
import { fetchDemographicIndicators } from '../lib/services/demographic-indicators';

/**
 * Fetches demographic age distribution from public.demographic_indicators.
 * Returns null values (not estimates) if the municipality code is unavailable
 * or if the table has no matching row.
 *
 * @param {{ geographyRef: string|null, year?: number }|null} params
 * @returns {{ data: import('../lib/services/demographic-indicators').DemographicIndicators|null, loading: boolean, error: string|null }}
 */
export function useDemographicIndicators(params) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const geographyRef = params?.geographyRef ?? null;
  const year = params?.year;

  useEffect(() => {
    if (!geographyRef) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError(null);

      try {
        const result = await fetchDemographicIndicators({ geographyRef, year });
        if (!cancelled) setData(result);
      } catch (err) {
        if (!cancelled) {
          if (import.meta.env.DEV) {
            console.debug('[useDemographicIndicators] error:', err?.message);
          }
          setError(err?.message || 'DEMOGRAPHICS_FETCH_ERROR');
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => { cancelled = true; };
  }, [geographyRef, year]);

  return { data, loading, error };
}
