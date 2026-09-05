// Utility pure (nessuna dipendenza da Supabase) per il flusso POD/foto Autista:
// validazione file, compressione via canvas, watermark, serializzazione dei
// metadati DDT/colli/esito dentro il campo "note" gia' esistente di
// proof_photos (nessuna colonna nuova, nessuna migration).

export const POD_MAX_INPUT_BYTES = 20 * 1024 * 1024; // 20MB, limite di sicurezza sul file originale
export const POD_MAX_DIMENSION = 960;
export const POD_JPEG_QUALITY = 0.6;

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

// Ridimensiona al lato lungo massimo indicato e ricomprime in JPEG alla
// qualita' indicata. Ritorna { blob, width, height, objectUrl } cosi' il
// chiamante puo' mostrare l'anteprima senza ricreare l'URL.
export async function compressPodImage(file, { maxDimension = POD_MAX_DIMENSION, quality = POD_JPEG_QUALITY } = {}) {
  validatePodImageFile(file);
  const img = await loadImageFromFile(file);
  try {
    const longSide = Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height);
    const scale = longSide > maxDimension ? maxDimension / longSide : 1;
    const width = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
    const height = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Contesto canvas non disponibile su questo dispositivo.');
    ctx.drawImage(img, 0, 0, width, height);

    return { canvas, width, height };
  } finally {
    if (img.src?.startsWith('blob:')) URL.revokeObjectURL(img.src);
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
