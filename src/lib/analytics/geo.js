// Analytics Visitatori — lettura geo APPROSSIMATIVA dagli header Vercel.
// Solo country / region / city. MAI IP, coordinate, CAP, indirizzo. PURO.
//
// Header Vercel (presenti su qualunque piano dentro una Function):
//   x-vercel-ip-country         ISO-2 (es. "IT")
//   x-vercel-ip-country-region  codice regione (es. "25" / "LOM")
//   x-vercel-ip-city            città (url-encoded, es. "Milano")
//
// L'IP (x-forwarded-for / x-real-ip / x-vercel-forwarded-for) NON viene MAI
// letto né restituito da questo modulo.

function headerGet(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === 'function') return headers.get(name);
  // oggetto piatto (Vercel Node req.headers)
  const v = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : (v ?? null);
}

function decodeCity(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let v = raw;
  try { v = decodeURIComponent(raw); } catch { /* lascia raw */ }
  v = v.replace(/\s+/g, ' ').trim();
  // scarta valori palesemente non-città
  if (!v || v.length > 80 || /\d{4,}/.test(v)) return null;
  return v;
}

export function readVercelGeo(headers) {
  const countryRaw = headerGet(headers, 'x-vercel-ip-country');
  const regionRaw = headerGet(headers, 'x-vercel-ip-country-region');
  const cityRaw = headerGet(headers, 'x-vercel-ip-city');

  const country = typeof countryRaw === 'string'
    ? countryRaw.slice(0, 2).toUpperCase().replace(/[^A-Z]/g, '') || null
    : null;
  const region = typeof regionRaw === 'string'
    ? regionRaw.replace(/\s+/g, ' ').trim().slice(0, 80) || null
    : null;
  const city = decodeCity(cityRaw);

  if (!country && !region && !city) return null;
  return { country: country || null, region: region || null, city: city || null };
}

// Etichette regione IT più leggibili quando l'header dà un codice numerico ISO
// 3166-2:IT (25 = Lombardia, ecc.). Opzionale: se non mappata si tiene il raw.
const IT_REGION_BY_CODE = Object.freeze({
  21: 'Piemonte', 23: "Valle d'Aosta", 25: 'Lombardia', 32: 'Trentino-Alto Adige',
  34: 'Veneto', 36: 'Friuli-Venezia Giulia', 42: 'Liguria', 45: 'Emilia-Romagna',
  52: 'Toscana', 55: 'Umbria', 57: 'Marche', 62: 'Lazio', 65: 'Abruzzo',
  67: 'Molise', 72: 'Campania', 75: 'Puglia', 77: 'Basilicata', 78: 'Calabria',
  82: 'Sicilia', 88: 'Sardegna',
});

export function prettyRegion(country, region) {
  if (!region) return null;
  if (country === 'IT' && /^\d{1,2}$/.test(region)) return IT_REGION_BY_CODE[Number(region)] || region;
  return region;
}
