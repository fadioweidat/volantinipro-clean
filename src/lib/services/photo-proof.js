export const PHOTO_APP_VERSION = 'operator-photo-proof-v1';
const PHOTO_HASH_KEY = 'volantinipro:photo-proof-hashes';
const PHOTO_NOTE_PREFIX = '[VP_PHOTO_PROOF]';

export async function createPhotoProofPackage(file, {
  campaignId,
  sessionId,
  operatorName,
  details = {},
  position = null,
  boundary = null,
  note = '',
} = {}) {
  if (!file) throw new Error('Scatta una foto dalla fotocamera.');
  if (!file.type?.startsWith('image/')) throw new Error('Il file selezionato non e una foto valida.');

  const photoId = createPhotoId();
  const device = readDeviceInfo();
  const quality = await analyzeImageQuality(file);
  const watermarkedFile = await buildWatermarkedPhoto(file, {
    photoId,
    operatorName,
    campaignId,
    comune: details.comune,
    lat: position?.lat,
    lng: position?.lng,
  });
  const hash = await sha256File(watermarkedFile);
  const gps = validateGps(position, boundary);
  const duplicate = readKnownHashes().includes(hash);
  const metadata = {
    version: PHOTO_APP_VERSION,
    photoId,
    hash,
    acquiredAt: new Date().toISOString(),
    campaignId,
    sessionId: sessionId || null,
    operatorName: operatorName || 'Operatore',
    client: details.client || details.title || null,
    service: details.service || null,
    comune: details.comune || null,
    provincia: details.provincia || null,
    lat: position?.lat ?? null,
    lng: position?.lng ?? null,
    accuracy: position?.accuracy ?? null,
    speed: position?.speed ?? null,
    heading: position?.heading ?? null,
    altitude: position?.altitude ?? null,
    device,
    originalFile: {
      name: file.name || null,
      type: file.type || null,
      size: file.size || null,
    },
    archivedFile: {
      name: watermarkedFile.name,
      type: watermarkedFile.type,
      size: watermarkedFile.size,
    },
    quality,
    checks: {
      gps,
      duplicate: {
        status: duplicate ? 'warning' : 'ok',
        message: duplicate ? 'Hash gia acquisito su questo dispositivo.' : 'Hash non presente nello storico locale.',
      },
    },
  };
  metadata.alerts = buildPhotoAlerts(metadata);
  return {
    file: watermarkedFile,
    hash,
    metadata,
    note: serializePhotoNote(metadata, note),
  };
}

export function rememberPhotoHash(hash) {
  if (!hash) return;
  const hashes = readKnownHashes();
  if (hashes.includes(hash)) return;
  window.localStorage.setItem(PHOTO_HASH_KEY, JSON.stringify([...hashes, hash].slice(-2000)));
}

export function enrichProofPhoto(photo) {
  const metadata = parsePhotoNote(photo?.note);
  const lat = Number(photo?.lat ?? metadata.lat);
  const lng = Number(photo?.lng ?? metadata.lng);
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);
  const quality = metadata.quality || {};
  const gps = metadata.checks?.gps || validateGps(hasCoords ? { lat, lng, accuracy: metadata.accuracy } : null, null);
  const hash = metadata.hash || findNoteValue(photo?.note, 'Hash foto') || null;
  const alerts = Array.isArray(metadata.alerts) ? metadata.alerts : buildPhotoAlerts({ ...metadata, checks: { gps }, quality });
  const status = photo?.approved_at ? 'approvata' : alerts.some((alert) => alert.level === 'red') ? 'da verificare' : 'verifica automatica ok';
  return {
    ...photo,
    metadata,
    lat: hasCoords ? lat : photo?.lat,
    lng: hasCoords ? lng : photo?.lng,
    proof: {
      photoId: metadata.photoId || photo?.id || 'n/d',
      hash,
      operatorName: metadata.operatorName || findNoteValue(photo?.note, 'Operatore') || photo?.driver_id || 'n/d',
      campaignId: metadata.campaignId || photo?.campaign_id || 'n/d',
      sessionId: metadata.sessionId || photo?.session_id || 'n/d',
      comune: metadata.comune || findNoteValue(photo?.note, 'Comune') || 'n/d',
      provincia: metadata.provincia || 'n/d',
      client: metadata.client || 'n/d',
      service: metadata.service || 'n/d',
      device: metadata.device?.label || metadata.device?.userAgent || 'n/d',
      size: metadata.archivedFile?.size || metadata.originalFile?.size || null,
      quality,
      gps,
      alerts,
      status,
      acquiredAt: metadata.acquiredAt || photo?.taken_at || photo?.created_at,
    },
  };
}

export function photoSearchMatches(photo, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  const proof = photo.proof || enrichProofPhoto(photo).proof;
  return [
    proof.photoId,
    proof.hash,
    proof.operatorName,
    proof.campaignId,
    proof.sessionId,
    proof.comune,
    proof.provincia,
    proof.client,
    proof.service,
    photo.id,
  ].filter(Boolean).join(' ').toLowerCase().includes(q);
}

export function buildPhotoArchiveCsv(photos) {
  const rows = [
    ['photo_id', 'campaign_id', 'session_id', 'operator', 'client', 'service', 'comune', 'provincia', 'lat', 'lng', 'accuracy', 'hash', 'status', 'quality', 'size', 'taken_at'],
    ...photos.map((photo) => {
      const proof = photo.proof || enrichProofPhoto(photo).proof;
      return [
        proof.photoId,
        proof.campaignId,
        proof.sessionId,
        proof.operatorName,
        proof.client,
        proof.service,
        proof.comune,
        proof.provincia,
        photo.lat ?? '',
        photo.lng ?? '',
        proof.gps?.accuracy ?? '',
        proof.hash || '',
        proof.status,
        proof.quality?.score ?? '',
        proof.size ?? '',
        proof.acquiredAt || '',
      ];
    }),
  ];
  return rows.map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
}

function serializePhotoNote(metadata, note) {
  return [
    note?.trim(),
    `${PHOTO_NOTE_PREFIX}${JSON.stringify(metadata)}`,
    `Operatore: ${metadata.operatorName}`,
    `Campagna: ${metadata.campaignId}`,
    `Comune: ${metadata.comune || 'n/d'}`,
    metadata.lat != null && metadata.lng != null ? `Coordinate: ${Number(metadata.lat).toFixed(6)}, ${Number(metadata.lng).toFixed(6)}` : 'Coordinate: non disponibili',
    `Hash foto: ${metadata.hash}`,
    `ID foto: ${metadata.photoId}`,
    `Scatto: ${metadata.acquiredAt}`,
  ].filter(Boolean).join('\n');
}

function parsePhotoNote(note) {
  const text = String(note || '');
  const line = text.split('\n').find((item) => item.startsWith(PHOTO_NOTE_PREFIX));
  if (!line) return {};
  try {
    return JSON.parse(line.slice(PHOTO_NOTE_PREFIX.length));
  } catch {
    return {};
  }
}

function findNoteValue(note, label) {
  const prefix = `${label}:`;
  const line = String(note || '').split('\n').find((item) => item.toLowerCase().startsWith(prefix.toLowerCase()));
  return line ? line.slice(prefix.length).trim() : null;
}

function validateGps(position, boundary) {
  const lat = Number(position?.lat);
  const lng = Number(position?.lng);
  const accuracy = Number(position?.accuracy);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { status: 'red', message: 'GPS assente o coordinate non valide.', accuracy: null, insideArea: null };
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { status: 'red', message: 'Coordinate fuori range geografico.', accuracy: Number.isFinite(accuracy) ? accuracy : null, insideArea: null };
  }
  const insideArea = boundary ? pointInPolygon(lat, lng, boundary) : null;
  if (insideArea === false) {
    return { status: 'red', message: 'Foto fuori dall area assegnata.', accuracy: Number.isFinite(accuracy) ? accuracy : null, insideArea };
  }
  if (Number.isFinite(accuracy) && accuracy > 80) {
    return { status: 'warning', message: 'Precisione GPS insufficiente.', accuracy, insideArea };
  }
  return { status: 'ok', message: boundary ? 'GPS valido e interno all area.' : 'GPS valido, area non confrontabile.', accuracy: Number.isFinite(accuracy) ? accuracy : null, insideArea };
}

function buildPhotoAlerts(metadata) {
  const alerts = [];
  const gps = metadata.checks?.gps;
  if (gps?.status === 'red') alerts.push({ level: 'red', label: 'GPS', message: gps.message });
  if (gps?.status === 'warning') alerts.push({ level: 'yellow', label: 'GPS', message: gps.message });
  if (metadata.checks?.duplicate?.status === 'warning') alerts.push({ level: 'yellow', label: 'Duplicato', message: metadata.checks.duplicate.message });
  if (metadata.quality?.status === 'red') alerts.push({ level: 'red', label: 'Qualita', message: metadata.quality.message });
  if (metadata.quality?.status === 'warning') alerts.push({ level: 'yellow', label: 'Qualita', message: metadata.quality.message });
  return alerts;
}

async function analyzeImageQuality(file) {
  const image = await loadImage(file);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const megapixels = (width * height) / 1000000;
  const sample = sampleImage(image);
  const score = Math.max(0, Math.min(100, Math.round(
    (megapixels >= 1 ? 30 : megapixels * 30) +
    sample.brightnessScore * 30 +
    sample.contrastScore * 25 +
    (file.size <= 8 * 1024 * 1024 ? 15 : 6)
  )));
  const status = score < 45 || width < 900 || height < 650 ? 'red' : score < 68 ? 'warning' : 'ok';
  const message = status === 'ok' ? 'Qualita immagine adeguata.' : status === 'warning' ? 'Qualita da verificare.' : 'Qualita insufficiente o risoluzione bassa.';
  return {
    status,
    score,
    message,
    width,
    height,
    megapixels: Math.round(megapixels * 100) / 100,
    fileSize: file.size,
    brightness: sample.brightness,
    contrast: sample.contrast,
  };
}

function sampleImage(image) {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0, 64, 64);
  const data = ctx.getImageData(0, 0, 64, 64).data;
  const values = [];
  for (let i = 0; i < data.length; i += 4) {
    values.push((data[i] + data[i + 1] + data[i + 2]) / 3);
  }
  const brightness = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - brightness) ** 2, 0) / values.length;
  const contrast = Math.sqrt(variance);
  const brightnessScore = brightness < 35 || brightness > 225 ? 0.25 : brightness < 55 || brightness > 205 ? 0.65 : 1;
  const contrastScore = contrast < 18 ? 0.35 : contrast < 30 ? 0.7 : 1;
  return {
    brightness: Math.round(brightness),
    contrast: Math.round(contrast),
    brightnessScore,
    contrastScore,
  };
}

async function buildWatermarkedPhoto(file, data) {
  const image = await loadImage(file);
  const canvas = document.createElement('canvas');
  const maxWidth = 1600;
  const scale = Math.min(1, maxWidth / image.width);
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const lines = [
    'VolantiniPro proof',
    data.operatorName,
    data.comune,
    data.lat != null && data.lng != null ? `${Number(data.lat).toFixed(5)}, ${Number(data.lng).toFixed(5)}` : 'GPS non disponibile',
    `Campagna ${shortId(data.campaignId)} - Foto ${shortId(data.photoId)}`,
    new Date().toLocaleString('it-IT'),
  ].filter(Boolean);
  ctx.fillStyle = 'rgba(8, 16, 30, .76)';
  ctx.fillRect(0, canvas.height - 30 * lines.length - 24, canvas.width, 30 * lines.length + 24);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `${Math.max(17, Math.round(canvas.width * 0.017))}px Arial`;
  lines.forEach((line, idx) => ctx.fillText(line, 24, canvas.height - 30 * (lines.length - idx) + 6));
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
  return new File([blob], `${file.name?.replace(/\.[^.]+$/, '') || 'photo'}-${data.photoId}.jpg`, { type: 'image/jpeg' });
}

async function sha256File(file) {
  if (!crypto.subtle) return `hash-${Date.now()}`;
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      resolve(img);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function pointInPolygon(lat, lng, geom) {
  const rings = geom?.type === 'Polygon'
    ? [geom.coordinates[0]]
    : geom?.type === 'MultiPolygon'
      ? geom.coordinates.map((poly) => poly[0])
      : null;
  if (!rings) return true;
  return rings.some((ring) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i) {
      const xi = ring[i][0];
      const yi = ring[i][1];
      const xj = ring[j][0];
      const yj = ring[j][1];
      const intersects = ((yi > lat) !== (yj > lat)) && (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi);
      if (intersects) inside = !inside;
    }
    return inside;
  });
}

function readKnownHashes() {
  try {
    return JSON.parse(window.localStorage.getItem(PHOTO_HASH_KEY) || '[]');
  } catch {
    return [];
  }
}

function readDeviceInfo() {
  const nav = typeof navigator !== 'undefined' ? navigator : {};
  return {
    label: nav.platform || 'browser',
    userAgent: nav.userAgent || null,
    language: nav.language || null,
    appVersion: PHOTO_APP_VERSION,
  };
}

function createPhotoId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function shortId(value) {
  return value ? String(value).slice(0, 8) : 'n/d';
}
