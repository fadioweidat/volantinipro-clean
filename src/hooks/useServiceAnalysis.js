import { useState, useEffect, useRef } from 'react';

let hasLoggedInvalidZone = false;

export function useServiceAnalysis(lat, lng, radius, service, municipality = null, quantity = null, scope = null, analysisLevel = null) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const requestIdRef = useRef(0);
  const lastRequestKeyRef = useRef("");

  useEffect(() => {
    const radiusKm = Number(radius);
    const centerLat = Number(lat);
    const centerLng = Number(lng);
    
    const hasValidZone =
      municipality &&
      Number.isFinite(centerLat) &&
      Number.isFinite(centerLng) &&
      centerLat !== 0 &&
      centerLng !== 0 &&
      radiusKm > 0;

    if (!hasValidZone) {
      if (import.meta.env.DEV && !hasLoggedInvalidZone) {
        console.log("[ZONE_ANALYSIS_SKIPPED_INVALID_ZONE]", {
          municipality,
          centerLat,
          centerLng,
          radiusKm,
          service,
        });
        hasLoggedInvalidZone = true;
      }
      return undefined;
    }

    const requestKey = [
      service,
      municipality || "",
      Number(centerLat).toFixed(6),
      Number(centerLng).toFixed(6),
      radiusKm
    ].join("|");

    if (lastRequestKeyRef.current === requestKey && data !== null && error === null) {
      if (import.meta.env.DEV) {
        console.log("[ZONE_ANALYSIS_SKIPPED_DUPLICATE]", { requestKey });
      }
      return undefined;
    }

    const requestId = ++requestIdRef.current;
    const controller = new AbortController();

    // Diamo subito feedback visivo
    setLoading(true);

    const fetchData = async () => {
      lastRequestKeyRef.current = requestKey;
      
      if (import.meta.env.DEV) {
        console.log('[ZONE_CHANGE]', { municipality, centerLat, centerLng, radiusKm, service });
      }

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
        const quantityParam = quantity ? `&quantity=${encodeURIComponent(quantity)}` : '';
        const analysisLevelParam = analysisLevel ? `&analysisLevel=${encodeURIComponent(analysisLevel)}` : '';
        const url = `${apiUrl}?lat=${encodeURIComponent(centerLat)}&lng=${encodeURIComponent(centerLng)}&radius=${encodeURIComponent(radiusKm)}&service=${encodeURIComponent(service)}${municipalityParam}${quantityParam}${analysisLevelParam}`;
        
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
          headers.Authorization = `Bearer ${anonKey}`;
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
          setError(result.error || result.code || `HTTP_${response.status}`);
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

    const timerId = setTimeout(() => {
      fetchData();
    }, 450); // Debounce delay 450ms

    return () => {
      clearTimeout(timerId);
      controller.abort();
    };
  }, [lat, lng, radius, service, municipality, quantity, scope, analysisLevel]);

  return { data, loading, error };
}
