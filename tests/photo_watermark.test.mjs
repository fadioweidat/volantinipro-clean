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
  detectLowMemoryDevice,
  formatWatermarkDateTime,
  isMemoryError,
  readJpegDimensions,
  POD_MAX_DIMENSION,
  POD_JPEG_QUALITY,
  POD_MEMORY_PROFILES,
  POD_THUMB_MAX_DIMENSION,
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
  assert.match(src, /const url = URL\.createObjectURL\(thumbBlob \|\| blob\);/);
  assert.match(src, /setPreviewUrl\(url\)/);
  // handleConfirm carica lo STESSO Blob gia' watermarkato, non lo ridisegna
  // e non ri-comprime (nessun secondo encode del canvas -> nessun picco
  // di memoria in fase di conferma).
  const confBody = src.slice(confIdx);
  assert.match(confBody, /blob: finalBlobRef\.current/);
  assert.doesNotMatch(confBody, /drawPodWatermark|canvasToJpegBlob|compressPodImage/);
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

// ── TICKET MEMORY EXHAUSTION ────────────────────────────────────────────
test("MEMORY — target lato lungo 1280-1920px e qualita' 0.75-0.85 (range del ticket)", () => {
  assert.ok(POD_MAX_DIMENSION >= 1280 && POD_MAX_DIMENSION <= 1920, `POD_MAX_DIMENSION=${POD_MAX_DIMENSION} fuori range`);
  assert.ok(POD_JPEG_QUALITY >= 0.75 && POD_JPEG_QUALITY <= 0.85, `POD_JPEG_QUALITY=${POD_JPEG_QUALITY} fuori range`);
});

test("MEMORY — readJpegDimensions legge width/height dal marker SOF senza decodificare i pixel", () => {
  // FF D8 (SOI) | FF E0 APP0 len=16 + 14 byte | FF C0 SOF0 len=17: prec=8, H=3000(0x0BB8), W=4000(0x0FA0)
  const bytes = new Uint8Array([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x11, 0x08, 0x0b, 0xb8, 0x0f, 0xa0, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
  ]);
  assert.deepEqual(readJpegDimensions(bytes), { width: 4000, height: 3000 });
  assert.equal(readJpegDimensions(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), null); // PNG -> null
  assert.equal(readJpegDimensions(new Uint8Array([0xff, 0xd8])), null); // header troncato -> null
  assert.equal(readJpegDimensions(null), null);
});

test("MEMORY — compressPodImage decodifica GIA' ridimensionato (createImageBitmap + resizeWidth), mai il full-res in RAM", () => {
  const pod = read("src/lib/pod/podPhotoProcessing.js");
  assert.match(pod, /createImageBitmap\(file, \{\s*\n\s*resizeWidth: target\.width,\s*\n\s*resizeHeight: target\.height,/);
  assert.match(pod, /readJpegDimensions\(head\)/);
  assert.match(pod, /bitmap\.close\(\);/);
  assert.match(pod, /export function releaseCanvas\(canvas\)/);
  assert.match(pod, /canvas\.width = 1; canvas\.height = 1;/);
  // il vecchio percorso Image+drawImage full-res resta SOLO come fallback
  // estremo per browser senza createImageBitmap.
  assert.match(pod, /Fallback estremo \(browser senza createImageBitmap\)/);
});

test("MEMORY — PodCapture.jsx: cleanup obbligatorio, no base64, 1 Blob, serial lock, canvas rilasciato subito", () => {
  const src = read("src/components/driver/PodCapture.jsx");
  // niente DataURL/base64 in state: solo Blob + una object URL (i commenti
  // possono nominarli per spiegare cosa NON si fa).
  assert.doesNotMatch(src, /\.toDataURL\(|readAsDataURL\(|FileReader\(/);
  assert.match(src, /URL\.createObjectURL\(thumbBlob \|\| blob\)/);
  // una sola object URL viva, revocata prima di crearne un'altra e all'unmount
  assert.match(src, /function revokePreview\(\)\s*\{[\s\S]{0,200}URL\.revokeObjectURL\(previewUrlRef\.current\)/);
  assert.match(src, /useEffect\(\(\) => \(\) => \{ revokePreview\(\); finalBlobRef\.current = null; \}, \[\]\)/);
  // canvas rilasciato SUBITO dopo il Blob (non tenuto per tutto lo stage preview)
  assert.match(src, /releaseCanvas\(canvas\);\s*\n\s*canvas = null;/);
  // lock seriale: 1 processing / 1 upload
  assert.match(src, /const busyRef = useRef\(false\)/);
  assert.match(src, /if \(busyRef\.current\) return;/);
  assert.match(src, /disabled=\{scattoDisabled\}/);
  // handleConfirm riusa lo STESSO Blob, nessun re-encode del canvas
  const conf = src.slice(src.indexOf("async function handleConfirm"));
  assert.match(conf, /blob: finalBlobRef\.current/);
  assert.doesNotMatch(conf, /canvasToJpegBlob|drawPodWatermark|compressPodImage/);
});

test("MEMORY — DriverAssignmentPage.jsx (foto verifica): releaseCanvas subito dopo il Blob", () => {
  const src = read("src/pages/driver/DriverAssignmentPage.jsx");
  assert.match(src, /const watermarkedBlob = await canvasToJpegBlob\(canvas\);\s*\n\s*releaseCanvas\(canvas\);/);
});

// ── TICKET — PHOTO PIPELINE STILL FAILS ON REAL ANDROID (diagnostica + profilo) ──
test("ANDROID — profilo memoria: default 1600px/q0.8, low 1024-1280px/q<=0.72", () => {
  assert.equal(POD_MEMORY_PROFILES.default.maxDimension, POD_MAX_DIMENSION);
  assert.equal(POD_MEMORY_PROFILES.default.quality, POD_JPEG_QUALITY);
  assert.ok(POD_MEMORY_PROFILES.low.maxDimension >= 1024 && POD_MEMORY_PROFILES.low.maxDimension <= 1280,
    `low.maxDimension=${POD_MEMORY_PROFILES.low.maxDimension} fuori 1024-1280`);
  assert.ok(POD_MEMORY_PROFILES.low.quality >= 0.65 && POD_MEMORY_PROFILES.low.quality <= 0.72,
    `low.quality=${POD_MEMORY_PROFILES.low.quality} fuori 0.65-0.72`);
  assert.ok(POD_THUMB_MAX_DIMENSION <= 480, "thumbnail preview <= 480px lato lungo");
});

test("ANDROID — isMemoryError riconosce OOM Chrome Android / QuotaExceeded / RangeError, non un errore qualsiasi", () => {
  assert.equal(isMemoryError(new Error("Impossibile completare l'operazione precedente. Memoria insufficiente.")), true);
  assert.equal(isMemoryError(Object.assign(new Error("x"), { name: "QuotaExceededError" })), true);
  assert.equal(isMemoryError(new RangeError("Array buffer allocation failed")), true);
  assert.equal(isMemoryError(new Error("out of memory")), true);
  assert.equal(isMemoryError(new Error("network request failed")), false);
  assert.equal(isMemoryError(null), false);
});

test("ANDROID — detectLowMemoryDevice: navigator.deviceMemory <= 4 -> true", () => {
  const prev = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const set = (nav) => Object.defineProperty(globalThis, "navigator", { value: nav, configurable: true, writable: true });
  try {
    set({ deviceMemory: 4 });
    assert.equal(detectLowMemoryDevice(), true);
    set({ deviceMemory: 8 });
    assert.equal(detectLowMemoryDevice(), false);
    set({});
    assert.equal(detectLowMemoryDevice(), false);
  } finally {
    if (prev) Object.defineProperty(globalThis, "navigator", prev);
    else Object.defineProperty(globalThis, "navigator", { value: undefined, configurable: true });
  }
});

test("ANDROID — podPhotoProcessing: makeThumbnailBlob + onStage instrumentano bitmap/canvas", () => {
  const pod = read("src/lib/pod/podPhotoProcessing.js");
  assert.match(pod, /export async function makeThumbnailBlob\(sourceCanvas/);
  assert.match(pod, /export async function compressPodImage\(file, \{ maxDimension = POD_MAX_DIMENSION, onStage \} = \{\}\)/);
  assert.match(pod, /report\('bitmap_start'/);
  assert.match(pod, /report\('bitmap_done'/);
  assert.match(pod, /report\('canvas_draw_start'/);
  assert.match(pod, /report\('canvas_draw_done'\)/);
  assert.match(pod, /report\('dimensions_read'/);
});

test("ANDROID — PodCapture.jsx: stage log completo, profilo dinamico, thumbnail preview, recovery modalita' leggera", () => {
  const src = read("src/components/driver/PodCapture.jsx");
  // diagnostica di fase: ogni stage chiave e' registrato
  for (const st of ["input_received", "watermark_start", "watermark_done", "blob_start", "blob_done", "thumb_start", "thumb_done", "preview_ready", "upload_start", "cleanup_done"]) {
    assert.match(src, new RegExp(`pushStage\\('${st}'`), `manca pushStage('${st}')`);
  }
  // onStage passato sia alla compressione sia all'upload
  assert.match(src, /compressPodImage\(file, \{ maxDimension: profile\.maxDimension, onStage: pushStage \}\)/);
  assert.match(src, /uploadProofPhoto\(\{[\s\S]{0,400}onStage: pushStage,/);
  // anteprima da thumbnail dedicata, non dal blob finale
  assert.match(src, /makeThumbnailBlob\(canvas\)\.catch\(\(\) => null\)/);
  // profilo memoria: auto da deviceMemory o flag persistito, degrado dopo OOM
  assert.match(src, /detectLowMemoryDevice\(\) \|\| readForcedLowMemory\(\)/);
  assert.match(src, /function switchToLowMemory\(\)/);
  assert.match(src, /isMemoryError\(err\)/);
  assert.match(src, /persistForcedLowMemory\(\)/);
  // niente storico di Blob: un solo finalBlobRef, azzerato nel cleanup
  assert.doesNotMatch(src, /blobHistory|blobs\.push|\[\.\.\.blobs/);
});

test("ANDROID — gps-api uploadProofPhoto: accetta onStage e riporta storage/rpc senza token nei dati di stage", () => {
  const api = read("src/lib/services/gps-api.js");
  assert.match(api, /export async function uploadProofPhoto\(\{[\s\S]{0,220}onStage \}\)/);
  assert.match(api, /report\('storage_upload_done', \{ blobBytes: blob\.size \}\)/);
  assert.match(api, /report\('rpc_register_start'\)/);
  assert.match(api, /report\('rpc_register_done'\)/);
  // lo stage non deve mai includere access_token / storagePath completo
  assert.doesNotMatch(api, /report\([^)]*accessToken/);
  assert.doesNotMatch(api, /report\([^)]*storagePath/);
});

// ── DO NOT BREAK: watermark POD/DDT esistente e nota non toccati ─────────
test("buildPodWatermarkLines / buildProofPhotoNote / parseProofPhotoNote restano invariati (nessuna regressione POD)", () => {
  const pod = read("src/lib/pod/podPhotoProcessing.js");
  assert.match(pod, /export function buildPodWatermarkLines\(/);
  assert.match(pod, /export function buildProofPhotoNote\(/);
  assert.match(pod, /export function parseProofPhotoNote\(/);
});
