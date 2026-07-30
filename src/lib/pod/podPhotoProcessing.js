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
