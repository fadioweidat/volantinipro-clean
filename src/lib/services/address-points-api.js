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

export async function fetchAddressPointsInRadius({ centerLat, centerLng, radiusKm }) {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return { rows: [], count: 0, bboxCount: 0, totalCount: 0, contentRangeCount: 0, renderedCount: 0 };
  }

  const generatedUrl = `${url}/rest/v1/rpc/get_address_points_osm_in_radius`;

  const response = await fetch(generatedUrl, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      center_lat: centerLat,
      center_lng: centerLng,
      radius_km: radiusKm,
      max_rows: 500,
    }),
  });

  const body = await response.text();
  let rows = null;
  try {
    rows = body ? JSON.parse(body) : null;
  } catch {
    rows = body;
  }
  if (!response.ok) {
    console.error("[ADDRESS_POINTS_ERROR]", rows?.message || rows || 'ADDRESS_POINTS_REST_ERROR', response, response.status, rows);
    throw new Error(rows?.message || 'ADDRESS_POINTS_REST_ERROR');
  }

  const resultRows = Array.isArray(rows)
    ? rows
        .map((row) => ({
          ...row,
          distance_m: row.distance_m != null
            ? Number(row.distance_m)
            : distanceMeters(centerLat, centerLng, Number(row.lat), Number(row.lng)),
        }))
        .filter((row) => Number.isFinite(row.distance_m))
        .sort((a, b) => a.distance_m - b.distance_m)
    : [];

  const bboxCount = resultRows.length;

  return {
    rows: resultRows,
    count: bboxCount,
    bboxCount,
    totalCount: bboxCount,
    contentRangeCount: null,
    renderedCount: resultRows.length,
  };
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
