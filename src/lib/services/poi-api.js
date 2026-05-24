// Real POI data from OpenStreetMap via Overpass API.
// No API key required. Respects the /api/analysis/poi-search GeoJSON contract.

const OVERPASS_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_OVERPASS_ENDPOINT) ||
  'https://overpass-api.de/api/interpreter';

// ── Per-service POI tag definitions ─────────────────────────────────────────
// Each entry: Overpass key/value pair + display metadata + priority (1–10).
// Priority drives marker size and cluster prominence.
export const POI_TAGS = {
  h2h: [
    { key: 'railway', val: 'station',          cat: 'Stazione',          color: '#7C9EC4', priority: 10 },
    { key: 'railway', val: 'subway_entrance',  cat: 'Metro',             color: '#7C9EC4', priority: 10 },
    { key: 'amenity', val: 'university',       cat: 'Università',        color: '#C4956A', priority:  9 },
    { key: 'shop',    val: 'mall',             cat: 'Centro comm.',      color: '#6B9E8C', priority:  9 },
    { key: 'amenity', val: 'theatre',          cat: 'Teatro',            color: '#B8A27A', priority:  8 },
    { key: 'amenity', val: 'school',           cat: 'Scuola',            color: '#C4956A', priority:  8 },
    { key: 'amenity', val: 'cinema',           cat: 'Cinema',            color: '#B8A27A', priority:  7 },
    { key: 'tourism', val: 'attraction',       cat: 'Attrazione',        color: '#B8A27A', priority:  7 },
    { key: 'amenity', val: 'marketplace',      cat: 'Mercato',           color: '#6B9E8C', priority:  7 },
    { key: 'amenity', val: 'library',          cat: 'Biblioteca',        color: '#8A9EB8', priority:  6 },
    { key: 'amenity', val: 'cafe',             cat: 'Bar/Caffè',         color: '#7B9EC5', priority:  4 },
    { key: 'amenity', val: 'restaurant',       cat: 'Ristorante',        color: '#7B9EC5', priority:  4 },
  ],
  b2b: [
    { key: 'amenity', val: 'pharmacy',         cat: 'Farmacia',          color: '#6A9E82', priority:  9 },
    { key: 'shop',    val: 'tobacco',          cat: 'Tabacchi',          color: '#9E8A6A', priority:  9 },
    { key: 'amenity', val: 'bar',              cat: 'Bar',               color: '#7B9EC5', priority:  8 },
    { key: 'shop',    val: 'supermarket',      cat: 'Supermercato',      color: '#6B9E8C', priority:  8 },
    { key: 'tourism', val: 'hotel',            cat: 'Hotel',             color: '#8A9EB8', priority:  7 },
    { key: 'office',  val: 'company',          cat: 'Ufficio',           color: '#7A8A9E', priority:  7 },
    { key: 'office',  val: 'financial',        cat: 'Studio finanz.',    color: '#7A8A9E', priority:  7 },
    { key: 'amenity', val: 'pub',              cat: 'Pub',               color: '#7B9EC5', priority:  6 },
    { key: 'shop',    val: 'clothes',          cat: 'Abbigliamento',     color: '#6B9E8C', priority:  6 },
    { key: 'amenity', val: 'cafe',             cat: 'Bar/Caffè',         color: '#7B9EC5', priority:  6 },
    { key: 'amenity', val: 'restaurant',       cat: 'Ristorante',        color: '#7B9EC5', priority:  6 },
    { key: 'shop',    val: 'hairdresser',      cat: 'Parrucchiere',      color: '#9E8A6A', priority:  5 },
    { key: 'shop',    val: 'convenience',      cat: 'Negozio',           color: '#6B9E8C', priority:  5 },
  ],
  d2d: [
    { key: 'amenity', val: 'pharmacy',         cat: 'Farmacia',          color: '#6A9E82', priority:  8 },
    { key: 'shop',    val: 'supermarket',      cat: 'Supermercato',      color: '#6B9E8C', priority:  8 },
    { key: 'amenity', val: 'school',           cat: 'Scuola',            color: '#C4956A', priority:  7 },
    { key: 'amenity', val: 'post_office',      cat: 'Ufficio postale',   color: '#7A8A9E', priority:  7 },
    { key: 'leisure', val: 'park',             cat: 'Parco',             color: '#6A9E6A', priority:  5 },
    { key: 'amenity', val: 'place_of_worship', cat: 'Chiesa',            color: '#9E8A6A', priority:  4 },
  ],
};

export function getPoiTagsForService(svcType) {
  return POI_TAGS[svcType] ?? POI_TAGS.h2h;
}

// ── Overpass QL builder ──────────────────────────────────────────────────────
function buildQuery(tags, centerLat, centerLng, radiusM, maxResults) {
  const around = `(around:${Math.round(radiusM)},${centerLat},${centerLng})`;
  const parts = tags.flatMap(({ key, val }) => [
    `node["${key}"="${val}"]${around};`,
    `way["${key}"="${val}"]${around};`,
  ]);
  return `[out:json][timeout:20];\n(\n${parts.join('\n')}\n);\nout center ${maxResults};`;
}

// ── Overpass element → internal POI object ───────────────────────────────────
function toPoi(el, tags) {
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (!lat || !lon) return null;

  let tagConfig = null;
  for (const tc of tags) {
    if (el.tags?.[tc.key] === tc.val) { tagConfig = tc; break; }
  }
  if (!tagConfig) return null;

  const street = el.tags?.['addr:street'];
  const num    = el.tags?.['addr:housenumber'];
  const city   = el.tags?.['addr:city'];
  const addressParts = [street && num ? `${street} ${num}` : street, city].filter(Boolean);

  return {
    id:           `${el.type}/${el.id}`,
    lat,
    lng:          lon,
    name:         el.tags?.name || el.tags?.['name:it'] || tagConfig.cat,
    category:     tagConfig.cat,
    color:        tagConfig.color,
    priority:     tagConfig.priority,
    address:      addressParts.join(', ') || null,
    website:      el.tags?.website || el.tags?.['contact:website'] || null,
    openingHours: el.tags?.opening_hours || null,
  };
}

// ── Dedup by rounded coordinates (~1m grid) ──────────────────────────────────
function dedup(pois) {
  const seen = new Set();
  return pois.filter(p => {
    const k = `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch real POI from Overpass for the given service type and area.
 * Returns Array<{id, lat, lng, name, category, color, priority, address, ...}>
 * Throws on timeout / network failure — caller (usePoi) handles errors.
 */
export async function fetchPois({ centerLat, centerLng, radiusKm = 5, serviceType }) {
  const tags       = getPoiTagsForService(serviceType);
  const radiusM    = radiusKm * 1000;
  const maxResults = serviceType === 'd2d' ? 80 : 150;
  const query      = buildQuery(tags, centerLat, centerLng, radiusM, maxResults);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 18_000);

  try {
    const res = await fetch(OVERPASS_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    `data=${encodeURIComponent(query)}`,
      signal:  ctrl.signal,
    });
    if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);

    const data = await res.json();
    const raw  = (data.elements || []).map(el => toPoi(el, tags)).filter(Boolean);

    return dedup(raw).sort((a, b) => b.priority - a.priority);
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('OVERPASS_TIMEOUT');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * GeoJSON FeatureCollection wrapper — matches the /api/analysis/poi-search contract.
 * Optionally filter by category names.
 */
export async function fetchPoisGeoJSON({ centerLat, centerLng, radiusKm, serviceType, categories }) {
  const pois     = await fetchPois({ centerLat, centerLng, radiusKm, serviceType });
  const filtered = categories?.length
    ? pois.filter(p => categories.includes(p.category))
    : pois;

  return {
    type: 'FeatureCollection',
    features: filtered.map(p => ({
      type:       'Feature',
      geometry:   { type: 'Point', coordinates: [p.lng, p.lat] },
      properties: { ...p },
    })),
  };
}
