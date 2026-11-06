// STRADARIO UFFICIALE DEI CIVICI DEL COMUNE DI MILANO (2026-11-06).
//
// Fonte: Comune di Milano, Open Data, dataset ds634 "Numeri civici con
// coordinate geografiche" (licenza CC BY 4.0), risorsa CSV con datastore
// CKAN interrogabile dal browser (CORS "*"). Aggiornamento verificato:
// 2026-10-04 (estrazione 2026-10-01), 65.160 civici, 4.030 vie, stati
// "Applicato", "Iter in corso", "In attesa Fine Lavori".
//
// Serve a VERIFICARE un civico: le coordinate restituite sono quelle del
// civico registrato dal Comune, mai il centro della via, del quartiere o del
// comune. Se la via esiste ma il numero no, lo si dichiara (con l'intervallo
// dei civici presenti) invece di accettare un punto stimato da un geocoder.
// Esempio: nel dataset consultato Viale Certosa arriva al 316; l'assenza
// di 330 nel registro non dimostra da sola che il civico non esista.
// Una coordinata proposta da un geocoder non e' una verifica comunale.

export const MILANO_CIVIC_REGISTRY = Object.freeze({
  endpoint: "https://dati.comune.milano.it/api/3/action/datastore_search_sql",
  resourceId: "533b4e63-3d78-4bb5-aeb4-6c5f648f7f21",
  sourceLabel: "Comune di Milano - Numeri civici (Open Data, CC BY 4.0)",
  datasetUrl: "https://dati.comune.milano.it/dataset/ds634-numeri-civici-coordinate",
});

export const CIVIC_REGISTRY_STATUS = Object.freeze({
  VERIFIED: "verified",
  NOT_IN_REGISTRY: "not_in_registry",
  STREET_NOT_FOUND: "street_not_found",
  AMBIGUOUS_STREET: "ambiguous_street",
  UNAVAILABLE: "unavailable",
});

// Tipi di via del dataset (campo TIPO), con le forme digitate dagli utenti.
const STREET_TYPES = {
  via: "Via", viale: "Viale", corso: "Corso", piazza: "Piazza", piazzale: "Piazzale", largo: "Largo",
  galleria: "Galleria", alzaia: "Alzaia", ripa: "Ripa", vicolo: "Vicolo", foro: "Foro", bastioni: "Bastioni",
  piazzetta: "Piazzetta", passaggio: "Passaggio", strada: "Strada", parco: "Parco",
  "v.le": "Viale", "c.so": "Corso", "p.za": "Piazza", "p.zza": "Piazza", "p.le": "Piazzale",
};

/**
 * Civico canonico: { number, letter, barra }.
 *  "330" -> 330; "12/A", "12 a", "12A" -> 12 + A; "24/6" -> 24 barra 6.
 * La barra numerica NON viene fusa col numero ("24/6" non e' "246").
 */
export function parseCivicNumber(value) {
  const s = String(value ?? "").toUpperCase().replace(/\s+/g, "").replace(/^0+(?=\d)/, "");
  const m = s.match(/^(\d{1,4})(?:\/?([A-Z]))?(?:\/(\d{1,3}))?$/);
  if (!m) return null;
  return { number: Number(m[1]), letter: m[2] || "", barra: m[3] || "" };
}

export function formatCivicNumber(civic) {
  if (!civic) return "";
  return `${civic.number}${civic.letter || ""}${civic.barra ? `/${civic.barra}` : ""}`;
}

function sqlText(value) {
  // Solo lettere, cifre, spazi e apostrofo; l'apostrofo viene raddoppiato.
  return String(value).replace(/[^A-Z0-9' ]/g, "").replace(/'/g, "''");
}

function upperName(value) {
  return String(value ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[’`]/g, "'")
    .replace(/[^A-Z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** "Viale Certosa" -> { type: "Viale", name: "CERTOSA" }; null se manca il tipo. */
export function splitStreet(street) {
  const s = String(street ?? "").trim().replace(/\s+/g, " ");
  const m = s.match(/^(v\.le|c\.so|p\.zza|p\.za|p\.le|[a-zà-ü]+)\s+(.+)$/i);
  if (!m) return null;
  const type = STREET_TYPES[m[1].toLowerCase()];
  const name = upperName(m[2]);
  if (!type || !name) return null;
  return { type, name };
}

const LOWER_PARTICLES = new Set(["di", "del", "della", "delle", "dei", "degli", "dello", "da", "dal", "dalla", "e", "in", "al", "alla", "alle", "ai", "agli", "allo", "sul", "sulla"]);
function titleCase(value) {
  return String(value || "").toLowerCase().split(" ")
    .map((w, i) => (i > 0 && LOWER_PARTICLES.has(w) ? w : w.replace(/(^|['-])([a-zà-ü])/g, (a, p, c) => p + c.toUpperCase())))
    .join(" ");
}

function streetCondition(type, name) {
  // il tipo arriva solo dalla lista STREET_TYPES (valori fissi del dataset)
  const t = Object.values(STREET_TYPES).includes(type) ? type : "Via";
  const n = sqlText(name);
  return `"TIPO"='${t}' AND ("OPENSTREETMAP"='${n}' OR "DESCRITTIVO"='${n}' OR "DENOMINAZIONE"='${n}' OR "DENOMINAZIONE" LIKE '${n} %' OR "OPENSTREETMAP" LIKE '% ${n}')`;
}

async function runSql(sql, { fetchImpl, signal }) {
  const url = `${MILANO_CIVIC_REGISTRY.endpoint}?sql=${encodeURIComponent(sql)}`;
  const res = await fetchImpl(url, { signal });
  if (!res.ok) throw new Error(`REGISTRY_HTTP_${res.status}`);
  const body = await res.json();
  if (!body?.success || !Array.isArray(body?.result?.records)) throw new Error("REGISTRY_BAD_RESPONSE");
  return body.result.records;
}

function exactNameMatch(record, name) {
  return [record.OPENSTREETMAP, record.DESCRITTIVO, record.DENOMINAZIONE].some(v => upperName(v) === name);
}

/**
 * Verifica street + numero nello stradario ufficiale.
 * @returns {Promise<{status, result?, street?, range?, reason?}>}
 *  result (solo se VERIFIED): suggerimento pronto per Step 2, coordinate del civico.
 */
export async function lookupMilanoCivic({ street, number }, { fetchImpl = globalThis.fetch, signal, timeoutMs = 6000 } = {}) {
  const parts = splitStreet(street);
  const civic = parseCivicNumber(number);
  if (!parts || !civic) return { status: CIVIC_REGISTRY_STATUS.STREET_NOT_FOUND, reason: "query_not_parsable" };
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const onAbort = () => controller?.abort();
  signal?.addEventListener?.("abort", onAbort);
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  const opts = { fetchImpl, signal: controller?.signal };
  const R = `"${MILANO_CIVIC_REGISTRY.resourceId}"`;
  try {
    // 1) vie candidate (una riga per via)
    const streets = await runSql(`SELECT "CODICE_VIA","TIPO","DENOMINAZIONE","OPENSTREETMAP","DESCRITTIVO",min("NUMERO") AS minn,max("NUMERO") AS maxn,count(*) AS n FROM ${R} WHERE ${streetCondition(parts.type, parts.name)} GROUP BY 1,2,3,4,5`, opts);
    if (!streets.length) return { status: CIVIC_REGISTRY_STATUS.STREET_NOT_FOUND };
    const exact = streets.filter(s => exactNameMatch(s, parts.name));
    const chosen = exact.length ? exact : streets;
    const codes = [...new Set(chosen.map(s => String(s.CODICE_VIA)))];
    if (codes.length !== 1) {
      return { status: CIVIC_REGISTRY_STATUS.AMBIGUOUS_STREET, streets: chosen.map(s => `${s.TIPO} ${titleCase(s.OPENSTREETMAP || s.DESCRITTIVO)}`) };
    }
    const via = chosen[0];
    const streetLabel = `${via.TIPO} ${titleCase(via.OPENSTREETMAP || via.DESCRITTIVO || via.DENOMINAZIONE)}`;
    const range = { min: Number(via.minn), max: Number(via.maxn), count: Number(via.n) };
    // 2) civico esatto su quella via (numero + lettera + barra)
    const rows = await runSql(`SELECT "NUMEROCOMPLETO","NUMERO","LETTERA","BARRA","BARRA2","STATOCIVICO","NIL","MUNICIPIO","LAT_WGS84","LONG_WGS84" FROM ${R} WHERE "CODICE_VIA"=${Number(via.CODICE_VIA)} AND "NUMERO"=${civic.number}`, opts);
    const same = r => String(r.LETTERA || "").trim().toUpperCase() === civic.letter && String(r.BARRA || "").trim() === civic.barra;
    const candidates = rows.filter(same).sort((a, b) => String(a.BARRA2 || "").trim().length - String(b.BARRA2 || "").trim().length);
    const hit = candidates[0];
    const lat = Number(hit?.LAT_WGS84);
    const lng = Number(hit?.LONG_WGS84);
    if (!hit || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      // Percorso della via dai civici ufficiali (lato pari, poi tutti se troppo
      // pochi): serve SOLO a inquadrare la mappa per la scelta manuale, mai
      // come posizione del civico richiesto.
      let streetPath = null;
      try {
        const pts = await runSql(`SELECT "NUMERO","LAT_WGS84","LONG_WGS84" FROM ${R} WHERE "CODICE_VIA"=${Number(via.CODICE_VIA)} ORDER BY "NUMERO"`, opts);
        const valid = pts.map(p => ({ n: Number(p.NUMERO), lat: Number(p.LAT_WGS84), lng: Number(p.LONG_WGS84) })).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
        const even = valid.filter(p => p.n % 2 === 0);
        const line = (even.length >= 2 ? even : valid).map(p => [p.lng, p.lat]);
        if (line.length >= 2) streetPath = { type: "LineString", coordinates: line };
      } catch { /* inquadratura non indispensabile */ }
      return { status: CIVIC_REGISTRY_STATUS.NOT_IN_REGISTRY, street: streetLabel, range, requested: formatCivicNumber(civic), streetPath };
    }
    const houseNumber = formatCivicNumber(civic);
    const label = `${streetLabel} ${houseNumber}, Milano`;
    return {
      status: CIVIC_REGISTRY_STATUS.VERIFIED,
      street: streetLabel,
      range,
      result: {
        id: `comune-milano:${via.CODICE_VIA}:${hit.NUMEROCOMPLETO}`,
        name: label, fullName: `${label}, Lombardia, Italia`, label: `${streetLabel} ${houseNumber}`, displayName: label,
        street: streetLabel, houseNumber, city: "Milano", comune: "Milano", provincia: "MI", parentComune: "Milano",
        nil: hit.NIL || null, municipio: hit.MUNICIPIO ?? null, civicStatus: hit.STATOCIVICO || null,
        lat, lng, placeType: "address", precision: "address", source: "comune_milano",
        verification: "official_registry", sourceLabel: MILANO_CIVIC_REGISTRY.sourceLabel,
      },
    };
  } catch (err) {
    return { status: CIVIC_REGISTRY_STATUS.UNAVAILABLE, reason: err?.name === "AbortError" ? "timeout" : String(err?.message || err) };
  } finally {
    if (timer) clearTimeout(timer);
    signal?.removeEventListener?.("abort", onAbort);
  }
}

/** Messaggio per l'utente quando il civico non e' verificabile nello stradario. */
export function describeRegistryOutcome(outcome, requested) {
  if (!outcome) return null;
  if (outcome.status === CIVIC_REGISTRY_STATUS.NOT_IN_REGISTRY) {
    const r = outcome.range;
    return `${outcome.street} ${outcome.requested || requested || ""}: numero civico non verificato nel dataset del Comune di Milano.${r ? ` Su questa via il numero più alto registrato è ${r.max}.` : ""} Questo non prova che il civico non esista. Seleziona il punto sulla mappa.`.replace(/\s+/g, " ");
  }
  if (outcome.status === CIVIC_REGISTRY_STATUS.AMBIGUOUS_STREET) {
    return `Più vie corrispondono al nome cercato (${(outcome.streets || []).slice(0, 3).join(", ")}). Scrivi il nome completo della via.`;
  }
  return null;
}

function isProviderCivicFor(query, suggestion, matches) {
  const hasNumber = String(suggestion?.houseNumber ?? suggestion?.address?.house_number ?? "").trim() !== "";
  return hasNumber && suggestion?.verification !== "official_registry" && matches(query, suggestion);
}

/**
 * Combina i suggerimenti dei geocoder con l'esito dello stradario ufficiale:
 *  - VERIFIED: il civico ufficiale va in testa; i punti dei provider per lo
 *    stesso civico vengono tolti (le coordinate valide sono quelle del Comune);
 *  - NOT_IN_REGISTRY: i provider possono restituire un candidato, ma NON e'
 *    verificato: si mostra solo come punto indicativo per la scelta manuale.
 *    Non viene mai selezionato automaticamente come civico ufficiale;
 *  - altri esiti (via non trovata, ambigua, servizio non raggiungibile):
 *    suggerimenti invariati, con la regola civico dei provider.
 * `matches` = matchesRequestedCivic (iniettata per tenere il modulo senza dipendenze).
 */
export function applyRegistryOutcome(suggestions, outcome, query, matches) {
  const list = Array.isArray(suggestions) ? suggestions : [];
  if (!outcome) return list;
  if (outcome.status === CIVIC_REGISTRY_STATUS.VERIFIED && outcome.result) {
    return [outcome.result, ...list.filter(s => !isProviderCivicFor(query, s, matches))];
  }
  if (outcome.status === CIVIC_REGISTRY_STATUS.NOT_IN_REGISTRY) {
    return list.map(s => isProviderCivicFor(query, s, matches)
      ? { ...s, verification: "provider_civic", needsMapConfirmation: true }
      : s);
  }
  return list;
}

/** Il civico va controllato nello stradario di Milano? Solo se non e' indicato un altro comune. */
export function shouldCheckMilanoRegistry(civicRequest, parentComune) {
  if (!civicRequest) return false;
  const p = String(parentComune || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
  return !p || p === "milano";
}
