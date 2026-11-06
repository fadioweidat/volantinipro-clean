// Ricerca civici Step 2 (PR #28, 2026-11-06) — PROVIDER SIMULATI.
// I test con il servizio reale del Comune sono in tests/live/ (npm run test:geocoding-live).
//
// Causa verificata del bug Samsung "Viale Certosa 330, Milano":
//  - sulla Preview *.vercel.app il token Mapbox risponde 403 (limitato ai
//    domini volantinipro.it) e lo Step 2 passa a Nominatim;
//  - OpenStreetMap non ha il civico 330 (solo tratti di via) -> "non verificato";
//  - lo stradario ufficiale del Comune (ds634) ha Viale Certosa 1-316: il 330
//    non esiste; il "330" di Mapbox cade a 27 m dal civico 282.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  applyRegistryOutcome, CIVIC_REGISTRY_STATUS, describeRegistryOutcome, formatCivicNumber,
  lookupMilanoCivic, parseCivicNumber, shouldCheckMilanoRegistry, splitStreet,
} from "../src/lib/step2/milanoCivicRegistry.js";
import { describePointProvenance, matchesRequestedCivic, normalizeItalianStreetNumber, parseRequestedCivic } from "../src/lib/step2/civicAddressMatch.js";
import { activatePointOfSale, summarizeCampaignZones } from "../src/lib/step2/campaignZonesModel.js";

const read = rel => fs.readFileSync(new URL(rel, import.meta.url), "utf8");
const step2 = read("../src/pages/public/configurator/Step2.jsx");
const panel = read("../src/pages/public/configurator/step2/Step2TerritoryControlsPanel.jsx");

// ------------------------------------------------------------ parsing
test("parsing: le quattro varianti di Viale Certosa 330 danno la stessa richiesta", () => {
  for (const q of ["Viale Certosa 330", "Viale Certosa 330 Milano", "Milano Viale Certosa 330", "Viale Certosa, 330, Milano", "Viale Certosa 330, Milano"]) {
    assert.deepEqual(parseRequestedCivic(q), { number: "330", street: "Viale Certosa" }, q);
  }
  assert.equal(parseRequestedCivic("Viale Certosa, Milano"), null, "senza numero non e' una richiesta civica");
  assert.equal(parseRequestedCivic("Milano CAP 20156"), null);
});

test("civici con lettera e barra: 12/A = 12A, ma 24/6 non e' 246", () => {
  assert.equal(normalizeItalianStreetNumber("12/A"), "12A");
  assert.equal(normalizeItalianStreetNumber("12 a"), "12A");
  assert.equal(normalizeItalianStreetNumber("24/6"), "24/6");
  assert.equal(normalizeItalianStreetNumber("007"), "7");
  assert.deepEqual(parseCivicNumber("12/A"), { number: 12, letter: "A", barra: "" });
  assert.deepEqual(parseCivicNumber("282a"), { number: 282, letter: "A", barra: "" });
  assert.deepEqual(parseCivicNumber("24/6"), { number: 24, letter: "", barra: "6" });
  assert.equal(parseCivicNumber("12 bis"), null);
  assert.equal(formatCivicNumber(parseCivicNumber("24/6")), "24/6");
  assert.deepEqual(parseRequestedCivic("Via Antonio Oroboni 12/A, Milano"), { number: "12A", street: "Via Antonio Oroboni" });
});

test("vie: tipo + nome normalizzati; senza tipo non si interroga lo stradario", () => {
  assert.deepEqual(splitStreet("Viale Certosa"), { type: "Viale", name: "CERTOSA" });
  assert.deepEqual(splitStreet("v.le Certosa"), { type: "Viale", name: "CERTOSA" });
  assert.deepEqual(splitStreet("Piazza Duomo"), { type: "Piazza", name: "DUOMO" });
  assert.deepEqual(splitStreet("Via Sant'Ambrogio"), { type: "Via", name: "SANT'AMBROGIO" });
  assert.equal(splitStreet("Certosa"), null);
});

test("confronto civico: via diversa o numero diverso vengono rifiutati", () => {
  const q = "Viale Certosa 330, Milano";
  assert.equal(matchesRequestedCivic(q, { street: "Viale Certosa", houseNumber: "330" }), true);
  assert.equal(matchesRequestedCivic(q, { street: "Via Certosa", houseNumber: "330" }), false, "Via ≠ Viale");
  assert.equal(matchesRequestedCivic(q, { street: "Via Milano", houseNumber: "330" }), false, "330 su un'altra via");
  assert.equal(matchesRequestedCivic(q, { street: "Viale Certosa", houseNumber: null }), false, "centro della via");
  assert.equal(matchesRequestedCivic(q, { street: "Viale Certosa", houseNumber: "33" }), false);
  assert.equal(matchesRequestedCivic("Via Oroboni 10", { street: "Via Antonio Oroboni", houseNumber: "10" }), true);
  assert.equal(matchesRequestedCivic("Via X 24/6", { street: "Via X", houseNumber: "246" }), false);
  assert.equal(matchesRequestedCivic("Piazza Duomo 21", { street: "Piazza del Duomo", houseNumber: "21", verification: "official_registry" }), true);
});

// ------------------------------------------------------------ stradario simulato
function fakeRegistry({ streets = [], civics = [], status = 200, hang = false, bad = false } = {}) {
  const calls = [];
  const fetchImpl = (url, { signal } = {}) => {
    const sql = decodeURIComponent(String(url).split("sql=")[1] || "");
    calls.push(sql);
    if (hang) return new Promise((_, reject) => signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))));
    const records = /GROUP BY/.test(sql) ? streets : /ORDER BY "NUMERO"/.test(sql) ? civics : civics.filter(c => sql.includes(`"NUMERO"=${c.NUMERO}`));
    return Promise.resolve({ ok: status === 200, status, json: async () => (bad ? { success: false } : { success: true, result: { records } }) });
  };
  return { fetchImpl, calls };
}
const CERTOSA = { CODICE_VIA: "7174", TIPO: "Viale", DENOMINAZIONE: "CERTOSA", OPENSTREETMAP: "CERTOSA", DESCRITTIVO: "CERTOSA", minn: "1", maxn: "316", n: "219" };
const C282A = { NUMEROCOMPLETO: "282A", NUMERO: "282", LETTERA: "A", BARRA: "", BARRA2: "", STATOCIVICO: "Applicato", NIL: "MAGGIORE - MUSOCCO - CERTOSA", MUNICIPIO: 8, LAT_WGS84: 45.502163, LONG_WGS84: 9.1254 };
const C316 = { NUMEROCOMPLETO: "316", NUMERO: "316", LETTERA: "", BARRA: "", BARRA2: "", STATOCIVICO: "Applicato", NIL: "MAGGIORE - MUSOCCO - CERTOSA", MUNICIPIO: 8, LAT_WGS84: 45.503648, LONG_WGS84: 9.122251 };

test("stradario: civico presente -> verificato con le coordinate del Comune", async () => {
  const { fetchImpl } = fakeRegistry({ streets: [CERTOSA], civics: [C316] });
  const r = await lookupMilanoCivic({ street: "Viale Certosa", number: "316" }, { fetchImpl });
  assert.equal(r.status, CIVIC_REGISTRY_STATUS.VERIFIED);
  assert.equal(r.result.lat, 45.503648);
  assert.equal(r.result.lng, 9.122251);
  assert.equal(r.result.verification, "official_registry");
  assert.equal(r.result.label, "Viale Certosa 316");
  assert.equal(r.result.nil, "MAGGIORE - MUSOCCO - CERTOSA");
});

test("stradario: civico con lettera trovato solo con la lettera giusta", async () => {
  const { fetchImpl } = fakeRegistry({ streets: [CERTOSA], civics: [{ ...C282A, LETTERA: "" , NUMEROCOMPLETO: "282", LAT_WGS84: 45.502079, LONG_WGS84: 9.125533 }, C282A] });
  const a = await lookupMilanoCivic({ street: "Viale Certosa", number: "282/A" }, { fetchImpl });
  assert.equal(a.result.lat, 45.502163);
  const plain = await lookupMilanoCivic({ street: "Viale Certosa", number: "282" }, { fetchImpl });
  assert.equal(plain.result.lat, 45.502079);
  const b = await lookupMilanoCivic({ street: "Viale Certosa", number: "282B" }, { fetchImpl });
  assert.equal(b.status, CIVIC_REGISTRY_STATUS.NOT_IN_REGISTRY);
});

test("stradario: Viale Certosa 330 non esiste -> stato esplicito con l'intervallo reale", async () => {
  const { fetchImpl } = fakeRegistry({ streets: [CERTOSA], civics: [C282A, C316] });
  const r = await lookupMilanoCivic({ street: "Viale Certosa", number: "330" }, { fetchImpl });
  assert.equal(r.status, CIVIC_REGISTRY_STATUS.NOT_IN_REGISTRY);
  assert.deepEqual(r.range, { min: 1, max: 316, count: 219 });
  assert.equal(r.result, undefined, "nessuna coordinata inventata");
  // percorso della via dai civici ufficiali, solo per inquadrare la scelta manuale
  assert.equal(r.streetPath.type, "LineString");
  assert.ok(r.streetPath.coordinates.length >= 2);
  assert.match(describeRegistryOutcome(r, "330"), /Viale Certosa 330 non risulta nello stradario ufficiale del Comune di Milano \(civici registrati: 1-316\)\. Scegli il punto esatto sulla mappa\./);
});

test("stradario: via assente, via ambigua, errori HTTP, risposta non valida, timeout", async () => {
  assert.equal((await lookupMilanoCivic({ street: "Via Inesistente", number: "3" }, { fetchImpl: fakeRegistry().fetchImpl })).status, CIVIC_REGISTRY_STATUS.STREET_NOT_FOUND);
  const two = fakeRegistry({ streets: [{ ...CERTOSA, CODICE_VIA: "1", OPENSTREETMAP: "MARIO ROSSI", DESCRITTIVO: "MARIO ROSSI", DENOMINAZIONE: "ROSSI MARIO" }, { ...CERTOSA, CODICE_VIA: "2", OPENSTREETMAP: "LUIGI ROSSI", DESCRITTIVO: "LUIGI ROSSI", DENOMINAZIONE: "ROSSI LUIGI" }] });
  const amb = await lookupMilanoCivic({ street: "Via Rossi", number: "3" }, { fetchImpl: two.fetchImpl });
  assert.equal(amb.status, CIVIC_REGISTRY_STATUS.AMBIGUOUS_STREET);
  assert.match(describeRegistryOutcome(amb), /Più vie corrispondono/);
  assert.equal((await lookupMilanoCivic({ street: "Viale Certosa", number: "1" }, { fetchImpl: fakeRegistry({ status: 500 }).fetchImpl })).status, CIVIC_REGISTRY_STATUS.UNAVAILABLE);
  assert.equal((await lookupMilanoCivic({ street: "Viale Certosa", number: "1" }, { fetchImpl: fakeRegistry({ bad: true }).fetchImpl })).status, CIVIC_REGISTRY_STATUS.UNAVAILABLE);
  const t0 = Date.now();
  const slow = await lookupMilanoCivic({ street: "Viale Certosa", number: "1" }, { fetchImpl: fakeRegistry({ hang: true }).fetchImpl, timeoutMs: 80 });
  assert.equal(slow.status, CIVIC_REGISTRY_STATUS.UNAVAILABLE);
  assert.equal(slow.reason, "timeout");
  assert.ok(Date.now() - t0 < 2000);
  const rejected = await lookupMilanoCivic({ street: "Viale Certosa", number: "1" }, { fetchImpl: () => Promise.reject(new TypeError("network")) });
  assert.equal(rejected.status, CIVIC_REGISTRY_STATUS.UNAVAILABLE);
});

test("stradario: l'input non può alterare la query SQL", async () => {
  const { fetchImpl, calls } = fakeRegistry();
  await lookupMilanoCivic({ street: "Via X'; DROP TABLE t; --", number: "1" }, { fetchImpl });
  assert.ok(calls.length >= 1);
  for (const sql of calls) {
    assert.doesNotMatch(sql, /;/);
    assert.doesNotMatch(sql, /--/);
  }
});

// ------------------------------------------------------------ fusione con i geocoder
const MAPBOX_330 = { id: "address.1", street: "Viale Certosa", houseNumber: "330", lat: 45.50187, lng: 9.1257, placeType: "address", source: "mapbox", city: "Milano" };
const MUNICIPIO_8 = { id: "locality.8", name: "Municipio 8", placeType: "locality", source: "mapbox" };
const STREET_ONLY = { id: "osm.1", street: "Viale Certosa", houseNumber: null, lat: 45.496, lng: 9.137, placeType: "road", source: "nominatim" };

test("geocoder + stradario: il 330 di Mapbox viene scartato perché il civico non esiste", () => {
  const q = "Viale Certosa 330, Milano";
  const out = applyRegistryOutcome([MAPBOX_330, MUNICIPIO_8, STREET_ONLY], { status: CIVIC_REGISTRY_STATUS.NOT_IN_REGISTRY, range: { min: 1, max: 316 } }, q, matchesRequestedCivic);
  assert.ok(!out.includes(MAPBOX_330));
  assert.ok(out.includes(MUNICIPIO_8), "le alternative esplicite restano");
});

test("geocoder + stradario: civico verificato in testa, i punti dei provider per lo stesso civico tolti", () => {
  const q = "Viale Certosa 316";
  const official = { id: "comune-milano:7174:316", street: "Viale Certosa", houseNumber: "316", lat: 45.503648, lng: 9.122251, verification: "official_registry", placeType: "address" };
  const mapbox316 = { ...MAPBOX_330, houseNumber: "316", lat: 45.6, lng: 9.2 };
  const out = applyRegistryOutcome([mapbox316, MUNICIPIO_8], { status: CIVIC_REGISTRY_STATUS.VERIFIED, result: official }, q, matchesRequestedCivic);
  assert.equal(out[0], official);
  assert.ok(!out.includes(mapbox316));
  assert.ok(out.includes(MUNICIPIO_8));
});

test("geocoder + stradario: servizio non raggiungibile o via non presente -> risultati dei provider invariati", () => {
  const list = [MAPBOX_330, MUNICIPIO_8];
  assert.deepEqual(applyRegistryOutcome(list, { status: CIVIC_REGISTRY_STATUS.UNAVAILABLE }, "Viale Certosa 330", matchesRequestedCivic), list);
  assert.deepEqual(applyRegistryOutcome(list, { status: CIVIC_REGISTRY_STATUS.STREET_NOT_FOUND }, "Viale Certosa 330", matchesRequestedCivic), list);
  assert.deepEqual(applyRegistryOutcome([], null, "x", matchesRequestedCivic), []);
});

test("lo stradario di Milano si usa solo se non è indicato un altro comune", () => {
  const c = { number: "330", street: "Viale Certosa" };
  assert.equal(shouldCheckMilanoRegistry(c, null), true);
  assert.equal(shouldCheckMilanoRegistry(c, "Milano"), true);
  assert.equal(shouldCheckMilanoRegistry(c, "Sesto San Giovanni"), false);
  assert.equal(shouldCheckMilanoRegistry(null, "Milano"), false);
});

// ------------------------------------------------------------ integrazione Step 2 (sorgente)
test("Step 2: stradario in parallelo ai geocoder, esito legato a ricerca e PV", () => {
  assert.match(step2, /const registryCheck = shouldCheckMilanoRegistry\(civicRequest, searchIntent\.parentComune\)/);
  assert.match(step2, /const requestZoneId = data\.activeZoneId \|\| null;/);
  assert.match(step2, /const outcome = registryCheck \? await registryCheck : null;\r?\n\s+if \(cancelled\) return;/);
  assert.match(step2, /applyRegistryOutcome\(list, outcome, search, matchesRequestedCivic\)/);
  assert.match(step2, /civicRegistryCheck\.search === search && civicRegistryCheck\.zoneId === \(data\.activeZoneId \|\| null\)/);
  // Nominatim non raggiungibile: comunque l'esito dello stradario, mai un punto inventato
  assert.match(step2, /if \(!cancelled\) await publishSuggestions\(\[\]\);/);
});

test("Step 2: provenienza del punto salvata e mostrata (verificato, provider, manuale)", () => {
  assert.match(step2, /verification: point\.verification \|\| \(point\.houseNumber \? "provider_civic" : "provider_street"\),/);
  assert.match(step2, /type: "manual_point",\r?\n\s+label: "Punto selezionato sulla mappa",\r?\n[\s\S]{0,80}verification: "manual",/);
  assert.match(panel, /"Civico verificato · stradario Comune di Milano"/);
  assert.match(panel, /"Punto scelto sulla mappa · non è un civico verificato"/);
  assert.match(panel, /civicRegistryMessage \|\| "Numero civico non verificato: usa il punto esatto sulla mappa\."/);
});

test("Step 2: risposte asincrone del punto ignorate se nel frattempo è cambiato il PV", () => {
  assert.match(step2, /const ownerZoneId = activeZoneIdRef\.current;[\s\S]{0,400}if \(activeZoneIdRef\.current !== ownerZoneId\) return;/);
});

// ------------------------------------------------------------ punti vendita
const MILANO = { name: "Milano", label: "Milano", lat: 45.4642, lng: 9.19 };
const PV1 = { id: "pv1", searchMode: "address", city: MILANO, cityName: "Milano", radiusKm: 3, radius: 3, assigned_flyers: 98046, finalFlyers: 98046,
  selectedSearchPoint: { label: "Via Antonio Oroboni 10, Milano", lat: 45.528897, lng: 9.172024, verification: "official_registry", nil: "BRUZZANO" },
  coverage: { address: { label: "Via Antonio Oroboni 10, Milano", lat: 45.528897, lng: 9.172024 } }, selected: ["nil_83"], readyForQuote: true };
const PV2 = { id: "pv2", searchMode: "address", city: MILANO, cityName: "Milano", radiusKm: 2, radius: 2, assigned_flyers: 50000, finalFlyers: 50000,
  selectedSearchPoint: { label: "Viale Certosa 316, Milano", lat: 45.503648, lng: 9.122251, verification: "official_registry", nil: "MAGGIORE - MUSOCCO - CERTOSA" },
  coverage: { address: { label: "Viale Certosa 316, Milano", lat: 45.503648, lng: 9.122251 } }, selected: ["nil_78"], readyForQuote: true };

test("PV1/PV2: attivare un PV ricostruisce lo stato solo dai suoi dati, avanti e indietro", () => {
  let state = { campaignZones: [PV1, PV2], activeZoneId: "pv1", qty: 98046, coverage: { address: PV1.coverage.address } };
  for (let i = 0; i < 5; i++) {
    state = activatePointOfSale(state, "pv2");
    assert.equal(state.selectedSearchPoint.label, "Viale Certosa 316, Milano");
    assert.equal(state.radiusKm, 2);
    assert.equal(state.qty, 50000);
    assert.equal(state.coverage.address.label, "Viale Certosa 316, Milano");
    state = activatePointOfSale(state, "pv1");
    assert.equal(state.selectedSearchPoint.label, "Via Antonio Oroboni 10, Milano");
    assert.equal(state.selectedSearchPoint.lat, 45.528897);
    assert.equal(state.radiusKm, 3);
    assert.equal(state.qty, 98046);
    assert.deepEqual(state.zones, ["nil_83"]);
  }
  // i PV salvati non sono stati toccati dallo switch
  assert.equal(state.campaignZones[0], PV1);
  assert.equal(state.campaignZones[1], PV2);
});

test("PV2 nuovo non eredita indirizzo, coordinate o NIL di PV1", () => {
  const fresh = { id: "pv2", searchMode: "address", city: null, selectedComuni: [], assigned_flyers: 10000 };
  const state = activatePointOfSale({ campaignZones: [PV1, fresh], activeZoneId: "pv1", coverage: { address: PV1.coverage.address }, campaignBaseQuantity: 10000 }, "pv2");
  assert.equal(state.selectedSearchPoint, null);
  assert.deepEqual(state.zones, []);
  assert.equal(state.coverage.address, null, "l'indirizzo del PV1 non passa al PV2");
  assert.equal(state.qty, 10000);
});

test("ritorno da Step 3 a Step 2: la bozza ripristina ogni PV con i propri dati", () => {
  const draft = JSON.parse(JSON.stringify({ campaignZones: [PV1, PV2], activeZoneId: "pv2" }));
  const restored = activatePointOfSale(draft, "pv2");
  assert.equal(restored.selectedSearchPoint.verification, "official_registry");
  assert.equal(restored.selectedSearchPoint.lat, 45.503648);
  const back = activatePointOfSale(restored, "pv1");
  assert.equal(back.selectedSearchPoint.lat, 45.528897);
  assert.equal(back.campaignZones.length, 2);
});

test("KPI multi-PV: mai zero né somma se un PV non è pronto; quantità non duplicate", () => {
  const notReady = { ...PV2, readyForQuote: false, kpiSnapshot: { families: null } };
  const s = summarizeCampaignZones([{ ...PV1, kpiSnapshot: { families: 89422 } }, notReady]);
  assert.equal(s.allZonesReady, false);
  assert.equal(s.totalFamilies, null, "famiglie non determinabili, mai 0 o somma parziale");
  assert.equal(s.capacityStatus, "configuration_incomplete");
  assert.equal(s.totalQuantity, 98046 + 50000, "ogni PV contato una sola volta");
});

test("scelta manuale: si apre inquadrando la via dello stradario, non l'Italia intera", () => {
  assert.ok(step2.includes("if (check?.streetPath) setFocusedNil({ id: `street:${check.street}`, geometry: check.streetPath, nonce: Date.now() });"));
  assert.ok(step2.includes("streetPath: outcome.streetPath || null,"));
});

test("provenienza del punto: verificato, provider, manuale, solo via", () => {
  assert.equal(describePointProvenance({ verification: "official_registry" }), "Civico verificato · stradario Comune di Milano");
  assert.equal(describePointProvenance({ type: "manual_point", verification: "manual" }), "Punto scelto sulla mappa · non è un civico verificato");
  assert.equal(describePointProvenance({ verification: "provider_civic", source: "mapbox" }), "Civico trovato da Mapbox · non verificato nello stradario del Comune");
  assert.equal(describePointProvenance({ verification: "provider_street" }), "Indirizzo senza numero civico");
  assert.equal(describePointProvenance(null), null);
  assert.ok(step2.includes("pointProvenance={describePointProvenance(selectedSearchPoint)}"));
});

test("punto manuale in un PV nuovo: raggio confermato sul punto, indirizzo salvato, comune Milano solo per lo stesso PV", () => {
  const fn = step2.slice(step2.indexOf("async function handleManualMapClick"), step2.indexOf("async function selectAddressPointInMilano"));
  assert.ok(fn.length > 0);
  assert.match(fn, /const ownerZoneId = activeZoneIdRef\.current;/);
  assert.match(fn, /switchToRadiusMode\(\);[\s\S]*setRadiusSelectionConfirmed\(Number\(radius \|\| 3\) > 0\);/);
  assert.match(fn, /persistCoverageAddress\(\{ label: point\.label, lat: point\.lat, lng: point\.lng, municipality: point\.parentComune \}\);/);
  assert.match(fn, /if \(activeZoneIdRef\.current !== ownerZoneId \|\| !milano\) return;/);
});
