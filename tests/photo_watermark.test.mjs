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
  // drawPodWatermark(canvas, ...) avviene nel percorso di scatto (handleShutter
  // = fotocamera web) e nel fallback galleria, PRIMA di mostrare la preview.
  assert.match(src, /drawPodWatermark\(canvas, buildDeliveryWatermarkLines\(\{/);
  const shutterIdx = src.indexOf("async function handleShutter");
  const galleryIdx = src.indexOf("async function handleGallerySelected");
  const confIdx = src.indexOf("async function handleConfirm");
  assert.ok(shutterIdx > 0 && galleryIdx > 0, "esistono handleShutter (fotocamera web) e handleGallerySelected (fallback)");
  const drawIdxs = [...src.matchAll(/drawPodWatermark\(canvas, buildDeliveryWatermarkLines/g)].map((m) => m.index);
  assert.ok(drawIdxs.length >= 2, "watermark disegnato sia nel percorso scatto sia nel fallback galleria");
  assert.ok(drawIdxs.every((i) => i < confIdx), "il watermark va disegnato prima di handleConfirm, mai dentro");
  assert.match(src, /const url = URL\.createObjectURL\(thumbBlob \|\| blob\);/);
  assert.match(src, /setPreviewUrl\(url\)/);
  // handleConfirm carica lo STESSO Blob gia' watermarkato: nessun re-encode.
  const confBody = src.slice(confIdx);
  assert.match(confBody, /blob: finalBlobRef\.current/);
  assert.doesNotMatch(confBody, /drawPodWatermark|canvasToJpegBlob|compressPodImage|captureVideoFrame/);
});

test("PodCapture.jsx: NESSUN campo manuale nel flusso Foto prova (Cliente/Indirizzo/DDT/Colli/Note rimossi, non bloccano l'invio)", () => {
  const src = read("src/components/driver/PodCapture.jsx");
  assert.doesNotMatch(src, /buildPodWatermarkLines|buildProofPhotoNote|POD_OUTCOME_OPTIONS/);
  assert.doesNotMatch(src, /placeholder="Nome cliente"|placeholder="Via, civico, comune"|placeholder="Numero DDT"/);
  assert.doesNotMatch(src, /<textarea/);
  assert.doesNotMatch(src, /<select/);
  assert.doesNotMatch(src, /setForm\(/);
  // un solo <input type=file> nel render (fallback galleria); lo scatto usa
  // <video> + getUserMedia, NON <input capture> (camera OEM 12MP).
  const jsxInputs = (src.match(/<input ref=\{/g) || []).length;
  assert.equal(jsxInputs, 1, "solo 1 input file nascosto per il fallback galleria");
  // nessun attributo capture="environment" nel JSX renderizzato
  assert.doesNotMatch(src, /<input[^>]*capture=["']environment["']/);
  assert.match(src, /<video ref=\{videoRef\}/);
});

test("PodCapture.jsx: FASE 4 — reverse geocoding NON bloccante prima del watermark, .catch(() => null), l'upload prosegue in ogni caso", () => {
  const src = read("src/components/driver/PodCapture.jsx");
  assert.match(src, /import \{ reverseGeocode \} from '\.\.\/\.\.\/lib\/geo\/geocodeAddress\.js'/);
  assert.match(src, /geo = await reverseGeocode\(lastPosition\.lat, lastPosition\.lng\)\.catch\(\(\) => null\)/);
  assert.match(src, /street: geo\?\.street \|\| null/);
  assert.match(src, /geoCity: geo\?\.city \|\| null/);
});

// ── TICKET — ANDROID CAMERA FLOW: getUserMedia a risoluzione vincolata ──
test("CAMERA — costanti getUserMedia: 1280x960 ideal, 1600x1200 max, environment, no audio", () => {
  const pod = read("src/lib/pod/podPhotoProcessing.js");
  assert.match(pod, /export const POD_CAMERA_CONSTRAINTS = \{/);
  assert.match(pod, /facingMode: \{ ideal: 'environment' \}/);
  assert.match(pod, /width: \{ ideal: 1280, max: 1600 \}/);
  assert.match(pod, /height: \{ ideal: 960, max: 1200 \}/);
  assert.match(pod, /audio: false/);
  assert.match(pod, /export const POD_CAMERA_MAX_DIMENSION = 1600/);
});

test("CAMERA — captureVideoFrame: frame del <video> su canvas <=maxDimension, nessun decode full-res, nessun ImageBitmap", () => {
  const pod = read("src/lib/pod/podPhotoProcessing.js");
  assert.match(pod, /export function captureVideoFrame\(video, maxDimension = POD_CAMERA_MAX_DIMENSION\)/);
  assert.match(pod, /video\?\.videoWidth/);
  assert.match(pod, /fitLongSide\(vw, vh, maxDimension\)/);
  assert.match(pod, /ctx\.drawImage\(video, 0, 0, width, height\)/);
  const fn = pod.slice(pod.indexOf("export function captureVideoFrame"), pod.indexOf("export function stopCameraStream"));
  assert.doesNotMatch(fn, /createImageBitmap|new Image\(/);
  assert.match(pod, /export function stopCameraStream\(stream, video\)/);
  assert.match(pod, /stream\.getTracks\(\)\.forEach\(\(t\) => \{ try \{ t\.stop\(\)/);
  assert.match(pod, /video\.srcObject = null/);
});

test("CAMERA — PodCapture usa getUserMedia(POD_CAMERA_CONSTRAINTS) + <video> live, stop tracks dopo lo scatto", () => {
  const src = read("src/components/driver/PodCapture.jsx");
  assert.match(src, /navigator\.mediaDevices\.getUserMedia\(POD_CAMERA_CONSTRAINTS\)/);
  assert.match(src, /navigator\.mediaDevices\?\.getUserMedia/); // guard di disponibilita'
  assert.match(src, /captureVideoFrame\(v, Math\.min\(profile\.maxDimension, POD_CAMERA_MAX_DIMENSION\)\)/);
  assert.match(src, /function stopCamera\(\)/);
  assert.match(src, /stopCameraStream\(streamRef\.current, videoRef\.current\)/);
  // fotocamera spenta appena catturato il frame + all'unmount
  const shutter = src.slice(src.indexOf("async function handleShutter"), src.indexOf("async function handleGallerySelected"));
  assert.match(shutter, /stopCamera\(\);\s*\n\s*pushStage\('tracks_stopped'\)/);
  assert.match(src, /useEffect\(\(\) => \(\) => \{\s*\n\s*stopCameraStream\(streamRef\.current, videoRef\.current\)/);
  // stage specifici del percorso fotocamera
  for (const st of ["camera_request", "camera_ready", "shutter", "frame_draw_start", "frame_draw_done", "tracks_stopped"]) {
    assert.match(src, new RegExp(`pushStage\\('${st}'`), `manca pushStage('${st}')`);
  }
});

test("CAMERA — fallback: getUserMedia assente / permesso negato -> avviso esplicito + solo galleria, MAI ritorno automatico al path 12MP", () => {
  const src = read("src/components/driver/PodCapture.jsx");
  assert.match(src, /if \(!navigator\.mediaDevices\?\.getUserMedia\)/);
  assert.match(src, /NotAllowedError/);
  assert.match(src, /setCameraError\(/);
  // in errore fotocamera si offre SOLO la galleria (nessun openCamera automatico)
  assert.match(src, /\{cameraError && \(\s*\n\s*<button[^>]*onClick=\{\(\) => galleryInputRef\.current\?\.click\(\)\}/);
  // il fallback galleria passa comunque da compressPodImage (decode-at-target)
  const gallery = src.slice(src.indexOf("async function handleGallerySelected"), src.indexOf("async function handleConfirm"));
  assert.match(gallery, /compressPodImage\(file, \{ maxDimension: profile\.maxDimension, onStage: pushStage \}\)/);
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
  // unmount: fotocamera spenta + object URL revocata + blob rilasciato
  assert.match(src, /useEffect\(\(\) => \(\) => \{[\s\S]{0,200}stopCameraStream\(streamRef\.current, videoRef\.current\)[\s\S]{0,120}revokePreview\(\);[\s\S]{0,80}finalBlobRef\.current = null;[\s\S]{0,20}\}, \[\]\)/);
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

// ── TICKET — CATTURARE DIAGNOSTICA DI UN TENTATIVO FALLITO (intermittente) ──
test("DIAGNOSTICA — history multi-tentativo in sessionStorage, attemptId univoco, N progressivo", () => {
  const src = read("src/components/driver/PodCapture.jsx");
  assert.match(src, /const HISTORY_KEY = 'pod_photo_diagnostic_history'/);
  assert.match(src, /const MAX_ATTEMPTS = 5/);
  assert.match(src, /function loadHistory\(\)[\s\S]{0,200}sessionStorage\.getItem\(HISTORY_KEY\)/);
  assert.match(src, /function saveHistory\(list\)[\s\S]{0,200}sessionStorage\.setItem\(HISTORY_KEY, JSON\.stringify\(list\.slice\(0, MAX_ATTEMPTS\)\)\)/);
  assert.match(src, /function newAttemptId\(\)/);
  assert.match(src, /function nextAttemptSeq\(\)/);
  // ogni scatto = nuova attempt session
  assert.match(src, /function startAttempt\(kind\)/);
  assert.match(src, /attemptId: newAttemptId\(\)/);
  assert.match(src, /n: nextAttemptSeq\(\)/);
  assert.match(src, /status: 'running'/);
});

test("DIAGNOSTICA — persist dopo OGNI stage; il tentativo nuovo NON sovrascrive il precedente (unshift + slice 5)", () => {
  const src = read("src/components/driver/PodCapture.jsx");
  const push = src.slice(src.indexOf("function pushStage"), src.indexOf("function finalizeAttempt"));
  assert.match(push, /persistCurrent\(a\)/);
  const persist = src.slice(src.indexOf("function persistCurrent"), src.indexOf("function startAttempt"));
  assert.match(persist, /list\.unshift\(\{ \.\.\.a \}\)/);
  assert.match(persist, /list\.slice\(0, MAX_ATTEMPTS\)/);
  // finalize marca il tentativo: success | failed | interrupted
  const fin = src.slice(src.indexOf("function finalizeAttempt"));
  assert.match(fin.slice(0, 600), /a\.status = status/);
  assert.match(src, /finalizeAttempt\('success'\)/);
  assert.match(src, /finalizeAttempt\('failed', \{ error: err/);
});

test("DIAGNOSTICA — history NON cancellata da fullCleanup / resetToIdle / reset input / preview teardown", () => {
  const src = read("src/components/driver/PodCapture.jsx");
  const cleanup = src.slice(src.indexOf("function fullCleanup"), src.indexOf("function resetToIdle"));
  assert.doesNotMatch(cleanup, /setHistory|saveHistory|HISTORY_KEY|removeItem/);
  const reset = src.slice(src.indexOf("function resetToIdle"), src.indexOf("function switchToLowMemory"));
  assert.doesNotMatch(reset, /setHistory|saveHistory|HISTORY_KEY|removeItem/);
  // l'unmount cleanup non tocca la history
  const unmount = src.slice(src.indexOf("Unmount: fotocamera"), src.indexOf("Unmount: fotocamera") + 320);
  assert.doesNotMatch(unmount, /setHistory|saveHistory|HISTORY_KEY|removeItem/);
});

test("DIAGNOSTICA — 'Ultima diagnostica foto': Tentativo #N, Stato, ULTIMO STAGE, Copia diagnostica, Mostra tentativi precedenti; SEMPRE fuori dai rami di stage", () => {
  const src = read("src/components/driver/PodCapture.jsx");
  assert.match(src, /\{cur && \(\s*\n\s*<div style=\{lastDiagStyle\}>/);
  assert.match(src, /Ultima diagnostica foto/);
  assert.match(src, /Tentativo #\{cur\.n\} · \{statusLabel\(cur\.status\)\}/);
  assert.match(src, /ULTIMO STAGE: \{cur\.lastStage/);
  assert.match(src, /onClick=\{\(\) => copyAttempt\(cur\)\}>Copia diagnostica</);
  assert.match(src, /Mostra tentativi precedenti/);
  assert.match(src, /history\.slice\(1\)\.map\(\(a\) =>/);
  assert.match(src, /function statusLabel\(status\)[\s\S]{0,300}'INTERRUPTED'/);
  const idxUploading = src.indexOf("stage === 'uploading'");
  const idxDiag = src.indexOf("{cur && (");
  assert.ok(idxDiag > idxUploading, "il blocco diagnostica va reso fuori dai rami di stage");
});

test("DIAGNOSTICA — errore PRIMA di input_received -> attempt failed, stage 'camera_pre_js', messaggio esplicito", () => {
  const src = read("src/components/driver/PodCapture.jsx");
  assert.match(src, /if \(!file\) \{[\s\S]{0,600}startAttempt\('gallery'\);[\s\S]{0,400}lastStageOverride: 'camera_pre_js'/);
  assert.match(src, /reason: 'camera_pre_js'/);
  assert.match(src, /Errore avvenuto prima che la foto arrivasse alla pipeline JavaScript/);
});

test("DIAGNOSTICA — al mount, ogni tentativo 'running' -> interrupted / reason=renderer_reload_or_oom", () => {
  const src = read("src/components/driver/PodCapture.jsx");
  assert.match(src, /function reconcileHistory\(list\)/);
  assert.match(src, /a\.status === 'running'/);
  assert.match(src, /status: 'interrupted'/);
  assert.match(src, /reason: 'renderer_reload_or_oom'/);
  // riconciliazione sia nell'initializer di stato sia in un useEffect (rimonto)
  assert.match(src, /useState\(\(\) => \{\s*\n\s*const \{ out, changed \} = reconcileHistory\(loadHistory\(\)\)/);
  assert.match(src, /useEffect\(\(\) => \{\s*\n\s*const \{ out, changed \} = reconcileHistory\(loadHistory\(\)\)/);
});

test("DIAGNOSTICA — l'oggetto tentativo porta i campi minimi richiesti dal ticket", () => {
  const src = read("src/components/driver/PodCapture.jsx");
  for (const field of ["attemptId", "startedAt", "updatedAt", "lastStage", "elapsedMs", "origBytes", "origWidth", "origHeight", "targetWidth", "targetHeight", "finalBytes", "errorName", "errorMessage", "memoryError"]) {
    assert.match(src, new RegExp(`${field}:`), `manca il campo tentativo ${field}`);
  }
  // stages array per tentativo
  assert.match(src, /a\.stages = stageLogRef\.current/);
});

test("DIAGNOSTICA — NON tocca resize / watermark / upload / GPS (solo layer diagnostico)", () => {
  const src = read("src/components/driver/PodCapture.jsx");
  // pipeline invariata: stessi call-site di compressione, watermark, blob, upload
  assert.match(src, /const compressed = await compressPodImage\(file, \{ maxDimension: profile\.maxDimension, onStage: pushStage \}\)/);
  assert.match(src, /drawPodWatermark\(canvas, buildDeliveryWatermarkLines\(\{/);
  assert.match(src, /const blob = await canvasToJpegBlob\(canvas, profile\.quality\)/);
  assert.match(src, /await uploadProofPhoto\(\{/);
  // reverseGeocode invariato, non bloccante
  assert.match(src, /geo = await reverseGeocode\(lastPosition\.lat, lastPosition\.lng\)\.catch\(\(\) => null\)/);
});

// ── DO NOT BREAK: watermark POD/DDT esistente e nota non toccati ─────────
test("buildPodWatermarkLines / buildProofPhotoNote / parseProofPhotoNote restano invariati (nessuna regressione POD)", () => {
  const pod = read("src/lib/pod/podPhotoProcessing.js");
  assert.match(pod, /export function buildPodWatermarkLines\(/);
  assert.match(pod, /export function buildProofPhotoNote\(/);
  assert.match(pod, /export function parseProofPhotoNote\(/);
});
