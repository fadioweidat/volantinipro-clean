import { useState, useEffect, useRef } from 'react';
import { buildServiceAnalysisRequest } from '../lib/step2/buildServiceAnalysisRequest.js';

const debugStep2 = (...args) => {
  if (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.DEV && (import.meta.env.VITE_DEBUG_STEP2 === 'true' || (typeof window !== "undefined" && window.__VOLANTINIPRO_DEBUG_STEP2__))) console.log(...args);
};

let hasLoggedInvalidZone = false;

export function useServiceAnalysis(lat, lng, radius, service, municipality = null, quantity = null, scope = null, analysisLevel = null, selectionScope = null, selectedMunicipalityCodes = null) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const requestIdRef = useRef(0);
  const lastRequestKeyRef = useRef("");
  const lastResultKeyRef = useRef("");

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
      if (!hasLoggedInvalidZone) {
        debugStep2("[ZONE_ANALYSIS_SKIPPED_INVALID_ZONE]", {
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

    const { requestKey, url, canonicalCodes } = buildServiceAnalysisRequest({
      lat: centerLat,
      lng: centerLng,
      radius: radiusKm,
      service,
      municipality,
      quantity,
      scope,
      analysisLevel,
      selectionScope,
      selectedMunicipalityCodes
    });

    if (lastRequestKeyRef.current === requestKey && data !== null && error === null) {
      debugStep2("[ZONE_ANALYSIS_SKIPPED_DUPLICATE]", { requestKey });
      return undefined;
    }

    const requestId = ++requestIdRef.current;
    const controller = new AbortController();

    // Diamo subito feedback visivo
    setLoading(true);

    const fetchData = async () => {
      lastRequestKeyRef.current = requestKey;

      debugStep2('[ZONE_CHANGE]', { municipality, centerLat, centerLng, radiusKm, service, selectionScope, selectedMunicipalityCodes: canonicalCodes });

      setError(null);

      try {
        let anonKey = null;
        try {
          anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
        } catch (e) {
          if (typeof process !== "undefined" && process.env) {
            anonKey = process.env.VITE_SUPABASE_ANON_KEY;
          }
        }

        if (!url) {
          setError("ANALYSIS_BACKEND_NOT_CONFIGURED");
          setData({ values: {}, comuni_breakdown: [], metadata: { isEstimated: false }, sources: [], error: "ANALYSIS_BACKEND_NOT_CONFIGURED" });
          return;
        }

        debugStep2('[ZONE_ANALYSIS_REQUEST]', {
          requestId,
          scope,
          service,
          center: { lat: centerLat, lng: centerLng },
          radiusKm,
          municipality,
          selectionScope,
          selectedMunicipalityCodes: canonicalCodes
        });

        const headers = { 'Content-Type': 'application/json' };
        if (anonKey) {
          headers['apikey'] = anonKey;
          headers['Authorization'] = `Bearer ${anonKey}`;
        }

        const response = await fetch(url, { headers, signal: controller.signal });
        const result = await response.json().catch(() => ({ error: "INVALID_ANALYSIS_RESPONSE" }));

        debugStep2('[ZONE_ANALYSIS_RESPONSE]', {
          requestId,
          status: response.status,
          mainArea: result?.metadata?.municipality || result?.metadata?.comune || municipality,
          resultsCount: (result?.comuni_breakdown?.length || 0) + (result?.nil_breakdown?.length || 0)
        });

        if (requestId !== requestIdRef.current) {
          debugStep2('[ZONE_ANALYSIS_IGNORED_STALE]', { requestId, current: requestIdRef.current });
          return;
        }

        if (!response.ok || result.error) {
          setError(result.error || result.code || `HTTP_${response.status}`);
          setData(result.sources || result.metadata ? result : null);
        } else {
          if (lastResultKeyRef.current !== requestKey) {
            lastResultKeyRef.current = requestKey;
            setData(result);
          }
          setError(null);
          debugStep2('[ZONE_ANALYSIS_APPLIED]', { requestId, municipality });
        }
      } catch (err) {
        if (err?.name === 'AbortError') return;
        if (requestId !== requestIdRef.current) {
          debugStep2('[ZONE_ANALYSIS_IGNORED_STALE]', { requestId, error: "Aborted/Stale" });
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
  }, [lat, lng, radius, service, municipality, quantity, scope, analysisLevel, selectionScope, selectedMunicipalityCodes]);

  return { data, loading, error };
}
