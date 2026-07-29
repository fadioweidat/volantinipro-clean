export const EMPTY_CIVICI_STATE = {
  available: false,
  count: 0,
  renderedCount: 0,
  bboxCount: 0,
  source: null,
  coverage: 'none',
  label: 'Civici non disponibili',
  message: 'Serve una fonte dati civici/address points completa per questa zona.',
  points: [],
};

export const FALLBACK_CIVICI_STATE = {
  available: false,
  count: 0,
  renderedCount: 0,
  bboxCount: 0,
  source: null,
  coverage: 'none',
  label: 'Civici non disponibili',
  message: 'Civici non disponibili per questa zona. La copertura resta calcolata sui dati territoriali.',
  points: [],
};

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

export function makeCiviciState(rows, totalCount = null, metadata = {}) {
  const points = Array.isArray(rows)
    ? rows
        .filter((row) => !row.source || String(row.source).toLowerCase() === 'osm')
        .map((row) => ({
          id: row.id,
          source: row.source || 'osm',
          comune: row.comune || null,
          codiceComune: row.codice_comune || row.codiceComune || null,
          via: row.via || null,
          numeroCivico: row.numero_civico || row.numeroCivico || null,
          lat: Number(row.lat),
          lng: Number(row.lng),
          confidence: row.confidence != null ? Number(row.confidence) : null,
          distanceM: row.distance_m != null ? Number(row.distance_m) : null,
        }))
        .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng))
    : [];

  const bboxCount = firstFiniteNumber(
    metadata.bboxCount,
    metadata.totalCount,
    metadata.contentRangeCount,
    totalCount,
    points.length,
  );
  const count = firstFiniteNumber(totalCount, bboxCount, points.length);
  if (count <= 0) return EMPTY_CIVICI_STATE;

  return {
    available: true,
    count,
    renderedCount: firstFiniteNumber(metadata.renderedCount, points.length),
    bboxCount,
    source: 'osm',
    coverage: 'partial',
    label: 'OSM · copertura parziale',
    message: points.length > 0
      ? 'Civici disponibili da fonte OSM per questa zona. Copertura non completa.'
      : 'Civici OSM presenti nel bbox selezionato. Copertura non completa.',
    points,
  };
}

// Session-level cache for request keys that timed out — prevents immediate retry
const timeoutedKeys = new Set();

// Max radius beyond which we skip the fetch entirely (bbox would be too large)
const MAX_CIVICI_RADIUS_KM = 3;

// Fields actually needed — never use select=*
const SELECT_FIELDS = 'id,lat,lng,source';

// Hard cap on rows returned from PostgREST
const ROW_LIMIT = 1500;

export async function fetchAddressPointsInRadius({ centerLat, centerLng, radiusKm, signal }) {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return { rows: [], count: 0, bboxCount: 0, totalCount: 0, contentRangeCount: 0, renderedCount: 0 };
  }

  // Guard: skip large radii — bbox would contain too many rows and timeout anyway
  if (radiusKm > MAX_CIVICI_RADIUS_KM) {
    debugStep2Log('[ADDRESS_POINTS_FETCH_SKIPPED_RADIUS]', { radiusKm, maxAllowed: MAX_CIVICI_RADIUS_KM });
    return { rows: [], count: 0, bboxCount: 0, totalCount: 0, contentRangeCount: 0, renderedCount: 0 };
  }

  // Calculate bbox (1 degree lat ≈ 111 km)
  const latDelta = radiusKm / 111.0;
  const lngDelta = radiusKm / (111.0 * Math.cos((centerLat * Math.PI) / 180));
  const minLat = centerLat - latDelta;
  const maxLat = centerLat + latDelta;
  const minLng = centerLng - lngDelta;
  const maxLng = centerLng + lngDelta;

  const requestKey = `osm_${minLat.toFixed(5)}_${maxLat.toFixed(5)}_${minLng.toFixed(5)}_${maxLng.toFixed(5)}_r${radiusKm}`;

  // Guard: skip if this exact bbox already timed out this session
  if (timeoutedKeys.has(requestKey)) {
    debugStep2Log('[ADDRESS_POINTS_FETCH_SKIPPED_TIMEOUT]', { requestKey });
    return { rows: [], count: 0, bboxCount: 0, totalCount: 0, contentRangeCount: 0, renderedCount: 0, isTimeout: true };
  }

  const generatedUrl =
    `${url}/rest/v1/address_points` +
    `?select=${SELECT_FIELDS}` +
    `&source=eq.osm` +
    `&lat=gte.${minLat}&lat=lte.${maxLat}` +
    `&lng=gte.${minLng}&lng=lte.${maxLng}` +
    `&limit=${ROW_LIMIT}`;

  debugStep2Log(`[ADDRESS_POINTS_FETCH_BBOX] lat: [${minLat.toFixed(5)}, ${maxLat.toFixed(5)}], lng: [${minLng.toFixed(5)}, ${maxLng.toFixed(5)}], radiusKm: ${radiusKm}`);

  try {
    const response = await fetch(generatedUrl, {
      method: 'GET',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        'Prefer': 'count=exact',
      },
      signal,
    });

    if (!response.ok) {
      const errText = await response.text();

      // Supabase statement timeout — treat as graceful fallback, never as hard error
      let errObj;
      try { errObj = JSON.parse(errText); } catch { /* non-JSON body */ }
      if (errObj?.code === '57014' || String(errObj?.code) === '57014') {
        debugStep2Log('[ADDRESS_POINTS_FETCH_TIMEOUT]', { requestKey, status: response.status });
        timeoutedKeys.add(requestKey);
        return { rows: [], count: 0, bboxCount: 0, totalCount: 0, contentRangeCount: 0, renderedCount: 0, isTimeout: true };
      }

      debugStep2Warn('[ADDRESS_POINTS_ERROR] fetch failed', response.status, errText);
      throw new Error(errText || 'ADDRESS_POINTS_REST_ERROR');
    }

    const rows = await response.json();
    const contentRange = response.headers.get('content-range');
    let contentRangeCount = rows.length;
    if (contentRange) {
      const match = contentRange.match(/\/(\d+)/);
      if (match) contentRangeCount = parseInt(match[1], 10);
    }

    debugStep2Log(`[ADDRESS_POINTS_FETCH_SUCCESS] received ${rows.length} rows, total: ${contentRangeCount}`);

    const resultRows = rows
      .map((row) => ({
        ...row,
        distance_m: distanceMeters(centerLat, centerLng, Number(row.lat), Number(row.lng)),
      }))
      .filter((row) => Number.isFinite(row.distance_m) && row.distance_m <= radiusKm * 1000)
      .sort((a, b) => a.distance_m - b.distance_m);

    return {
      rows: resultRows,
      count: contentRangeCount,
      bboxCount: resultRows.length,
      totalCount: contentRangeCount,
      contentRangeCount,
      renderedCount: resultRows.length,
    };
  } catch (err) {
    // AbortError is expected on navigation/component-unmount — not an error
    if (err.name === 'AbortError') {
      debugStep2Log('[ADDRESS_POINTS_FETCH_ABORTED]');
      throw err;
    }
    debugStep2Warn('[ADDRESS_POINTS_ERROR]', err?.message || err);
    debugStep2Log('[ADDRESS_POINTS_FETCH_FALLBACK]');
    throw err;
  }
}

function firstFiniteNumber(...values) {
  for (const value of values) {
    if (value == null || value === '') continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return 0;
}

function distanceMeters(lat1, lng1, lat2, lng2) {
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return null;
  const toRad = (value) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
