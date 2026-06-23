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
  message: 'Dati civici non disponibili per questa zona',
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

export async function fetchAddressPointsInRadius({ centerLat, centerLng, radiusKm, signal }) {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return { rows: [], count: 0, bboxCount: 0, totalCount: 0, contentRangeCount: 0, renderedCount: 0 };
  }

  // Calculate bbox (1 degree lat is ~111km)
  const latDelta = radiusKm / 111.0;
  const lngDelta = radiusKm / (111.0 * Math.cos((centerLat * Math.PI) / 180));
  const minLat = centerLat - latDelta;
  const maxLat = centerLat + latDelta;
  const minLng = centerLng - lngDelta;
  const maxLng = centerLng + lngDelta;

  const generatedUrl = `${url}/rest/v1/address_points?select=*&source=eq.osm&lat=gte.${minLat}&lat=lte.${maxLat}&lng=gte.${minLng}&lng=lte.${maxLng}`;

  console.log(`[ADDRESS_POINTS_FETCH_BBOX] lat: [${minLat}, ${maxLat}], lng: [${minLng}, ${maxLng}], radiusKm: ${radiusKm}`);

  try {
    const response = await fetch(generatedUrl, {
      method: 'GET',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        'Range-Unit': 'items',
        'Range': '0-999',
        'Prefer': 'count=exact'
      },
      signal
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("[ADDRESS_POINTS_ERROR] fetch failed", errText);
      throw new Error(errText || 'ADDRESS_POINTS_REST_ERROR');
    }

    const rows = await response.json();
    const contentRange = response.headers.get('content-range');
    let contentRangeCount = rows.length;
    if (contentRange) {
      const match = contentRange.match(/\/(\d+)/);
      if (match) contentRangeCount = parseInt(match[1], 10);
    }

    console.log(`[ADDRESS_POINTS_FETCH_SUCCESS] received ${rows.length} rows, content-range count: ${contentRangeCount}`);

    const resultRows = rows
      .map((row) => ({
        ...row,
        distance_m: distanceMeters(centerLat, centerLng, Number(row.lat), Number(row.lng)),
      }))
      .filter((row) => Number.isFinite(row.distance_m) && row.distance_m <= radiusKm * 1000)
      .sort((a, b) => a.distance_m - b.distance_m);

    const bboxCount = resultRows.length;

    return {
      rows: resultRows,
      count: contentRangeCount,
      bboxCount,
      totalCount: contentRangeCount,
      contentRangeCount,
      renderedCount: resultRows.length,
    };
  } catch (err) {
    console.error("[ADDRESS_POINTS_ERROR]", err?.message || err);
    console.log("[ADDRESS_POINTS_FETCH_FALLBACK]");
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
