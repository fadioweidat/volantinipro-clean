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

// TICKET — WATERMARK FOTO CLIENTE (Fase 4): reverse geocoding NON bloccante
// per il watermark delle foto di consegna (proof_photos non ha colonne
// indirizzo). Stesso provider/endpoint gia' usato in produzione (Nominatim),
// ma:
//   - time-boxed via AbortController: mai un'attesa indefinita, l'upload non
//     si ferma mai per colpa di questa chiamata;
//   - fail-closed: qualunque errore (timeout, 429, rete, CORS, risposta
//     incompleta) -> null. Il chiamante ripiega sulle coordinate REALI, mai
//     su un indirizzo inventato;
//   - ritorna solo componenti reali della risposta (road/house_number/
//     city|town|village), nessuna euristica che "indovina" una via.
export async function reverseGeocode(lat, lng, { timeoutMs = 3500 } = {}) {
  if (lat == null || lng == null) return null; // Number(null) === 0: mai coerce silenzioso
  const nlat = Number(lat);
  const nlng = Number(lng);
  if (!Number.isFinite(nlat) || !Number.isFinite(nlng) || (nlat === 0 && nlng === 0)) return null;
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${nlat}&lon=${nlng}&format=jsonv2&addressdetails=1&zoom=18&accept-language=it`;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), Math.max(500, timeoutMs)) : null;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'VolantiniPro/1.0' },
      ...(controller ? { signal: controller.signal } : {}),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const a = (data && data.address) || {};
    const street = a.road || a.pedestrian || a.footway || a.residential || null;
    const houseNumber = a.house_number || null;
    const city = a.city || a.town || a.village || a.municipality || a.hamlet || null;
    if (!street && !city) return null;
    return { street: street || null, houseNumber: houseNumber || null, city: city || null };
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
