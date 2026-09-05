// TICKET — REQUISITO WATERMARK FOTO CLIENTE.
//
// Il watermark viene GENERATO AUTOMATICAMENTE dalla piattaforma da dati
// reali (data/ora scatto, coordinate GPS del dispositivo, comune reale
// della zona/campagna, via/civico reali della segnalazione) e BURNATO sui
// pixel prima dell'upload — mai digitato dal Driver, mai da EXIF, mai una
// via/citta' inventata. Test statico + di contratto: le funzioni pure sono
// verificate direttamente; il wiring del capture flow via regex sorgente
// (canvas/DOM non disponibili in node:test, stesso approccio di
// pod_photo_processing.test.mjs).
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  buildDeliveryWatermarkLines,
  buildIssueWatermarkLines,
  formatWatermarkDateTime,
} from "../src/lib/pod/podPhotoProcessing.js";
import { reverseGeocode } from "../src/lib/geo/geocodeAddress.js";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

function withFetch(impl) {
  const prev = globalThis.fetch;
  globalThis.fetch = impl;
  return () => { globalThis.fetch = prev; };
}

// ── formatWatermarkDateTime ──────────────────────────────────────────────
test("formatWatermarkDateTime: formato '<g> <Mese> <aaaa> hh:mm:ss', mese abbreviato IT, giorno senza zero iniziale", () => {
  // Costruito con componenti locali per evitare dipendenza dal fuso del CI.
  const d = new Date(2026, 8, 5, 12, 34, 18); // 5 Set 2026 12:34:18 locale
  assert.equal(formatWatermarkDateTime(d.toISOString()), "5 Set 2026 12:34:18");
  const d2 = new Date(2026, 0, 9, 3, 5, 7);
  assert.equal(formatWatermarkDateTime(d2.toISOString()), "9 Gen 2026 03:05:07");
});

test("formatWatermarkDateTime: input assente/non valido -> null (nessun 'Invalid Date' nel watermark)", () => {
  assert.equal(formatWatermarkDateTime(null), null);
  assert.equal(formatWatermarkDateTime(undefined), null);
  assert.equal(formatWatermarkDateTime("non-una-data"), null);
});

// ── buildDeliveryWatermarkLines (proof_photos) ───────────────────────────
test("buildDeliveryWatermarkLines: GPS presente -> coordinate reali + 'GPS verificato' + comune", () => {
  const d = new Date(2026, 8, 5, 12, 34, 18);
  const lines = buildDeliveryWatermarkLines({ takenAt: d.toISOString(), lat: 45.51234, lng: 9.19876, city: "Milano" });
  assert.deepEqual(lines, ["5 Set 2026 12:34:18", "45.51234, 9.19876", "Milano", "GPS verificato"]);
});

test("buildDeliveryWatermarkLines: GPS assente -> 'Indirizzo non disponibile' e NESSUNA riga 'GPS verificato'", () => {
  const d = new Date(2026, 8, 5, 12, 34, 18);
  const lines = buildDeliveryWatermarkLines({ takenAt: d.toISOString(), lat: null, lng: null, city: "Milano" });
  assert.deepEqual(lines, ["5 Set 2026 12:34:18", "Indirizzo non disponibile", "Milano"]);
  assert.ok(!lines.includes("GPS verificato"));
});

test("buildDeliveryWatermarkLines: comune assente -> riga comune omessa, mai una citta' inventata", () => {
  const d = new Date(2026, 8, 5, 12, 34, 18);
  const lines = buildDeliveryWatermarkLines({ takenAt: d.toISOString(), lat: 45.5, lng: 9.2, city: null });
  assert.deepEqual(lines, ["5 Set 2026 12:34:18", "45.50000, 9.20000", "GPS verificato"]);
  assert.equal(lines.length, 3);
});

test("buildDeliveryWatermarkLines: FASE 4 — via/civico REALI dal reverse geocoding sostituiscono le coordinate; city interna ha priorita' su geoCity", () => {
  const d = new Date(2026, 8, 5, 16, 20, 14);
  const lines = buildDeliveryWatermarkLines({
    takenAt: d.toISOString(), lat: 45.53, lng: 9.18,
    city: "Milano", street: "Via Oroboni", houseNumber: "10", geoCity: "MILANO (geo)",
  });
  assert.deepEqual(lines, ["5 Set 2026 16:20:14", "Via Oroboni 10", "Milano", "GPS verificato"]);
});

test("buildDeliveryWatermarkLines: FASE 4 — reverse geocoding fallito (street/geoCity null) -> coordinate reali, upload non si ferma", () => {
  const d = new Date(2026, 8, 5, 16, 20, 14);
  const lines = buildDeliveryWatermarkLines({
    takenAt: d.toISOString(), lat: 45.53, lng: 9.18, city: null,
    street: null, houseNumber: null, geoCity: null,
  });
  assert.deepEqual(lines, ["5 Set 2026 16:20:14", "45.53000, 9.18000", "GPS verificato"]);
});

test("buildDeliveryWatermarkLines: FASE 4 — solo geoCity disponibile (nessun comune interno) -> usa geoCity, mai inventato", () => {
  const d = new Date(2026, 8, 5, 16, 20, 14);
  const lines = buildDeliveryWatermarkLines({
    takenAt: d.toISOString(), lat: 45.53, lng: 9.18, city: null,
    street: "Piazza Duomo", houseNumber: null, geoCity: "Milano",
  });
  assert.deepEqual(lines, ["5 Set 2026 16:20:14", "Piazza Duomo", "Milano", "GPS verificato"]);
});

test("buildDeliveryWatermarkLines: nessun campo digitato dal Driver (client/ddt/colli/esito/indirizzo NON accettati)", () => {
  const d = new Date(2026, 8, 5, 12, 34, 18);
  const lines = buildDeliveryWatermarkLines({
    takenAt: d.toISOString(), lat: 45.5, lng: 9.2, city: "Milano",
    address: "Via Digitata Dal Driver 99", client: "Tal dei Tali", ddt: "DDT-1", colli: 3, outcome: "consegnato",
  });
  const joined = lines.join(" | ");
  assert.ok(!joined.includes("Via Digitata"));
  assert.ok(!joined.includes("Tal dei Tali"));
  assert.ok(!joined.includes("DDT"));
  assert.ok(!joined.toLowerCase().includes("colli"));
});

// ── buildIssueWatermarkLines (issue_verification_photos) ─────────────────
test("buildIssueWatermarkLines: via/civico/comune REALI della segnalazione + 'GPS verificato'", () => {
  const d = new Date(2026, 8, 5, 11, 22, 0);
  const lines = buildIssueWatermarkLines({
    takenAt: d.toISOString(), lat: 45.53, lng: 9.18,
    municipality: "Milano", street: "Via Oroboni", houseNumber: "10",
  });
  assert.deepEqual(lines, ["5 Set 2026 11:22:00", "Via Oroboni 10", "Milano", "GPS verificato"]);
});

test("buildIssueWatermarkLines: civico assente -> solo via; via assente -> fallback coordinate", () => {
  const d = new Date(2026, 8, 5, 11, 22, 0);
  assert.deepEqual(
    buildIssueWatermarkLines({ takenAt: d.toISOString(), lat: 45.5, lng: 9.2, municipality: "Milano", street: "Via Roma", houseNumber: null }),
    ["5 Set 2026 11:22:00", "Via Roma", "Milano", "GPS verificato"],
  );
  assert.deepEqual(
    buildIssueWatermarkLines({ takenAt: d.toISOString(), lat: 45.5, lng: 9.2, municipality: "Milano", street: null, houseNumber: null }),
    ["5 Set 2026 11:22:00", "45.50000, 9.20000", "Milano", "GPS verificato"],
  );
});

// ── reverseGeocode: NON bloccante, fail-closed, mai un indirizzo inventato ──
test("reverseGeocode: risposta valida -> {street, houseNumber, city} REALI dai componenti address", async () => {
  const restore = withFetch(async () => ({
    ok: true,
    json: async () => ({ address: { road: "Via Oroboni", house_number: "10", city: "Milano" } }),
  }));
  try {
    assert.deepEqual(await reverseGeocode(45.53, 9.18), { street: "Via Oroboni", houseNumber: "10", city: "Milano" });
  } finally { restore(); }
});

test("reverseGeocode: HTTP non ok / errore rete / timeout -> null (fail-closed, il chiamante tiene le coordinate)", async () => {
  let restore = withFetch(async () => ({ ok: false, status: 429, json: async () => ({}) }));
  try { assert.equal(await reverseGeocode(45.53, 9.18), null); } finally { restore(); }
  restore = withFetch(async () => { throw new Error("network down"); });
  try { assert.equal(await reverseGeocode(45.53, 9.18), null); } finally { restore(); }
  restore = withFetch(async () => { const e = new Error("aborted"); e.name = "AbortError"; throw e; });
  try { assert.equal(await reverseGeocode(45.53, 9.18, { timeoutMs: 500 }), null); } finally { restore(); }
});

test("reverseGeocode: coordinate non valide o (0,0) -> null senza nemmeno chiamare la rete", async () => {
  let called = false;
  const restore = withFetch(async () => { called = true; return { ok: true, json: async () => ({}) }; });
  try {
    assert.equal(await reverseGeocode(null, 9.18), null);
    assert.equal(await reverseGeocode(0, 0), null);
    assert.equal(await reverseGeocode("x", "y"), null);
    assert.equal(called, false);
  } finally { restore(); }
});

test("reverseGeocode: risposta senza road e senza city -> null (nessuna euristica che indovina)", async () => {
  const restore = withFetch(async () => ({ ok: true, json: async () => ({ address: { country: "Italia" } }) }));
  try { assert.equal(await reverseGeocode(45.53, 9.18), null); } finally { restore(); }
});

// ── Wiring del capture flow: watermark BURNATO nell'anteprima, prima dell'upload ──
test("PodCapture.jsx: watermark burnato SUBITO dopo lo scatto (l'anteprima e' gia' watermarkata), poi upload dello stesso canvas", () => {
  const src = read("src/components/driver/PodCapture.jsx");
  // drawPodWatermark(canvas, ...) avviene in handleFileSelected, PRIMA di
  // mostrare la preview -> il Driver vede subito la foto con watermark.
  assert.match(src, /drawPodWatermark\(canvas, buildDeliveryWatermarkLines\(\{/);
  const selIdx = src.indexOf("async function handleFileSelected");
  const confIdx = src.indexOf("async function handleConfirm");
  const drawIdx = src.indexOf("drawPodWatermark(canvas, buildDeliveryWatermarkLines");
  assert.ok(drawIdx > selIdx && drawIdx < confIdx, "il watermark va disegnato in handleFileSelected, non in handleConfirm");
  assert.match(src, /setPreviewUrl\(URL\.createObjectURL\(blob\)\)/);
  // handleConfirm carica lo STESSO canvas gia' watermarkato, non lo ridisegna.
  const confBody = src.slice(confIdx);
  assert.match(confBody, /const finalBlob = await canvasToJpegBlob\(canvasRef\.current\)/);
  assert.doesNotMatch(confBody, /drawPodWatermark/);
});

test("PodCapture.jsx: NESSUN campo manuale nel flusso Foto prova (Cliente/Indirizzo/DDT/Colli/Note rimossi, non bloccano l'invio)", () => {
  const src = read("src/components/driver/PodCapture.jsx");
  assert.doesNotMatch(src, /buildPodWatermarkLines|buildProofPhotoNote|POD_OUTCOME_OPTIONS/);
  assert.doesNotMatch(src, /placeholder="Nome cliente"|placeholder="Via, civico, comune"|placeholder="Numero DDT"/);
  // Nessun <input>/<select>/<textarea> di POD nel render (i campi manuali sono
  // stati rimossi; restano solo gli <input type=file> nascosti per scatto/galleria).
  assert.doesNotMatch(src, /<textarea/);
  assert.doesNotMatch(src, /<select/);
  assert.doesNotMatch(src, /setForm\(/);
  const fileInputs = (src.match(/<input /g) || []).length;
  assert.equal(fileInputs, 2, "solo i 2 input file (fotocamera + galleria), nessun campo testuale");
});

test("PodCapture.jsx: FASE 4 — reverse geocoding NON bloccante prima del watermark, .catch(() => null), l'upload prosegue in ogni caso", () => {
  const src = read("src/components/driver/PodCapture.jsx");
  assert.match(src, /import \{ reverseGeocode \} from '\.\.\/\.\.\/lib\/geo\/geocodeAddress\.js'/);
  assert.match(src, /geo = await reverseGeocode\(lastPosition\.lat, lastPosition\.lng\)\.catch\(\(\) => null\)/);
  assert.match(src, /street: geo\?\.street \|\| null/);
  assert.match(src, /geoCity: geo\?\.city \|\| null/);
});

test("PodCapture.jsx: BUG SUPABASE AUTH — upload via access_token dell'assignment, MAI client.auth.getUser() nel flusso token", () => {
  const src = read("src/components/driver/PodCapture.jsx");
  assert.match(src, /export function PodCapture\(\{ campaignId, sessionId, assignmentId = null, accessToken = null,/);
  assert.match(src, /uploadProofPhoto\(\{[\s\S]{0,200}assignmentId,[\s\S]{0,200}accessToken,/);
  const api = read("src/lib/services/gps-api.js");
  // Nel ramo token uploadProofPhoto non chiama getCurrentUserId(): passa da
  // driver_register_proof_photo (RPC SECURITY DEFINER, autz via access_token).
  assert.match(api, /if \(accessToken && isValidUuid\(assignmentId\)\) \{/);
  assert.match(api, /callGpsRpc\('driver_register_proof_photo', \{/);
  assert.match(api, /p_access_token: accessToken,/);
});

test("DriverAssignmentPage.jsx: foto di verifica segnalazione watermarkate (buildIssueWatermarkLines) prima dell'upload, con dati reali della issue", () => {
  const src = read("src/pages/driver/DriverAssignmentPage.jsx");
  assert.match(src, /const \{ canvas \} = await compressPodImage\(file\)/);
  assert.match(src, /drawPodWatermark\(canvas, buildIssueWatermarkLines\(\{/);
  assert.match(src, /municipality: issue\.municipality,\s*\n\s*street: issue\.street,\s*\n\s*houseNumber: issue\.house_number,/);
  assert.match(src, /const watermarkedBlob = await canvasToJpegBlob\(canvas\)/);
  assert.match(src, /blob: watermarkedBlob/);
});

test("Comune reale passato a PodCapture da entrambe le pagine Driver (mai un valore hardcoded)", () => {
  const dap = read("src/pages/driver/DriverAssignmentPage.jsx");
  const tp = read("src/pages/driver/TrackingPage.jsx");
  assert.match(dap, /<PodCapture[\s\S]{0,400}city=\{realComuneName\}/);
  assert.match(tp, /<PodCapture[\s\S]{0,400}city=\{realComuneName\}/);
  assert.match(tp, /const realComuneName = activeZoneRecord\?\.zone_name/);
  // DriverAssignmentPage passa assignmentId + accessToken per l'upload token.
  assert.match(dap, /<PodCapture[\s\S]{0,400}assignmentId=\{assignmentId\}[\s\S]{0,120}accessToken=\{accessToken\}/);
});

test("EXIF non e' mai la fonte: nessuna libreria/parsing EXIF introdotta dal watermark", () => {
  const pod = read("src/lib/pod/podPhotoProcessing.js");
  const pc = read("src/components/driver/PodCapture.jsx");
  const dap = read("src/pages/driver/DriverAssignmentPage.jsx");
  for (const src of [pod, pc, dap]) {
    // Nessun import di librerie EXIF, nessun accesso a metadati EXIF: i valori
    // arrivano dal capture flow (orologio + GPS del dispositivo), non dal file.
    assert.doesNotMatch(src, /require\(['"][^'"]*exif|from ['"][^'"]*exif|piexif|exifr|\.exif\b|getExif|parseExif/i);
  }
});

// ── DO NOT BREAK: watermark POD/DDT esistente e nota non toccati ─────────
test("buildPodWatermarkLines / buildProofPhotoNote / parseProofPhotoNote restano invariati (nessuna regressione POD)", () => {
  const pod = read("src/lib/pod/podPhotoProcessing.js");
  assert.match(pod, /export function buildPodWatermarkLines\(/);
  assert.match(pod, /export function buildProofPhotoNote\(/);
  assert.match(pod, /export function parseProofPhotoNote\(/);
});
