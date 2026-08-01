// Validazione/filtro punti GPS per il Monitor Admin: modulo puro (nessuna
// dipendenza da Supabase/DOM), usato per il calcolo distanza e la polilinea.
// Non cancella mai dati: prende una lista di punti gia' letti dal DB e
// separa validi/esclusi con un motivo, senza scrivere nulla.
export const GPS_MAX_ACCURACY_M = 100;
// ~45 m/s = 162 km/h: generoso per un mezzo in ambito urbano/periurbano,
// abbastanza basso da intercettare un salto impossibile tra due fix GPS.
export const GPS_MAX_SPEED_MPS = 45;
// Sotto questa distanza tra due timestamp identici/vicinissimi non ha senso
// calcolare una velocita' (evita divisioni per ~0 su duplicati ravvicinati).
const MIN_ELAPSED_S_FOR_SPEED_CHECK = 1;

export const EXCLUSION_REASONS = {
  INVALID_COORDINATES: 'invalid_coordinates',
  ZERO_COORDINATES: 'zero_coordinates',
  LOW_ACCURACY: 'low_accuracy',
  IMPOSSIBLE_JUMP: 'impossible_jump',
  DUPLICATE_POINT: 'duplicate_point',
};

export const EXCLUSION_LABELS = {
  invalid_coordinates: 'Coordinate non valide',
  zero_coordinates: 'Coordinate 0,0',
  low_accuracy: `Accuracy oltre soglia (${GPS_MAX_ACCURACY_M} m)`,
  impossible_jump: 'Salto geografico incompatibile col tempo trascorso',
  duplicate_point: 'Punto duplicato',
};

function toFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pointTimeMs(point) {
  const raw = point?.recorded_at || point?.recordedAt || point?.created_at;
  const ms = raw ? new Date(raw).getTime() : NaN;
  return Number.isFinite(ms) ? ms : null;
}

// Ordina per recorded_at (crescente) e separa i punti in validi/esclusi.
// Ogni punto e' confrontato SOLO con l'ultimo punto gia' considerato valido
// (non con il precedente in ordine grezzo): un singolo punto anomalo non
// contamina la valutazione di quelli successivi, corretti tra loro.
export function filterValidGpsPoints(points, options = {}) {
  const maxAccuracyM = options.maxAccuracyM ?? GPS_MAX_ACCURACY_M;
  const maxSpeedMps = options.maxSpeedMps ?? GPS_MAX_SPEED_MPS;

  const sorted = [...(points || [])].sort((a, b) => (pointTimeMs(a) ?? 0) - (pointTimeMs(b) ?? 0));

  const valid = [];
  const excluded = [];
  let lastValid = null;

  for (const point of sorted) {
    const lat = toFiniteNumber(point?.lat);
    const lng = toFiniteNumber(point?.lng);
    const accuracy = toFiniteNumber(point?.accuracy);
    const timeMs = pointTimeMs(point);

    if (lat == null || lng == null || lat < -90 || lat > 90 || lng < -180 || lng > 180 || timeMs == null) {
      excluded.push({ point, reason: EXCLUSION_REASONS.INVALID_COORDINATES });
      continue;
    }
    if (lat === 0 && lng === 0) {
      excluded.push({ point, reason: EXCLUSION_REASONS.ZERO_COORDINATES });
      continue;
    }
    if (accuracy != null && accuracy > maxAccuracyM) {
      excluded.push({ point, reason: EXCLUSION_REASONS.LOW_ACCURACY });
      continue;
    }
    if (lastValid) {
      const lastTimeMs = pointTimeMs(lastValid);
      // Nessun controllo "timestamp precedente al precedente" qui: i punti
      // sono gia' ordinati per recorded_at sopra, quindi rispetto
      // all'ultimo punto VALIDO gia' accettato timeMs >= lastTimeMs e'
      // sempre vero per costruzione. L'ordine "grezzo" di arrivo (che PUO'
      // essere fuori sequenza per punti inviati in coda offline) non e' un
      // dato anomalo: e' esattamente il motivo per cui si riordina prima.
      const elapsedS = lastTimeMs != null ? (timeMs - lastTimeMs) / 1000 : null;
      const distanceM = haversineMeters(Number(lastValid.lat), Number(lastValid.lng), lat, lng);
      if (elapsedS != null && elapsedS < MIN_ELAPSED_S_FOR_SPEED_CHECK && distanceM < 1) {
        excluded.push({ point, reason: EXCLUSION_REASONS.DUPLICATE_POINT });
        continue;
      }
      if (elapsedS != null && elapsedS >= MIN_ELAPSED_S_FOR_SPEED_CHECK) {
        const speedMps = distanceM / elapsedS;
        if (speedMps > maxSpeedMps) {
          excluded.push({ point, reason: EXCLUSION_REASONS.IMPOSSIBLE_JUMP });
          continue;
        }
      }
    }

    valid.push(point);
    lastValid = point;
  }

  return { valid, excluded };
}

// Distanza totale (km) sui soli punti validi, stessa formula haversine gia'
// usata da calculateDistanceKm — nessuna nuova logica di calcolo distanza,
// solo il filtro applicato prima della somma.
export function calculateFilteredDistanceKm(points, options = {}) {
  const { valid } = filterValidGpsPoints(points, options);
  let km = 0;
  for (let i = 1; i < valid.length; i += 1) {
    const a = valid[i - 1];
    const b = valid[i];
    km += haversineMeters(Number(a.lat), Number(a.lng), Number(b.lat), Number(b.lng)) / 1000;
  }
  return Math.round(km * 100) / 100;
}

// Qualita' GPS complessiva della sessione, per il pannello Admin: rapporto
// punti esclusi/totali, non un nuovo sistema di scoring.
export function summarizeGpsQuality(points) {
  const { valid, excluded } = filterValidGpsPoints(points);
  const total = (points || []).length;
  const excludedByReason = excluded.reduce((acc, item) => {
    acc[item.reason] = (acc[item.reason] || 0) + 1;
    return acc;
  }, {});
  const ratio = total > 0 ? valid.length / total : 0;
  const quality = total === 0 ? 'n/d' : ratio >= 0.9 ? 'buona' : ratio >= 0.6 ? 'accettabile' : 'scarsa';
  return { total, validCount: valid.length, excludedCount: excluded.length, excludedByReason, quality };
}
