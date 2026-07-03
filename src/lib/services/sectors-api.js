import { supabase } from '../supabaseClient.js';

const debugStep2Enabled = () =>
  Boolean(
    import.meta.env.DEV &&
    (import.meta.env.VITE_DEBUG_STEP2 === 'true' || globalThis.window?.__VOLANTINIPRO_DEBUG_STEP2__ === true)
  );
const debugStep2Log = (...args) => {
  if (debugStep2Enabled()) console.log(...args);
};
const debugStep2Warn = (...args) => {
  if (debugStep2Enabled()) console.warn(...args);
};
const debugStep2Error = (...args) => {
  if (debugStep2Enabled()) console.error(...args);
};
const mapSectorsInfo = (...args) => console.info(...args);
const mapSectorsWarn = (...args) => console.warn(...args);

// Direct anon-key REST call, bypassing whatever session the shared client
// currently holds. If this also returns 401, the fix is Supabase-side
// permissions (GRANT/RLS/SECURITY DEFINER), not Step 2 rendering.
async function fetchSectorsWithAnonKey(params, signal) {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  const response = await fetch(`${url}/rest/v1/rpc/get_map_sectors`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
    signal,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const error = new Error(text || `HTTP ${response.status}`);
    error.status = response.status;
    error.body = text;
    throw error;
  }
  return response.json();
}

function isJwtAuthError(error) {
  const code = error?.code ?? '';
  const msg = String(error?.message ?? '');
  return error?.status === 401 || code === 'PGRST301' || /jwt/i.test(msg) || /401|unauthorized/i.test(msg);
}

/**
 * Fetches operational sectors from `map_sectors` via PostgREST RPC.
 * Returns a GeoJSON FeatureCollection, or null when backend is not ready.
 */
export async function fetchSectors({ serviceType, centerLat, centerLng, radiusKm = 5, signal }) {
  if (!supabase) return null;

  const rpcParams = {
    p_service_type: serviceType,
    p_center_lat:   centerLat,
    p_center_lng:   centerLng,
    p_radius_km:    radiusKm,
  };

  debugStep2Log(`[MAP_SECTORS_REQUEST] type: ${serviceType}, lat: ${centerLat}, lng: ${centerLng}, radiusKm: ${radiusKm}`);
  mapSectorsInfo('[MAP_SECTORS_RPC_REQUEST]', {
    rpc: 'get_map_sectors',
    params: rpcParams,
    headers: {
      apikey: 'VITE_SUPABASE_ANON_KEY',
      Authorization: 'Bearer anon key or stored session token',
    },
  });

  try {
    const { data, error } = await supabase.rpc('get_map_sectors', rpcParams, { signal });

    if (error) {
      debugStep2Warn("[MAP_SECTORS_ERROR]", error);

      // Shared SDK client has a stale/invalid session token (not a missing
      // GRANT/permission issue — the function is anon-accessible). Retry
      // once with a plain anon key request before giving up.
      if (isJwtAuthError(error)) {
        mapSectorsWarn("[MAP_SECTORS_RPC_401]", {
          source: 'shared_client',
          status: error?.status ?? null,
          code: error?.code ?? null,
          message: error?.message ?? String(error),
        });
        try {
          const fallbackData = await fetchSectorsWithAnonKey(rpcParams, signal);
          mapSectorsInfo("[MAP_SECTORS_RPC_FALLBACK_USED]", {
            source: 'anon_rest_retry',
            features: fallbackData?.features?.length ?? 0,
          });
          mapSectorsInfo("[MAP_SECTORS_RPC_SUCCESS]", {
            source: 'anon_rest_retry',
            features: fallbackData?.features?.length ?? 0,
          });
          return fallbackData ?? null;
        } catch (fallbackErr) {
          if (isJwtAuthError(fallbackErr)) {
            mapSectorsWarn("[MAP_SECTORS_RPC_401]", {
              source: 'anon_rest_retry',
              status: fallbackErr?.status ?? null,
              message: fallbackErr?.message ?? String(fallbackErr),
            });
          }
          mapSectorsWarn("[MAP_SECTORS_RPC_FALLBACK_USED]", {
            source: 'ui_no_sectors',
            failed: true,
            error: fallbackErr?.message ?? String(fallbackErr),
          });
          return null;
        }
      }

      // Table / function not yet migrated — silent fallback so map stays usable
      const msg = error.message ?? '';
      if (
        msg.includes('does not exist') ||
        msg.includes('404') ||
        msg.includes('42883') ||  // PostgreSQL: undefined_function
        msg.includes('function')
      ) {
        mapSectorsWarn("[MAP_SECTORS_RPC_FALLBACK_USED]", {
          source: 'ui_no_sectors',
          failed: true,
          error: msg || 'RPC_NOT_AVAILABLE',
        });
        return null;
      }
      // Return null instead of throwing to prevent crashing
      mapSectorsWarn("[MAP_SECTORS_RPC_FALLBACK_USED]", {
        source: 'ui_no_sectors',
        failed: true,
        error: msg || 'RPC_ERROR',
      });
      return null;
    }

    debugStep2Log(`[MAP_SECTORS_RESPONSE] Success, received features: ${data?.features?.length || 0}`);
    mapSectorsInfo("[MAP_SECTORS_RPC_SUCCESS]", { source: 'shared_client', features: data?.features?.length ?? 0 });
    return data ?? null;
  } catch (err) {
    if (err.name === 'AbortError') return null;
    debugStep2Error("[MAP_SECTORS_ERROR]", err);
    if (isJwtAuthError(err)) {
      mapSectorsWarn("[MAP_SECTORS_RPC_401]", {
        source: 'exception',
        status: err?.status ?? null,
        message: err?.message ?? String(err),
      });
    }
    mapSectorsWarn("[MAP_SECTORS_RPC_FALLBACK_USED]", {
      source: 'ui_no_sectors',
      failed: true,
      error: err?.message ?? String(err),
    });
    return null; // fallback
  }
}

/**
 * Converts the GeoJSON FeatureCollection from `get_map_sectors` into the
 * internal format expected by Step2Map: Array<{id, numero, name, municipalityCode, geometry}>.
 */
export function parseSectorsGeoJSON(featureCollection) {
  if (!featureCollection?.features?.length) return [];
  return featureCollection.features
    .filter(f => f?.geometry)
    .map(f => ({
      id:               f.properties?.id ?? null,
      numero:           f.properties?.sector_number ?? 1,
      name:             f.properties?.sector_name ?? null,
      municipalityCode: f.properties?.municipality_code ?? null,
      serviceType:      f.properties?.service_type ?? null,
      geometry:         f.geometry,
    }));
}
