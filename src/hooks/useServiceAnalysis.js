import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient.js';

export function useServiceAnalysis(lat, lng, radius, service, municipality = null, quantity = null, scope = null) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!lat || !lng) return;
    const requestId = ++requestIdRef.current;
    const controller = new AbortController();
    const radiusKm = Number(radius);
    const centerLat = Number(lat);
    const centerLng = Number(lng);

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      setData(null);

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
        const url = `${apiUrl}?lat=${encodeURIComponent(centerLat)}&lng=${encodeURIComponent(centerLng)}&radius=${encodeURIComponent(radiusKm)}&service=${encodeURIComponent(service)}${municipalityParam}${quantityParam}`;

        if (import.meta.env.DEV) {
          console.debug('[useServiceAnalysis] request', {
            requestId,
            scope,
            service,
            center: { lat: centerLat, lng: centerLng },
            radiusKm,
            quantity,
            municipality,
            path: url.replace(/https?:\/\/[^/]+/, ''),
          });
        }

        const headers = { 'Content-Type': 'application/json' };
        if (anonKey && apiUrl.includes('/functions/v1/')) {
          headers.Authorization = `Bearer ${anonKey}`;
          headers.apikey = anonKey;
        }

        const response = await fetch(url, { headers, signal: controller.signal });
        const result = await response.json().catch(() => ({ error: "INVALID_ANALYSIS_RESPONSE" }));
        if (requestId !== requestIdRef.current) return;

        if (import.meta.env.DEV) {
          console.debug('[useServiceAnalysis] response', {
            requestId,
            scope,
            status: response.status,
            error: result.error || result.code || 'none',
            comuniCount: result.comuni_breakdown?.length ?? 0,
            firstKeys: result.comuni_breakdown?.[0] ? Object.keys(result.comuni_breakdown[0]).join(',') : 'none',
          });
        }

        const normalizedResult = service === 'd2d'
          ? await hydrateComuniGeometries(result, { centerLat, centerLng, radiusKm, quantity })
          : result;

        if (import.meta.env.DEV) {
          const comuni = Array.isArray(normalizedResult?.comuni_breakdown) ? normalizedResult.comuni_breakdown : [];
          console.log("COMUNI GEOMETRY CHECK", comuni.map((c) => ({
            name: c.comune_name || c.name,
            hasGeometry: !!(c.geometry_geojson || c.geometry || c.geojson || c.geom),
          })));
        }

        if (!response.ok || result.error) {
          setError(result.error || result.code || `HTTP_${response.status}`);
          setData(normalizedResult.sources || normalizedResult.metadata ? normalizedResult : null);
        } else {
          setData(normalizedResult);
          setError(null);
        }
      } catch (err) {
        if (err?.name === 'AbortError') return;
        if (requestId !== requestIdRef.current) return;
        if (import.meta.env.DEV) {
          console.debug('[useServiceAnalysis] fetch threw:', err?.message);
        }
        setError("CONNECTION_ERROR");
        setData(null);
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    };

    fetchData();
    return () => controller.abort();
  }, [lat, lng, radius, service, municipality, quantity, scope]);

  return { data, loading, error };
}

async function hydrateComuniGeometries(result, { centerLat, centerLng, radiusKm, quantity }) {
  const rows = Array.isArray(result?.comuni_breakdown) ? result.comuni_breakdown : [];
  if (!rows.length || !supabase) return result;

  const { data, error } = await supabase.rpc('get_comuni_breakdown_in_radius', {
    p_lat: centerLat,
    p_lng: centerLng,
    p_radius_km: radiusKm,
  });

  if (error || !Array.isArray(data) || !data.length) {
    if (import.meta.env.DEV) {
      console.warn('[useServiceAnalysis] comuni geometry RPC unavailable', error);
    }
    return {
      ...result,
      comuni_breakdown: rows.map(normalizeGeometryInRow),
    };
  }

  const byCode = new Map();
  const byName = new Map();
  data.forEach((row) => {
    const code = normalizeKey(row.comune_code || row.municipality_code);
    const name = normalizeKey(row.comune_name || row.municipality_name);
    if (code) byCode.set(code, row);
    if (name) byName.set(name, row);
  });

  return {
    ...result,
    comuni_breakdown: rows.map((row) => {
      const normalized = normalizeGeometryInRow(row);
      if (normalized.geometry) return normalized;
      const match = byCode.get(normalizeKey(row.comune_code || row.municipality_code))
        || byName.get(normalizeKey(row.comune_name || row.municipality_name));
      if (match) {
        const rawGeom = match.geometry_geojson || match.geometry || match.geojson || match.geom;
        if (rawGeom) {
          return {
            ...normalized,
            geometry_geojson: rawGeom,
            geometry: typeof rawGeom === 'object' ? rawGeom : safeJsonParse(rawGeom),
          };
        }
      }
      return normalized;
    }),
  };
}

function safeJsonParse(val) {
  try {
    const first = JSON.parse(val);
    if (typeof first === "string") {
      const s = first.trim();
      if ((s.startsWith("{") && s.endsWith("}")) || (s.startsWith("[") && s.endsWith("]"))) {
        return JSON.parse(s);
      }
    }
    return first;
  } catch {
    return null;
  }
}

function normalizeGeometryInRow(row) {
  if (!row) return row;
  const rawGeom = row.geometry_geojson || row.geometry || row.geojson || row.geom;
  if (rawGeom) {
    return {
      ...row,
      geometry_geojson: row.geometry_geojson ?? rawGeom,
      geometry: typeof rawGeom === 'object' ? rawGeom : safeJsonParse(rawGeom),
    };
  }
  return row;
}

function normalizeKey(value) {
  return value == null ? '' : String(value).trim().toLowerCase();
}
