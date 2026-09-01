// Nucleo puro (nessun import Deno) del proxy Overpass "ricerca POI / attivita'"
// usato dal configuratore Step2 (usePoi -> src/lib/services/poi-api.js).
// Testabile da node:test via tsx — l'endpoint `poi-search/index.ts` e' solo il
// guscio Deno (serve + rate limit + cache) sopra queste funzioni.
//
// Gemello di _shared/roadNetworkProxy.ts: riusa da quel modulo le primitive
// generiche (fetchRoadsWithFallback, resolveEndpoints, createTtlCache, djb2).
// Qui vivono solo le parti specifiche dei POI: tag-set per servizio/target,
// validazione input, query builder, cap risultati.
//
// Regole di sicurezza (ticket §9):
// - Gli endpoint Overpass sono HARDCODED lato server (roadNetworkProxy.ts),
//   MAI passati dal client.
// - Il client passa SOLO { centerLat, centerLng, radiusKm, serviceType,
//   targetSelection }. La Overpass QL e' costruita interamente qui: i tag
//   `key`/`val` provengono da un'allowlist server-side (POI_TAGS), mai
//   dall'input. Nessuna QL arbitraria dal browser.
// - Ogni campo e' validato per tipo, range e forma prima dell'uso.

// ── Servizi supportati ─────────────────────────────────────────────────────
export const POI_SERVICE_TYPES = ['d2d', 'h2h', 'b2b'] as const;
export type PoiServiceType = (typeof POI_SERVICE_TYPES)[number];

// ── Ordine provider Overpass SPECIFICO per poi-search ─────────────────────
// Override locale del default condiviso (_shared/roadNetworkProxy.ts, che
// resta invariato per road-network). Motivo (audit 502): overpass.kumi.systems
// e' attualmente non responsivo e, essendo primo nel default condiviso,
// bruciava l'intero timeout su OGNI richiesta prima del fallback. Qui:
//   1. overpass-api.de       (di norma 200 in 2-8s)
//   2. overpass.private.coffee
//   3. overpass.kumi.systems (ultimo: se e' morto costa comunque solo l'ultimo giro)
export const POI_OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

/**
 * Come resolveEndpoints di roadNetworkProxy, ma sull'ordine POI: eventuale
 * OVERPASS_ENDPOINT (env server) prima, poi POI_OVERPASS_ENDPOINTS. Solo
 * https://, nessun duplicato.
 */
export function resolvePoiEndpoints(envEndpoint?: string | null): string[] {
  const list: string[] = [];
  const push = (u: unknown) => {
    const v = String(u || '').trim();
    if (v && /^https:\/\//i.test(v) && !list.includes(v)) list.push(v);
  };
  push(envEndpoint);
  for (const u of POI_OVERPASS_ENDPOINTS) push(u);
  return list;
}

// ── Vincoli input ─────────────────────────────────────────────────────────
export const POI_RADIUS_MIN_KM = 0.1;
export const POI_RADIUS_MAX_KM = 50;
export const POI_TARGET_MAX_ITEMS = 30;
export const POI_TARGET_KEY_RE = /^[a-z_]{1,40}$/;

// Cap risultati per `out center <n>` — identico ai valori usati finora dal
// client (poi-api.js: d2d 80, h2h/b2b 150).
export const POI_RESULT_CAP_D2D = 80;
export const POI_RESULT_CAP_DEFAULT = 150;
export function resultCap(serviceType: string): number {
  return serviceType === 'd2d' ? POI_RESULT_CAP_D2D : POI_RESULT_CAP_DEFAULT;
}

// Timeout QL Overpass, allineato al timeout *di rete* per provider
// (POI_SEARCH_TIMEOUT_MS = 12000 in poi-search/index.ts). Un mirror che non
// completa la query in 12s viene comunque scartato: worst case 3x12 = 36s
// invece di 3x25 = 75s.
export const POI_OVERPASS_QL_TIMEOUT_S = 12;

// ── Tag-set per servizio (allowlist server-side) ──────────────────────────
// SOLO `key`/`val` (guidano la QL) + `cat` (per il filtro per target).
// Colori/priorita' restano lato client (poi-api.js#toPoi). Il set di coppie
// `key:val` per servizio DEVE restare allineato al POI_TAGS del client:
// tests/poi_search_proxy.test.mjs verifica l'assenza di drift.
export interface PoiTag {
  key: string;
  val: string;
  cat: string;
}

export const POI_TAGS: Record<PoiServiceType, PoiTag[]> = {
  h2h: [
    { key: 'railway', val: 'station', cat: 'Stazione' },
    { key: 'railway', val: 'subway_entrance', cat: 'Metro' },
    { key: 'amenity', val: 'university', cat: 'Università' },
    { key: 'shop', val: 'mall', cat: 'Centro comm.' },
    { key: 'amenity', val: 'theatre', cat: 'Teatro' },
    { key: 'amenity', val: 'school', cat: 'Scuola' },
    { key: 'amenity', val: 'cinema', cat: 'Cinema' },
    { key: 'tourism', val: 'attraction', cat: 'Attrazione' },
    { key: 'amenity', val: 'marketplace', cat: 'Mercato' },
    { key: 'amenity', val: 'library', cat: 'Biblioteca' },
    { key: 'amenity', val: 'cafe', cat: 'Bar/Caffè' },
    { key: 'amenity', val: 'restaurant', cat: 'Ristorante' },
    { key: 'leisure', val: 'fitness_centre', cat: 'Palestra' },
    { key: 'leisure', val: 'sports_centre', cat: 'Centro sportivo' },
    { key: 'sport', val: 'fitness', cat: 'Palestra' },
    { key: 'sport', val: 'bodybuilding', cat: 'Palestra' },
    { key: 'sport', val: 'gymnastics', cat: 'Palestra' },
    { key: 'shop', val: 'hairdresser', cat: 'Parrucchiere' },
    { key: 'shop', val: 'beauty', cat: 'Centro estetico' },
    { key: 'amenity', val: 'pharmacy', cat: 'Farmacia' },
    { key: 'amenity', val: 'clinic', cat: 'Clinica' },
    { key: 'shop', val: 'supermarket', cat: 'Supermercato' },
  ],
  b2b: [
    { key: 'amenity', val: 'pharmacy', cat: 'Farmacia' },
    { key: 'shop', val: 'tobacco', cat: 'Tabacchi' },
    { key: 'amenity', val: 'bar', cat: 'Bar' },
    { key: 'shop', val: 'supermarket', cat: 'Supermercato' },
    { key: 'tourism', val: 'hotel', cat: 'Hotel' },
    { key: 'tourism', val: 'guest_house', cat: 'Struttura ricettiva' },
    { key: 'office', val: 'company', cat: 'Ufficio' },
    { key: 'office', val: 'financial', cat: 'Studio finanz.' },
    { key: 'office', val: 'lawyer', cat: 'Studio legale' },
    { key: 'office', val: 'accountant', cat: 'Commercialista' },
    { key: 'office', val: 'consulting', cat: 'Studio professionale' },
    { key: 'office', val: 'insurance', cat: 'Studio professionale' },
    { key: 'industrial', val: 'warehouse', cat: 'Capannone' },
    { key: 'building', val: 'warehouse', cat: 'Capannone' },
    { key: 'amenity', val: 'pub', cat: 'Pub' },
    { key: 'shop', val: 'clothes', cat: 'Abbigliamento' },
    { key: 'amenity', val: 'cafe', cat: 'Bar/Caffè' },
    { key: 'amenity', val: 'restaurant', cat: 'Ristorante' },
    { key: 'shop', val: 'hairdresser', cat: 'Parrucchiere' },
    { key: 'shop', val: 'convenience', cat: 'Negozio' },
    { key: 'amenity', val: 'school', cat: 'Scuola' },
    { key: 'amenity', val: 'university', cat: 'Università' },
    { key: 'leisure', val: 'fitness_centre', cat: 'Palestra' },
    { key: 'leisure', val: 'sports_centre', cat: 'Centro sportivo' },
    { key: 'sport', val: 'fitness', cat: 'Palestra' },
    { key: 'sport', val: 'bodybuilding', cat: 'Palestra' },
    { key: 'sport', val: 'gymnastics', cat: 'Palestra' },
    { key: 'shop', val: 'beauty', cat: 'Centro estetico' },
    { key: 'amenity', val: 'clinic', cat: 'Clinica' },
    { key: 'amenity', val: 'doctors', cat: 'Studio medico' },
    { key: 'amenity', val: 'dentist', cat: 'Studio medico' },
    { key: 'amenity', val: 'hospital', cat: 'Ospedale' },
    { key: 'shop', val: 'car', cat: 'Concessionaria' },
    { key: 'shop', val: 'car_repair', cat: 'Officina' },
    { key: 'office', val: 'estate_agent', cat: 'Immobiliare' },
  ],
  d2d: [
    { key: 'amenity', val: 'pharmacy', cat: 'Farmacia' },
    { key: 'shop', val: 'supermarket', cat: 'Supermercato' },
    { key: 'amenity', val: 'school', cat: 'Scuola' },
    { key: 'amenity', val: 'university', cat: 'Università' },
    { key: 'amenity', val: 'library', cat: 'Biblioteca' },
    { key: 'leisure', val: 'fitness_centre', cat: 'Palestra' },
    { key: 'leisure', val: 'sports_centre', cat: 'Centro sportivo' },
    { key: 'sport', val: 'fitness', cat: 'Palestra' },
    { key: 'sport', val: 'bodybuilding', cat: 'Palestra' },
    { key: 'sport', val: 'gymnastics', cat: 'Palestra' },
    { key: 'shop', val: 'mall', cat: 'Centro comm.' },
    { key: 'shop', val: 'convenience', cat: 'Negozio' },
    { key: 'shop', val: 'clothes', cat: 'Abbigliamento' },
    { key: 'amenity', val: 'restaurant', cat: 'Ristorante' },
    { key: 'amenity', val: 'cafe', cat: 'Bar/Caffè' },
    { key: 'shop', val: 'hairdresser', cat: 'Parrucchiere' },
    { key: 'shop', val: 'beauty', cat: 'Centro estetico' },
    { key: 'amenity', val: 'clinic', cat: 'Clinica' },
    { key: 'amenity', val: 'hospital', cat: 'Ospedale' },
    { key: 'shop', val: 'car', cat: 'Concessionaria' },
    { key: 'shop', val: 'car_repair', cat: 'Officina' },
    { key: 'office', val: 'estate_agent', cat: 'Immobiliare' },
    { key: 'amenity', val: 'post_office', cat: 'Ufficio postale' },
    { key: 'leisure', val: 'park', cat: 'Parco' },
    { key: 'amenity', val: 'place_of_worship', cat: 'Chiesa' },
  ],
};

// Mappa target -> categorie ammesse (allineata a TARGET_POI_CATEGORIES del
// client). "all"/"altro"/vuoto = tutte le categorie del servizio.
export const TARGET_POI_CATEGORIES: Record<string, string[]> = {
  ristorazione: ['Ristorante', 'Bar', 'Bar/Caffè', 'Pub', 'Mercato'],
  retail: ['Negozio', 'Supermercato', 'Centro comm.', 'Abbigliamento', 'Tabacchi'],
  sanitario: ['Farmacia', 'Clinica', 'Ospedale'],
  automotive: ['Officina', 'Concessionaria'],
  business: ['Ufficio'],
  hospitality: ['Hotel', 'Struttura ricettiva'],
  professional_services: ['Studio professionale', 'Studio legale', 'Commercialista', 'Studio finanz.'],
  industrial: ['Industria', 'Capannone'],
  scuole: ['Scuola'],
  universita: ['Università', 'Biblioteca'],
  stazioni: ['Stazione', 'Metro'],
  centri_commerciali: ['Centro comm.'],
  immobiliare: ['Immobiliare'],
  beauty: ['Parrucchiere', 'Centro estetico'],
  fitness: ['Palestra', 'Centro sportivo'],
};

/**
 * Restituisce i tag da interrogare, filtrati per target. Stessa logica di
 * getPoiTagsForTargets in src/lib/services/poi-api.js: se non ci sono target
 * (o c'e' 'all'/'altro', o nessuna categoria mappata) si interroga l'intero
 * set del servizio.
 */
export function getServiceTargetTags(serviceType: string, targetSelection: unknown): PoiTag[] {
  const serviceTags = POI_TAGS[(serviceType as PoiServiceType)] ?? POI_TAGS.h2h;
  const targets = Array.isArray(targetSelection)
    ? targetSelection.filter((t): t is string => typeof t === 'string' && t.length > 0)
    : [];
  if (targets.length === 0 || targets.includes('all') || targets.includes('altro')) return serviceTags;
  const allowed = new Set(targets.flatMap((t) => TARGET_POI_CATEGORIES[t] || []));
  if (allowed.size === 0) return serviceTags;
  return serviceTags.filter((tag) => allowed.has(tag.cat));
}

// ── Validazione input ─────────────────────────────────────────────────────
export interface PoiInput {
  centerLat: number;
  centerLng: number;
  radiusKm: number;
  serviceType: PoiServiceType;
  targetSelection: string[];
}
export type PoiInputValidation = { ok: true; input: PoiInput } | { ok: false; error: string };

export function validatePoiInput(raw: unknown): PoiInputValidation {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'BODY_NOT_OBJECT' };
  const r = raw as Record<string, unknown>;

  const centerLat = Number(r.centerLat);
  const centerLng = Number(r.centerLng);
  const radiusKm = Number(r.radiusKm);

  if (!Number.isFinite(centerLat) || centerLat < -90 || centerLat > 90) return { ok: false, error: 'BAD_CENTER_LAT' };
  if (!Number.isFinite(centerLng) || centerLng < -180 || centerLng > 180) return { ok: false, error: 'BAD_CENTER_LNG' };
  if (!Number.isFinite(radiusKm) || radiusKm < POI_RADIUS_MIN_KM || radiusKm > POI_RADIUS_MAX_KM) return { ok: false, error: 'BAD_RADIUS' };

  const serviceType = String(r.serviceType || '');
  if (!(POI_SERVICE_TYPES as readonly string[]).includes(serviceType)) return { ok: false, error: 'BAD_SERVICE_TYPE' };

  let targetSelection: string[] = [];
  if (r.targetSelection != null) {
    if (!Array.isArray(r.targetSelection)) return { ok: false, error: 'TARGET_NOT_ARRAY' };
    if (r.targetSelection.length > POI_TARGET_MAX_ITEMS) return { ok: false, error: 'TARGET_TOO_MANY' };
    targetSelection = r.targetSelection
      .filter((t): t is string => typeof t === 'string')
      .map((t) => t.trim())
      .filter((t) => POI_TARGET_KEY_RE.test(t));
  }

  return {
    ok: true,
    input: { centerLat, centerLng, radiusKm, serviceType: serviceType as PoiServiceType, targetSelection },
  };
}

// ── Query builder (server-controlled) ─────────────────────────────────────
/**
 * Overpass QL identica nella forma a quella usata finora dal client
 * (node+way per ogni tag, `out center <cap>`), ma costruita SOLO da valori
 * validati: `centerLat/Lng` numerici, `radiusKm` in range, `key/val` da
 * POI_TAGS (allowlist server). Nessun input testuale finisce nella QL.
 */
export function buildPoiQuery(opts: {
  centerLat: number;
  centerLng: number;
  radiusKm: number;
  tags: PoiTag[];
  cap: number;
}): string {
  const radiusM = Math.round(opts.radiusKm * 1000);
  const around = `(around:${radiusM},${opts.centerLat},${opts.centerLng})`;
  const parts = opts.tags.flatMap(({ key, val }) => [
    `node["${key}"="${val}"]${around};`,
    `way["${key}"="${val}"]${around};`,
  ]);
  return `[out:json][timeout:${POI_OVERPASS_QL_TIMEOUT_S}];\n(\n${parts.join('\n')}\n);\nout center ${Math.max(1, Math.round(opts.cap))};`;
}

// ── Chiave di cache ──────────────────────────────────────────────────────
// Coordinate arrotondate (~100m) + servizio + target ordinati: micro-scarti
// del geocoder non generano miss inutili.
export function makePoiCacheKey(input: PoiInput): string {
  const lat = input.centerLat.toFixed(3);
  const lng = input.centerLng.toFixed(3);
  const rad = (Math.round(input.radiusKm * 10) / 10).toString();
  const targets = [...input.targetSelection].sort().join(',') || '-';
  return `${input.serviceType}:${lat},${lng}:r${rad}:${targets}`;
}
