// Studio Mappa — motore SIMULAZIONE (interpolazione PURA lungo la rete).
//
// FASE 1: solo la logica pura, NON cablata in UI (SimulationPanel e' un
// placeholder). NESSUNA scrittura: non tocca gps_tracking_points,
// delivery_sessions, Driver. E' solo visualizzazione/progettazione.

import { haversineMeters } from './mapStudioGeometry.js';

// Concatena le linee di un operatore in un'unica polilinea "percorso"
// (ordine dato). Ritorna { path, cumulative, totalM }.
export function buildRoute(lines) {
  const path = [];
  for (const line of lines || []) {
    for (const p of line || []) {
      if (path.length === 0 || path[path.length - 1][0] !== p[0] || path[path.length - 1][1] !== p[1]) {
        path.push([p[0], p[1]]);
      }
    }
  }
  const cumulative = [0];
  for (let i = 1; i < path.length; i += 1) {
    cumulative.push(cumulative[i - 1] + haversineMeters(path[i - 1], path[i]));
  }
  return { path, cumulative, totalM: cumulative[cumulative.length - 1] || 0 };
}

// Posizione lungo il percorso a distanza `distM` dall'inizio. Ritorna [lat,lng].
export function positionAtDistance(route, distM) {
  const { path, cumulative, totalM } = route;
  if (path.length === 0) return null;
  const d = Math.max(0, Math.min(distM, totalM));
  let lo = 0;
  let hi = cumulative.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cumulative[mid] < d) lo = mid + 1; else hi = mid;
  }
  const i = Math.max(1, lo);
  const segStart = cumulative[i - 1];
  const segLen = cumulative[i] - segStart || 1;
  const t = (d - segStart) / segLen;
  const a = path[i - 1];
  const b = path[i];
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

// Avanza di `speedMs * dtSeconds` metri. Stato { distM }. Ritorna nuovo stato +
// posizione + done.
export function stepSimulation(route, state, dtSeconds, speedMs) {
  const nextDist = (state.distM || 0) + speedMs * dtSeconds;
  const done = nextDist >= route.totalM;
  return {
    state: { distM: done ? route.totalM : nextDist },
    position: positionAtDistance(route, nextDist),
    done,
    progress: route.totalM > 0 ? Math.min(1, nextDist / route.totalM) : 1,
  };
}
