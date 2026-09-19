const debugStep2Enabled = () =>
  Boolean(
    (import.meta.env?.DEV || process.env.NODE_ENV !== 'production') &&
    (import.meta.env?.VITE_DEBUG_STEP2 === 'true' || process.env.VITE_DEBUG_STEP2 === 'true' || globalThis.window?.__VOLANTINIPRO_DEBUG_STEP2__ === true)
  );

const debugStep2Log = (...args) => {
  if (debugStep2Enabled()) console.log(...args);
};

const debugStep2Error = (...args) => {
  if (debugStep2Enabled()) console.error(...args);
};

const mapSectorsInfo = (...args) => {
  if (debugStep2Enabled()) console.info(...args);
};

const mapSectorsWarn = (...args) => console.warn(...args);

export function normalizeSectorServiceType(serviceType) {
  const raw = String(serviceType || 'd2d').trim().toLowerCase();
  if (raw === 'door_to_door' || raw === 'door-to-door' || raw === 'd2d' || raw === 'residential' || raw === 'direct') {
    return 'd2d';
  }
  if (raw === 'hand_to_hand' || raw === 'hand-to-hand' || raw === 'h2h' || raw === 'promoter' || raw === 'street') {
    return 'h2h';
  }
  if (raw === 'business_to_business' || raw === 'business-to-business' || raw === 'b2b' || raw === 'business' || raw === 'business-distribution') {
    return 'b2b';
  }
  return raw || 'd2d';
}

async function executeSectorRpc(rpcName, params, parentSignal, timeoutMs = 8000) {
  const url = import.meta.env?.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    const error = new Error('Supabase anon configuration missing');
    error.code = 'MAP_SECTORS_CONFIG_MISSING';
    throw error;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new Error(`Timeout RPC ${rpcName} exceeded ${timeoutMs}ms`));
  }, timeoutMs);

  let onParentAbort = null;
  if (parentSignal) {
    onParentAbort = () => controller.abort(parentSignal.reason || new Error('Parent aborted'));
    if (parentSignal.aborted) {
      clearTimeout(timeoutId);
      controller.abort(parentSignal.reason);
    } else {
      parentSignal.addEventListener('abort', onParentAbort);
    }
  }

  try {
    const response = await fetch(`${url}/rest/v1/rpc/${rpcName}`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      const error = new Error(text || `HTTP ${response.status}`);
      error.status = response.status;
      error.body = text;
      error.rpcName = rpcName;
      throw error;
    }

    return await response.json();
  } finally {
    clearTimeout(timeoutId);
    if (parentSignal && onParentAbort) {
      parentSignal.removeEventListener('abort', onParentAbort);
    }
  }
}

/**
 * Fetches operational sectors from `map_sectors` via PostgREST RPC.
 * Always uses the public anon key so a stale user session cannot produce
 * a first failing 401 before the public request.
 */
export async function fetchSectors({ serviceType, centerLat, centerLng, radiusKm = 5, signal }) {
  const latNum = Number(centerLat);
  const lngNum = Number(centerLng);
  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
    return { type: 'FeatureCollection', features: [] };
  }

  const normalizedService = normalizeSectorServiceType(serviceType);
  const rpcParams = {
    p_service_type: normalizedService,
    p_center_lat: latNum,
    p_center_lng: lngNum,
    p_radius_km: Number(radiusKm) || 5,
  };

  debugStep2Log(`[MAP_SECTORS_REQUEST] type: ${normalizedService}, lat: ${latNum}, lng: ${lngNum}, radiusKm: ${rpcParams.p_radius_km}`);
  mapSectorsInfo('[MAP_SECTORS_RPC_REQUEST]', {
    rpc: 'get_map_sectors_v2',
    source: 'anon_rest',
    params: rpcParams,
    headers: {
      apikey: 'VITE_SUPABASE_ANON_KEY',
      Authorization: 'Bearer VITE_SUPABASE_ANON_KEY',
    },
  });

  // Try v2 primary, with fallback to get_map_sectors if v2 not yet deployed or error
  try {
    const data = await executeSectorRpc('get_map_sectors_v2', rpcParams, signal, 8000);
    debugStep2Log(`[MAP_SECTORS_RESPONSE] Success v2, received features: ${data?.features?.length || 0}`);
    mapSectorsInfo('[MAP_SECTORS_RPC_SUCCESS]', {
      rpc: 'get_map_sectors_v2',
      source: 'anon_rest',
      features: data?.features?.length ?? 0,
    });
    return data ?? { type: 'FeatureCollection', features: [] };
  } catch (errV2) {
    if (errV2?.name === 'AbortError' || signal?.aborted) return null;
    
    // Attempt fallback to get_map_sectors
    try {
      const dataV1 = await executeSectorRpc('get_map_sectors', rpcParams, signal, 8000);
      debugStep2Log(`[MAP_SECTORS_RESPONSE] Success v1 fallback, received features: ${dataV1?.features?.length || 0}`);
      mapSectorsInfo('[MAP_SECTORS_RPC_SUCCESS]', {
        rpc: 'get_map_sectors',
        source: 'anon_rest_fallback',
        features: dataV1?.features?.length ?? 0,
      });
      return dataV1 ?? { type: 'FeatureCollection', features: [] };
    } catch (errV1) {
      if (errV1?.name === 'AbortError' || signal?.aborted) return null;
      
      debugStep2Error('[MAP_SECTORS_ERROR]', { errV2: errV2?.message, errV1: errV1?.message });
      mapSectorsWarn('[MAP_SECTORS_RPC_ERROR]', {
        source: 'anon_rest',
        status: errV1?.status ?? errV2?.status ?? null,
        code: errV1?.code ?? errV2?.code ?? null,
        message: errV1?.message ?? errV2?.message ?? String(errV1),
      });
      mapSectorsWarn('[TERRITORY_PRIMARY_FAILED]', {
        rpc: 'get_map_sectors_v2',
        error: errV2?.message,
      });
      mapSectorsWarn('[MAP_SECTORS_RPC_FALLBACK_USED]', {
        source: 'ui_no_sectors',
        failed: true,
        error: errV1?.message ?? String(errV1),
      });
      return null;
    }
  }
}

/**
 * Converts the GeoJSON FeatureCollection from `get_map_sectors` into the
 * internal format expected by Step2Map: Array<{id, numero, name, municipalityCode, serviceType, geometry}>.
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
