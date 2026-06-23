const fs = require('fs');

try {
  let code = fs.readFileSync('src/hooks/useServiceAnalysis.js', 'utf8');

  // I will just replace the whole hook body to ensure it has all the logs exactly as requested.
  const newHook = `import { useState, useEffect, useRef } from 'react';

export function useServiceAnalysis(lat, lng, radius, service, municipality = null, quantity = null, scope = null, analysisLevel = null) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const radiusKm = Number(radius);
    const centerLat = Number(lat);
    const centerLng = Number(lng);
    if (!Number.isFinite(centerLat) || !Number.isFinite(centerLng) || !Number.isFinite(radiusKm) || radiusKm <= 0) {
      return undefined;
    }

    if (import.meta.env.DEV) {
      console.log('[ZONE_CHANGE]', { municipality, centerLat, centerLng, radiusKm, service });
    }

    const requestId = ++requestIdRef.current;
    const controller = new AbortController();

    const fetchData = async () => {
      setLoading(true);
      setData(null);
      setError(null);

      try {
        const baseUrl = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_SUPABASE_URL;
        const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
        const endpoint = service === 'd2d' ? 'analysis-istat' : 'analysis-poi-search';
        const explicitUrl = service === 'd2d' ? import.meta.env.VITE_ANALYSIS_ISTAT_URL : import.meta.env.VITE_ANALYSIS_POI_URL;
        const functionUrl = baseUrl ? \`\${baseUrl}/functions/v1/\${endpoint}\` : null;
        const apiUrl = explicitUrl || functionUrl;
        
        if (!apiUrl) {
          setError("ANALYSIS_BACKEND_NOT_CONFIGURED");
          setData({ values: {}, comuni_breakdown: [], metadata: { isEstimated: false }, sources: [], error: "ANALYSIS_BACKEND_NOT_CONFIGURED" });
          return;
        }
        
        const municipalityParam = municipality ? \`&municipality=\${encodeURIComponent(municipality)}\` : '';
        const quantityParam = quantity ? \`&quantity=\${encodeURIComponent(quantity)}\` : '';
        const analysisLevelParam = analysisLevel ? \`&analysisLevel=\${encodeURIComponent(analysisLevel)}\` : '';
        const url = \`\${apiUrl}?lat=\${encodeURIComponent(centerLat)}&lng=\${encodeURIComponent(centerLng)}&radius=\${encodeURIComponent(radiusKm)}&service=\${encodeURIComponent(service)}\${municipalityParam}\${quantityParam}\${analysisLevelParam}\`;
        
        if (import.meta.env.DEV) {
          console.log('[ZONE_ANALYSIS_REQUEST]', {
            requestId,
            scope,
            service,
            center: { lat: centerLat, lng: centerLng },
            radiusKm,
            municipality
          });
        }

        const headers = { 'Content-Type': 'application/json' };
        if (anonKey && apiUrl.includes('/functions/v1/')) {
          headers.Authorization = \`Bearer \${anonKey}\`;
          headers.apikey = anonKey;
        }

        const response = await fetch(url, { headers, signal: controller.signal });
        const result = await response.json().catch(() => ({ error: "INVALID_ANALYSIS_RESPONSE" }));
        
        if (import.meta.env.DEV) {
           console.log('[ZONE_ANALYSIS_RESPONSE]', {
             requestId,
             status: response.status,
             mainArea: result?.metadata?.municipality || result?.metadata?.comune || municipality,
             resultsCount: (result?.comuni_breakdown?.length || 0) + (result?.nil_breakdown?.length || 0)
           });
        }

        if (requestId !== requestIdRef.current) {
          if (import.meta.env.DEV) console.log('[ZONE_ANALYSIS_IGNORED_STALE]', { requestId, current: requestIdRef.current });
          return;
        }

        if (!response.ok || result.error) {
          setError(result.error || result.code || \`HTTP_\${response.status}\`);
          setData(result.sources || result.metadata ? result : null);
        } else {
          setData(result);
          setError(null);
          if (import.meta.env.DEV) console.log('[ZONE_ANALYSIS_APPLIED]', { requestId, municipality });
        }
      } catch (err) {
        if (err?.name === 'AbortError') return;
        if (requestId !== requestIdRef.current) {
          if (import.meta.env.DEV) console.log('[ZONE_ANALYSIS_IGNORED_STALE]', { requestId, error: "Aborted/Stale" });
          return;
        }
        setError("CONNECTION_ERROR");
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    };

    fetchData();
    return () => controller.abort();
  }, [lat, lng, radius, service, municipality, quantity, scope, analysisLevel]);

  return { data, loading, error };
}
`;

  fs.writeFileSync('src/hooks/useServiceAnalysis.js', newHook);
  console.log('Patch 9 applied successfully.');
} catch (e) {
  console.error(e);
}
