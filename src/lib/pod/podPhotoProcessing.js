// Utility pure (nessuna dipendenza da Supabase) per il flusso POD/foto Autista:
// validazione file, compressione via canvas, watermark, serializzazione dei
// metadati DDT/colli/esito dentro il campo "note" gia' esistente di
// proof_photos (nessuna colonna nuova, nessuna migration).

export const POD_MAX_INPUT_BYTES = 20 * 1024 * 1024; // 20MB, limite di sicurezza sul file originale
// TICKET — MEMORY EXHAUSTION: lato lungo target 1600px (range del ticket
// 1280-1920) e qualita' 0.8 (range 0.75-0.85). Il downscale avviene DURANTE
// il decode (createImageBitmap con resizeWidth/Height), non dopo: il buffer
// RGBA full-resolution di una foto 12MP (~48MB) non viene mai materializzato.
export const POD_MAX_DIMENSION = 1600;
export const POD_JPEG_QUALITY = 0.8;

// TICKET — PHOTO PIPELINE STILL FAILS ON REAL ANDROID DEVICE.
// Profilo memoria dinamico. `default` = comportamento attuale; `low` viene
// attivato automaticamente se navigator.deviceMemory <= 4 oppure dopo il
// primo errore memory-related (persistito in localStorage lato componente).
// In `low`: lato lungo piu' corto, qualita' piu' bassa, e l'anteprima usa una
// thumbnail dedicata (mai il blob finale a piena dimensione).
export const POD_MEMORY_PROFILES = {
  default: { id: 'default', maxDimension: POD_MAX_DIMENSION, quality: POD_JPEG_QUALITY },
  low: { id: 'low', maxDimension: 1280, quality: 0.7 },
};

// Anteprima leggera: la preview non decodifica mai il JPEG finale (1280-1600px).
export const POD_THUMB_MAX_DIMENSION = 480;
export const POD_THUMB_QUALITY = 0.6;

// TICKET — ANDROID CAMERA FLOW UNUSABLE.
// Root cause: <input type="file" capture="environment"> apre la camera OEM
// Samsung che consegna un JPEG 12MP (4080x3060, ~5MB) al renderer Chrome ->
// pressione memoria prima ancora che l'app veda il file. Il nuovo percorso
// usa getUserMedia con risoluzione VINCOLATA: nessun JPEG 12MP entra mai nel
// renderer. Il frame viene disegnato direttamente su un canvas <= 1600px.
export const POD_CAMERA_MAX_DIMENSION = 1600;
export const POD_CAMERA_CONSTRAINTS = {
  video: {
    facingMode: { ideal: 'environment' },
    width: { ideal: 1280, max: 1600 },
    height: { ideal: 960, max: 1200 },
  },
  audio: false,
};

// Cattura il frame corrente di un <video> (stream getUserMedia gia' a bassa
// risoluzione) su un canvas <= maxDimension. Nessun decode full-res, nessun
// ImageBitmap: il video element e' gia' la sorgente ridimensionata.
export function captureVideoFrame(video, maxDimension = POD_CAMERA_MAX_DIMENSION) {
  const vw = video?.videoWidth || 0;
  const vh = video?.videoHeight || 0;
  if (!vw || !vh) throw new Error('Frame video non pronto.');
  const { width, height } = fitLongSide(vw, vh, maxDimension);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Contesto canvas non disponibile su questo dispositivo.');
  ctx.drawImage(video, 0, 0, width, height);
  return { canvas, width, height, origWidth: vw, origHeight: vh };
}

// Arresta e rilascia uno stream getUserMedia + il video element collegato.
export function stopCameraStream(stream, video) {
  try {
    if (stream) stream.getTracks().forEach((t) => { try { t.stop(); } catch { /* gia' fermo */ } });
  } catch { /* stream non valido */ }
  if (video) {
    try { video.pause(); } catch { /* ignore */ }
    try { video.srcObject = null; } catch { /* ignore */ }
  }
}

// navigator.deviceMemory e' in GiB, arrotondato per difetto a 0.25/0.5/1/2/4/8.
// <= 4 e' la soglia indicata dal ticket per partire subito in modalita' leggera.
export function detectLowMemoryDevice() {
  try {
    const dm = Number(typeof navigator !== 'undefined' ? navigator.deviceMemory : 0);
    return Number.isFinite(dm) && dm > 0 && dm <= 4;
  } catch {
    return false;
  }
}

// Riconosce un errore di esaurimento memoria da qualunque fase (createImageBitmap,
// drawImage, toBlob, decode <img>, allocazione storage). Chrome Android usa
// messaggi diversi a seconda del punto: "Impossibile completare l'operazione
// precedente. Memoria insufficiente." dal renderer, RangeError/allocation da V8,
// QuotaExceededError dallo storage. In dubbio, meglio degradare al profilo low.
const MEMORY_ERROR_RE = /memory|memoria|insufficient|insufficiente|out of memory|allocation (failed|size)|operazione precedente|cannot allocate|quota/i;
export function isMemoryError(err) {
  if (!err) return false;
  const name = String(err.name || '');
  if (name === 'QuotaExceededError' || name === 'RangeError' || name === 'NS_ERROR_OUT_OF_MEMORY') return true;
  return MEMORY_ERROR_RE.test(String(err.message || err.name || err));
}

export const POD_OUTCOME_OPTIONS = [
  { value: 'consegnato', label: 'Consegnato' },
  { value: 'assente', label: 'Destinatario assente' },
  { value: 'rifiutato', label: 'Rifiutato' },
  { value: 'altro', label: 'Altro' },
];

export function podOutcomeLabel(value) {
  return POD_OUTCOME_OPTIONS.find((option) => option.value === value)?.label || 'Esito non specificato';
}

// Lancia un errore leggibile invece di lasciar fallire la compressione con un
// messaggio tecnico: file non immagine, vuoto, o troppo grande.
export function validatePodImageFile(file) {
  if (!file) throw new Error('Nessun file selezionato.');
  if (!file.type || !file.type.startsWith('image/')) {
    throw new Error('Il file scelto non e\' un\'immagine valida.');
  }
  if (file.size === 0) {
    throw new Error('Il file selezionato e\' vuoto.');
  }
  if (file.size > POD_MAX_INPUT_BYTES) {
    throw new Error(`Il file supera ${Math.round(POD_MAX_INPUT_BYTES / (1024 * 1024))}MB: scegli una foto piu\' leggera.`);
  }
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Impossibile leggere il file immagine: potrebbe essere corrotto o in un formato non supportato.'));
    };
    img.src = url;
  });
}

// Legge SOLO le dimensioni da un header JPEG (marker SOF) senza decodificare
// i pixel. Serve per far ridimensionare createImageBitmap DURANTE il decode
// mantenendo l'aspect ratio, invece di decodificare full-res e ridurre dopo.
// Ritorna null se non e' un JPEG o l'header non e' leggibile (fallback gestito
// dal chiamante).
export function readJpegDimensions(bytes) {
  if (!bytes || bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) { i += 1; continue; }
    const marker = bytes[i + 1];
    // marker senza payload
    if (marker === 0xff) { i += 1; continue; }
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    if (len < 2) return null;
    // SOF0..SOF15 (escludendo DHT 0xC4, JPG 0xC8, DAC 0xCC) -> contiene h/w
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const height = (bytes[i + 5] << 8) | bytes[i + 6];
      const width = (bytes[i + 7] << 8) | bytes[i + 8];
      if (width > 0 && height > 0) return { width, height };
      return null;
    }
    i += 2 + len;
  }
  return null;
}

export function fitLongSide(width, height, maxDimension) {
  const longSide = Math.max(width, height);
  const scale = longSide > maxDimension ? maxDimension / longSide : 1;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

// Rilascio esplicito del backing store di un canvas: azzerarne le dimensioni
// libera subito la memoria RGBA invece di aspettare il GC (decisivo su
// Chrome Android quando si scattano piu' foto di fila).
export function releaseCanvas(canvas) {
  try {
    if (canvas) { canvas.width = 1; canvas.height = 1; }
  } catch { /* canvas gia' scollegato */ }
}

// TICKET — MEMORY EXHAUSTION: produce un canvas GIA' ridimensionato al lato
// lungo `maxDimension`, decodificando a risoluzione ridotta quando possibile
// (createImageBitmap con resizeWidth/Height + header JPEG per l'aspect
// ratio). Nessun buffer full-resolution vive mai: ne' un <Image> full-res,
// ne' un ImageBitmap full-res. Il File originale non viene trattenuto oltre
// la durata di questa funzione.
export async function compressPodImage(file, { maxDimension = POD_MAX_DIMENSION, onStage } = {}) {
  validatePodImageFile(file);
  const report = typeof onStage === 'function' ? onStage : () => {};

  let bitmap = null;
  let origWidth = null;
  let origHeight = null;
  try {
    if (typeof createImageBitmap === 'function') {
      // 1) prova a ricavare le dimensioni dal solo header (nessun decode)
      let target = null;
      try {
        const head = new Uint8Array(await file.slice(0, 128 * 1024).arrayBuffer());
        const dims = readJpegDimensions(head);
        if (dims) {
          origWidth = dims.width;
          origHeight = dims.height;
          target = fitLongSide(dims.width, dims.height, maxDimension);
        }
      } catch { /* header non leggibile: si prosegue senza target noto */ }

      report('dimensions_read', {
        origWidth, origHeight,
        targetWidth: target?.width ?? null,
        targetHeight: target?.height ?? null,
        headerDims: !!target,
      });

      report('bitmap_start', { path: target ? 'resize_on_decode' : 'full_decode' });
      if (target) {
        // decode DIRETTO alla risoluzione target: mai il full-res in RAM
        bitmap = await createImageBitmap(file, {
          resizeWidth: target.width,
          resizeHeight: target.height,
          resizeQuality: 'high',
        });
      } else {
        // non-JPEG (es. PNG/WebP da galleria) o header illeggibile: decode
        // pieno una volta, poi ricampiona se serve e chiudi subito il primo.
        const full = await createImageBitmap(file);
        origWidth = full.width;
        origHeight = full.height;
        if (Math.max(full.width, full.height) > maxDimension) {
          const t = fitLongSide(full.width, full.height, maxDimension);
          const resized = await createImageBitmap(full, 0, 0, full.width, full.height, {
            resizeWidth: t.width, resizeHeight: t.height, resizeQuality: 'high',
          });
          full.close();
          bitmap = resized;
        } else {
          bitmap = full;
        }
      }
      report('bitmap_done', { width: bitmap.width, height: bitmap.height });

      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Contesto canvas non disponibile su questo dispositivo.');
      report('canvas_draw_start', { width: canvas.width, height: canvas.height });
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
      bitmap = null;
      report('canvas_draw_done');
      return { canvas, width: canvas.width, height: canvas.height, origWidth, origHeight };
    }

    // Fallback estremo (browser senza createImageBitmap): Image + canvas.
    report('bitmap_start', { path: 'image_element_fallback' });
    const img = await loadImageFromFile(file);
    try {
      origWidth = img.naturalWidth || img.width;
      origHeight = img.naturalHeight || img.height;
      const { width, height } = fitLongSide(origWidth, origHeight, maxDimension);
      report('bitmap_done', { width, height, origWidth, origHeight });
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Contesto canvas non disponibile su questo dispositivo.');
      report('canvas_draw_start', { width, height });
      ctx.drawImage(img, 0, 0, width, height);
      report('canvas_draw_done');
      return { canvas, width, height, origWidth, origHeight };
    } finally {
      if (img.src?.startsWith('blob:')) URL.revokeObjectURL(img.src);
      img.src = '';
    }
  } finally {
    if (bitmap) { try { bitmap.close(); } catch { /* gia' chiuso */ } }
  }
}

// Anteprima leggera: ridisegna il canvas finale (gia' downscalato + watermark)
// dentro un canvas piccolo (<= 480px lato lungo) e ne ritorna un JPEG ~40-80KB.
// Cosi' la preview <img> non decodifica mai il JPEG finale da 1280-1600px.
// Il canvas thumbnail viene rilasciato subito.
export async function makeThumbnailBlob(sourceCanvas, { maxDimension = POD_THUMB_MAX_DIMENSION, quality = POD_THUMB_QUALITY } = {}) {
  if (!sourceCanvas || !sourceCanvas.width || !sourceCanvas.height) return null;
  const { width, height } = fitLongSide(sourceCanvas.width, sourceCanvas.height, maxDimension);
  const thumb = document.createElement('canvas');
  thumb.width = width;
  thumb.height = height;
  try {
    const ctx = thumb.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(sourceCanvas, 0, 0, width, height);
    return await canvasToJpegBlob(thumb, quality);
  } catch {
    return null;
  } finally {
    releaseCanvas(thumb);
  }
}

// Disegna una fascia semi-trasparente in basso con le righe di testo indicate
// (data/ora, cliente, DDT, colli, esito, indirizzo, coordinate, autista).
// Muta il canvas passato e lo ritorna per comodita' di chaining.
export function drawPodWatermark(canvas, lines) {
  const rows = (lines || []).filter(Boolean);
  if (!rows.length) return canvas;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const fontSize = Math.max(11, Math.round(canvas.width / 42));
  const lineHeight = Math.round(fontSize * 1.35);
  const paddingX = Math.round(fontSize * 0.8);
  const paddingY = Math.round(fontSize * 0.7);
  const bandHeight = rows.length * lineHeight + paddingY * 2;

  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, canvas.height - bandHeight, canvas.width, bandHeight);

  ctx.fillStyle = '#ffffff';
  ctx.font = `${fontSize}px system-ui, -apple-system, sans-serif`;
  ctx.textBaseline = 'top';
  rows.forEach((line, index) => {
    const y = canvas.height - bandHeight + paddingY + index * lineHeight;
    ctx.fillText(String(line), paddingX, y, canvas.width - paddingX * 2);
  });
  ctx.restore();
  return canvas;
}

export function canvasToJpegBlob(canvas, quality = POD_JPEG_QUALITY) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Compressione immagine non riuscita.'));
          return;
        }
        resolve(blob);
      },
      'image/jpeg',
      quality,
    );
  });
}

function formatCoordinate(value) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(5) : null;
}

// Righe mostrate nel watermark, in ordine fisso e leggibile.
export function buildPodWatermarkLines({ takenAt, client, address, ddt, colli, outcome, driverName, lat, lng }) {
  const coordLat = formatCoordinate(lat);
  const coordLng = formatCoordinate(lng);
  return [
    takenAt ? new Date(takenAt).toLocaleString('it-IT') : null,
    client ? `Cliente: ${client}` : null,
    address ? `Indirizzo: ${address}` : null,
    ddt ? `DDT: ${ddt}` : null,
    colli ? `Colli: ${colli}` : null,
    outcome ? `Esito: ${podOutcomeLabel(outcome)}` : null,
    coordLat && coordLng ? `GPS: ${coordLat}, ${coordLng}` : null,
    driverName ? `Autista: ${driverName}` : null,
  ].filter(Boolean);
}

// ---------------------------------------------------------------------------
// TICKET — REQUISITO WATERMARK FOTO CLIENTE.
//
// Watermark AUTOMATICO, mai digitato dal Driver: solo dati realmente
// disponibili nello stesso momento in cui vengono salvati nel DB (stesso
// taken_at/lat/lng passati a uploadProofPhoto/uploadIssueVerificationPhoto
// subito dopo — nessuna fonte diversa, nessun drift possibile tra quello che
// il cliente legge nell'immagine e quello che e' scritto nel record). EXIF
// non viene mai letto: i valori vengono dal capture flow stesso (posizione
// GPS del dispositivo, orologio del dispositivo), non da metadati embedded
// nel file immagine.
// ---------------------------------------------------------------------------
const WATERMARK_MONTHS_IT = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];

// Locale al dispositivo che scatta: nessuna conversione di fuso necessaria,
// il watermark viene generato nello stesso istante/dispositivo dello scatto.
export function formatWatermarkDateTime(takenAt) {
  const d = takenAt ? new Date(takenAt) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${d.getDate()} ${WATERMARK_MONTHS_IT[d.getMonth()]} ${d.getFullYear()} ${hh}:${mm}:${ss}`;
}

// Foto di consegna (proof_photos): nessuna colonna di indirizzo esiste per
// questa tabella. `street`/`houseNumber`/`geoCity` arrivano da un reverse
// geocoding NON bloccante e time-boxed (reverseGeocode in geocodeAddress.js,
// Fase 4 del ticket): se presenti sono REALI (componenti della risposta
// Nominatim), altrimenti si mostrano le coordinate reali (o "Indirizzo non
// disponibile" se anche il GPS manca) — mai una via/citta' inventata. `city`
// (Comune della zona/campagna attiva, source of truth interna, stessa fonte
// del confine mappa in DriverAssignmentPage.jsx) ha comunque priorita' sul
// `geoCity`. "GPS verificato" SOLO se lat/lng sono presenti e validi.
// Un fix GPS valido richiede lat/lng realmente presenti e finiti; (0, 0) e'
// il sentinel di "nessun fix" gia' trattato come non valido altrove nel
// progetto — non e' una coordinata reale utile per una foto di consegna.
function hasRealGps(lat, lng) {
  if (lat == null || lng == null) return false;
  const nlat = Number(lat);
  const nlng = Number(lng);
  if (!Number.isFinite(nlat) || !Number.isFinite(nlng)) return false;
  return !(nlat === 0 && nlng === 0);
}

export function buildDeliveryWatermarkLines({ takenAt, lat, lng, city, street, houseNumber, geoCity }) {
  const gps = hasRealGps(lat, lng);
  // Via/civico dal reverse geocoding NON bloccante (Fase 4): usati SOLO se
  // reali; altrimenti le coordinate reali, mai una via indovinata.
  const addressLine = street ? `${street}${houseNumber ? ` ${houseNumber}` : ''}` : null;
  // Comune: preferisci quello della zona/campagna (source of truth interna);
  // se manca, quello del reverse geocoding; mai inventato.
  const cityLine = city ? String(city) : (geoCity ? String(geoCity) : null);
  return [
    formatWatermarkDateTime(takenAt),
    addressLine || (gps ? `${formatCoordinate(lat)}, ${formatCoordinate(lng)}` : 'Indirizzo non disponibile'),
    cityLine,
    gps ? 'GPS verificato' : null,
  ].filter(Boolean);
}

// Foto di verifica segnalazione (issue_verification_photos): via/civico/
// comune sono REALI (customer_issues.street/house_number/municipality,
// scelti dal Cliente in fase di segnalazione — mai digitati qui dal
// Driver). lat/lng sono il GPS del dispositivo al momento dello scatto
// (obbligatorio per queste foto: driver_register_issue_photo lato RPC
// rifiuta coordinate mancanti, quindi "GPS verificato" e' sempre vero qui).
export function buildIssueWatermarkLines({ takenAt, lat, lng, municipality, street, houseNumber }) {
  const gps = hasRealGps(lat, lng);
  const addressLine = street ? `${street}${houseNumber ? ` ${houseNumber}` : ''}` : null;
  return [
    formatWatermarkDateTime(takenAt),
    addressLine || (gps ? `${formatCoordinate(lat)}, ${formatCoordinate(lng)}` : 'Indirizzo non disponibile'),
    municipality ? String(municipality) : null,
    gps ? 'GPS verificato' : null,
  ].filter(Boolean);
}

// I metadati DDT/colli/esito/cliente/indirizzo non hanno colonne dedicate in
// proof_photos: vengono serializzati dentro "note" (gia' esistente, text
// libero) come JSON. parseProofPhotoNote sa leggere sia questo formato sia
// una nota semplice pre-esistente (fallback a { note: raw }).
function cleanText(value) {
  const trimmed = value ? String(value).trim() : '';
  return trimmed || null;
}

export function buildProofPhotoNote({ client, address, ddt, colli, outcome, note, driverName } = {}) {
  const payload = {
    v: 1,
    client: cleanText(client),
    address: cleanText(address),
    ddt: cleanText(ddt),
    colli: Number.isFinite(Number(colli)) && Number(colli) > 0 ? Number(colli) : null,
    outcome: outcome || null,
    note: cleanText(note),
    driverName: cleanText(driverName),
  };
  return JSON.stringify(payload);
}

export function parseProofPhotoNote(raw) {
  const empty = { client: null, address: null, ddt: null, colli: null, outcome: null, note: null, driverName: null };
  if (!raw) return empty;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.v === 1) {
      return { ...empty, ...parsed };
    }
  } catch {
    // non era JSON: si tratta di una nota semplice pre-esistente
  }
  return { ...empty, note: String(raw) };
}
