const debugStep2Enabled = () =>
  Boolean(
    import.meta.env.DEV &&
    (import.meta.env.VITE_DEBUG_STEP2 === 'true' || globalThis.window?.__VOLANTINIPRO_DEBUG_STEP2__ === true)
  );

const debugStep2Log = (...args) => {
  if (debugStep2Enabled()) console.log(...args);
};

const debugStep2Error = (...args) => {
  if (debugStep2Enabled()) console.error(...args);
};

// [MAP_SECTORS_RPC_REQUEST] / [MAP_SECTORS_RPC_SUCCESS]: diagnostica di routine,
// gated dietro il debug flag Step 2 (in produzione non stampa nulla). Gli
// errori/fallback restano visibili (mapSectorsWarn) perche' segnalano problemi
// reali. Nessuna modifica al data flow / dipendenze di useSectors.
const mapSectorsInfo = (...args) => {
  if (debugStep2Enabled()) console.info(...args);
};
const mapSectorsWarn = (...args) => console.warn(...args);

async function fetchSectorsAnonRest(params, signal) {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    const error = new Error('Supabase anon configuration missing');
    error.code = 'MAP_SECTORS_CONFIG_MISSING';
    throw error;
  }

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

/**
 * Fetches operational sectors from `map_sectors` via PostgREST RPC.
 * Always uses the public anon key so a stale user session cannot produce
 * a first failing 401 before the public request.
 */
export async function fetchSectors({ serviceType, centerLat, centerLng, radiusKm = 5, signal }) {
  const rpcParams = {
    p_service_type: serviceType,
    p_center_lat: centerLat,
    p_center_lng: centerLng,
    p_radius_km: radiusKm,
  };

  debugStep2Log(`[MAP_SECTORS_REQUEST] type: ${serviceType}, lat: ${centerLat}, lng: ${centerLng}, radiusKm: ${radiusKm}`);
  mapSectorsInfo('[MAP_SECTORS_RPC_REQUEST]', {
    rpc: 'get_map_sectors',
    source: 'anon_rest',
    params: rpcParams,
    headers: {
      apikey: 'VITE_SUPABASE_ANON_KEY',
      Authorization: 'Bearer VITE_SUPABASE_ANON_KEY',
    },
  });

  try {
    const data = await fetchSectorsAnonRest(rpcParams, signal);
    debugStep2Log(`[MAP_SECTORS_RESPONSE] Success, received features: ${data?.features?.length || 0}`);
    mapSectorsInfo('[MAP_SECTORS_RPC_SUCCESS]', {
      source: 'anon_rest',
      features: data?.features?.length ?? 0,
    });
    return data ?? null;
  } catch (err) {
    if (err?.name === 'AbortError') return null;
    debugStep2Error('[MAP_SECTORS_ERROR]', err);
    mapSectorsWarn('[MAP_SECTORS_RPC_ERROR]', {
      source: 'anon_rest',
      status: err?.status ?? null,
      code: err?.code ?? null,
      message: err?.message ?? String(err),
    });
    mapSectorsWarn('[MAP_SECTORS_RPC_FALLBACK_USED]', {
      source: 'ui_no_sectors',
      failed: true,
      error: err?.message ?? String(err),
    });
    return null;
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
      id: f.properties?.id ?? null,
      numero: f.properties?.sector_number ?? 1,
      name: f.properties?.sector_name ?? null,
      municipalityCode: f.properties?.municipality_code ?? null,
      serviceType: f.properties?.service_type ?? null,
      geometry: f.geometry,
    }));
}
