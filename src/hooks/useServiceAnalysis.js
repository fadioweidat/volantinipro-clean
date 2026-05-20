import { useState, useEffect } from 'react';

export function useServiceAnalysis(lat, lng, radius, service, municipality = null) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!lat || !lng) return;

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const baseUrl = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_SUPABASE_URL;
        const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
        const endpoint = service === 'd2d' ? 'analysis-istat' : 'analysis-poi-search';
        const explicitUrl = service === 'd2d' ? import.meta.env.VITE_ANALYSIS_ISTAT_URL : import.meta.env.VITE_ANALYSIS_POI_URL;
        const functionUrl = baseUrl ? `${baseUrl}/functions/v1/${endpoint}` : null;
        const apiUrl = explicitUrl || functionUrl;
        if (!apiUrl) {
          setError("ANALYSIS_BACKEND_NOT_CONFIGURED");
          setData({ values: {}, comuni_breakdown: [], metadata: { isEstimated: false }, sources: [], error: "ANALYSIS_BACKEND_NOT_CONFIGURED" });
          return;
        }
        const municipalityParam = municipality ? `&municipality=${encodeURIComponent(municipality)}` : '';
        const url = `${apiUrl}?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}&radius=${encodeURIComponent(radius)}&service=${encodeURIComponent(service)}${municipalityParam}`;

        if (import.meta.env.DEV) {
          console.debug('[useServiceAnalysis] fetching', service, url.replace(/https?:\/\/[^/]+/, ''));
        }

        const headers = { 'Content-Type': 'application/json' };
        if (anonKey && apiUrl.includes('/functions/v1/')) {
          headers.Authorization = `Bearer ${anonKey}`;
          headers.apikey = anonKey;
        }

        const response = await fetch(url, { headers });
        const result = await response.json().catch(() => ({ error: "INVALID_ANALYSIS_RESPONSE" }));

        if (import.meta.env.DEV) {
          console.debug('[useServiceAnalysis] response', response.status, '| error:', result.error || result.code || 'none',
            '| breakdown_len:', result.comuni_breakdown?.length ?? 'null',
            '| first_keys:', result.comuni_breakdown?.[0] ? Object.keys(result.comuni_breakdown[0]).join(',') : 'none');
        }

        if (!response.ok || result.error) {
          setError(result.error || result.code || `HTTP_${response.status}`);
          setData(result.sources || result.metadata ? result : null);
        } else {
          setData(result);
          setError(null);
        }
      } catch (err) {
        if (import.meta.env.DEV) {
          console.debug('[useServiceAnalysis] fetch threw:', err?.message);
        }
        setError("CONNECTION_ERROR");
        setData(null);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [lat, lng, radius, service, municipality]);

  return { data, loading, error };
}
