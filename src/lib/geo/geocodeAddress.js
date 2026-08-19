// Geocoder indirizzo -> punto (lat/lng). AUDIT (Fase 3 del ticket): nessun
// helper condiviso esisteva — Step2.jsx (configurator) chiama Nominatim
// inline in piu' punti con lo stesso pattern (search?q=...&countrycodes=it
// &format=json), ma non esporta nulla di riusabile e non viene toccato qui
// (componente monolitico enorme, out of scope per questo ticket). Questo
// modulo replica lo STESSO pattern/endpoint gia' validato in produzione,
// come funzione condivisa per i nuovi usi (Automatico Admin), invece di
// introdurre un secondo provider (Google Places/Mapbox non sono usati per
// questo scopo nel progetto).
export async function geocodeAddress(query) {
  const trimmed = String(query || '').trim();
  if (!trimmed) return null;
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(trimmed)}&countrycodes=it&format=json&addressdetails=1&limit=1`;
  const res = await fetch(url, { headers: { 'User-Agent': 'VolantiniPro/1.0' } });
  if (!res.ok) throw new Error('GEOCODE_HTTP_ERROR');
  const rows = await res.json();
  const first = Array.isArray(rows) ? rows[0] : null;
  const lat = Number(first?.lat);
  const lng = Number(first?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, label: first.display_name || trimmed };
}
