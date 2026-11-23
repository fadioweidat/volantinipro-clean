// Oss. 2 (collaudo 2026-11-23): il punto manuale prendeva sempre il comune
// "Milano" (o quello gia' scelto), anche toccando la mappa fuori citta'.
// Ricava il comune dalle coordinate: Mapbox (stesso token della ricerca),
// poi Nominatim. Nessun dato inventato: se entrambi falliscono -> null e il
// chiamante tiene il comportamento precedente.
function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise(resolve => { timer = setTimeout(() => resolve(null), ms); })
  ]).finally(() => clearTimeout(timer));
}

export async function reverseGeocodeComune({ lat, lng, mapboxToken = null, fetchImpl = globalThis.fetch, timeoutMs = 4000 } = {}) {
  const la = Number(lat), lo = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(lo) || typeof fetchImpl !== "function") return null;
  if (mapboxToken) {
    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lo},${la}.json?access_token=${mapboxToken}&types=place&country=IT&language=it&limit=1`;
      const res = await withTimeout(fetchImpl(url), timeoutMs);
      if (res && res.ok) {
        const d = await res.json();
        const name = String(d?.features?.[0]?.text || "").trim();
        if (name) return { name, source: "mapbox" };
      }
    } catch { /* passa a Nominatim */ }
  }
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${la}&lon=${lo}&format=json&zoom=10&accept-language=it`;
    const res = await withTimeout(fetchImpl(url), timeoutMs);
    if (res && res.ok) {
      const d = await res.json();
      const a = d?.address || {};
      const name = String(a.city || a.town || a.village || a.municipality || "").trim();
      if (name) return { name, source: "nominatim" };
    }
  } catch { /* nessun comune */ }
  return null;
}
