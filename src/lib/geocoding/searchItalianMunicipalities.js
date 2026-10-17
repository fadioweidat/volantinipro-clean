// Comune autocomplete shared by Quick Quote and the homepage calculator.
//
// Source order:
//   1) Supabase RPC search_municipalities(prefix) — ISTAT comuni, prefix match
//      ("Corm" -> Cormano). Read-only GET with the public anon key.
//   2) Nominatim (the previous source) — used automatically when the RPC is
//      not deployed yet, errors, times out or has no match, so the site works
//      both before and after the migration.
// Both paths return the same suggestion shape and go through the same ranking.
import { normalizeNominatimGeocodeResult } from "./canonicalizeItalianMunicipalityName.js";

const RPC_TIMEOUT_MS = 4000;
// Set once the RPC answers "function not found": skip it for the rest of the session.
let rpcMissing = false;

// Ranking client-side dei suggerimenti Nominatim: il provider ordina per
// "importance" (popolazione/rilevanza OSM), non per aderenza al testo
// digitato — per query brevi questo puo' mettere un capoluogo (es. "Varese")
// prima del comune con corrispondenza esatta/prefisso (es. "Varedo").
// Riordina soltanto i risultati gia' restituiti dal provider: nessun comune
// inventato o aggiunto.
export function rankMunicipalitySuggestions(list, query) {
  const q = String(query || "").trim().toLowerCase();
  const rank = (s) => {
    const name = String(s.name || "").toLowerCase();
    if (name === q) return 0;
    if (name.startsWith(q)) return 1;
    if (name.includes(q)) return 2;
    return 3;
  };
  return [...list].sort((a, b) => rank(a) - rank(b));
}

function supabaseEnv() {
  try {
    return { url: import.meta.env.VITE_SUPABASE_URL, anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY };
  } catch {
    if (typeof process !== "undefined" && process.env) {
      return { url: process.env.VITE_SUPABASE_URL, anonKey: process.env.VITE_SUPABASE_ANON_KEY };
    }
    return { url: undefined, anonKey: undefined };
  }
}

/** Maps a search_municipalities row to the suggestion shape used by both UIs. */
export function mapMunicipalityRow(row) {
  const coord = (value) => (value === null || value === undefined || value === "" ? NaN : Number(value));
  const lat = coord(row?.centroid_lat);
  const lng = coord(row?.centroid_lng);
  const name = String(row?.municipality_name || "").trim();
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    id: `istat:${row.province_code || ""}:${name.toLowerCase()}`,
    name,
    fullName: row.province_name ? `${name}, ${row.province_name}` : name,
    label: name,
    city: name,
    province: row.province_name || null,
    provinceCode: row.province_code || null,
    countryCode: "it",
    lat,
    lng,
    placeType: "municipality",
    source: "istat",
  };
}

/** @returns {Promise<Array|null>} rows, or null when the RPC is unavailable (caller falls back). */
export async function searchMunicipalitiesRpc(query, { fetchImpl = fetch, env = supabaseEnv(), signal } = {}) {
  const q = String(query || "").trim();
  if (rpcMissing || q.length < 2 || !env?.url || !env?.anonKey) return null;
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), RPC_TIMEOUT_MS) : null;
  const onAbort = () => controller?.abort();
  signal?.addEventListener?.("abort", onAbort);
  try {
    const res = await fetchImpl(`${env.url}/rest/v1/rpc/search_municipalities?prefix=${encodeURIComponent(q)}`, {
      method: "GET",
      headers: { apikey: env.anonKey, Authorization: `Bearer ${env.anonKey}`, Accept: "application/json" },
      signal: controller?.signal,
    });
    if (!res?.ok) {
      if (res?.status === 404) rpcMissing = true; // PGRST202: migration not applied yet
      return null;
    }
    const rows = await res.json();
    if (!Array.isArray(rows)) return null;
    return rows.map(mapMunicipalityRow).filter(Boolean);
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
    signal?.removeEventListener?.("abort", onAbort);
  }
}

async function searchNominatim(query, { signal, language, fetchImpl = fetch } = {}) {
  // `language` (optional) asks Nominatim for localised names (e.g. "it" ->
  // province "Milano" instead of "Milan"); omitted, the query is unchanged.
  const languageParam = language ? `&accept-language=${encodeURIComponent(language)}` : "";
  const r = await fetchImpl(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&countrycodes=it&format=json&addressdetails=1&limit=6&featuretype=city${languageParam}`, { signal });
  const d = await r.json();
  return d.map((f) => normalizeNominatimGeocodeResult(f, { addressLike: false }));
}

/** @returns {Promise<Array>} normalised, ranked suggestions (throws only if the Nominatim fallback fails) */
export async function searchItalianMunicipalities(query, { signal, language, fetchImpl = fetch, env } = {}) {
  const fromRpc = await searchMunicipalitiesRpc(query, { fetchImpl, env, signal });
  if (fromRpc && fromRpc.length > 0) return rankMunicipalitySuggestions(fromRpc, query);
  const fromNominatim = await searchNominatim(query, { signal, language, fetchImpl });
  return rankMunicipalitySuggestions(fromNominatim, query);
}

// Test hook: reset the per-session "RPC missing" memo.
export function __resetMunicipalitySearchForTests() {
  rpcMissing = false;
}
