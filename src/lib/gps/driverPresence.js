// Stato di presenza dell'operatore (ONLINE / SEGNALE DEBOLE / OFFLINE): UNA
// sola regola per Admin header, riga operatore Admin e Cliente.
//
// Prima esistevano tre regole diverse sullo stesso dato (diagnosi GPS
// 2026-10-01): header Admin "online" se < 45 s da session.updated_at, riga
// Admin "ONLINE" fino a 5 min (warning mostrato come ONLINE), Cliente
// "Online" fino a 5 min dall'ultimo punto GPS. Con buchi GPS reali di 2-7
// minuti le tre viste si contraddicevano.
//
// Ultima attivita' = max(session.updated_at, ultimo punto GPS recorded_at):
// updated_at e' toccato dall'heartbeat dell'app (ogni 20 s), recorded_at dal
// dispositivo quando registra una posizione. Vince il piu' recente dei due —
// mai il primo disponibile con `||`.
//
// Funzioni pure: nessuna rete, nessuna scrittura.

export const DRIVER_PRESENCE_ONLINE_MAX_MS = 2 * 60_000;
export const DRIVER_PRESENCE_WEAK_MAX_MS = 5 * 60_000;

export const DRIVER_PRESENCE_LABELS = Object.freeze({
  online: 'ONLINE',
  weak: 'SEGNALE DEBOLE',
  offline: 'OFFLINE',
});

function toMs(value) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** ISO della piu' recente fra session.updated_at e lastPoint.recorded_at (null se nessuna). */
export function resolveLastActivityIso(session, lastPoint) {
  const candidates = [session?.updated_at, lastPoint?.recorded_at]
    .map((value) => ({ value, ms: toMs(value) }))
    .filter((c) => c.ms != null);
  if (!candidates.length) return null;
  const latest = candidates.reduce((a, b) => (b.ms > a.ms ? b : a));
  return new Date(latest.ms).toISOString();
}

/** 'online' (<= 2 min) | 'weak' (> 2 e <= 5 min) | 'offline' (> 5 min o nessuna attivita'). */
export function classifyPresenceFromActivity(lastActivityIso, nowMs = Date.now()) {
  const lastMs = toMs(lastActivityIso);
  if (lastMs == null) return 'offline';
  const ageMs = Math.max(0, nowMs - lastMs);
  if (ageMs <= DRIVER_PRESENCE_ONLINE_MAX_MS) return 'online';
  if (ageMs <= DRIVER_PRESENCE_WEAK_MAX_MS) return 'weak';
  return 'offline';
}

/** Ultimo punto (per recorded_at) di una sessione, da una lista di punti di qualsiasi ordine. */
export function latestPointForSession(points, sessionId) {
  let latest = null;
  let latestMs = -Infinity;
  for (const point of Array.isArray(points) ? points : []) {
    if (sessionId && point?.session_id !== sessionId) continue;
    const ms = toMs(point?.recorded_at);
    if (ms == null) continue;
    if (ms >= latestMs) {
      latest = point;
      latestMs = ms;
    }
  }
  return latest;
}

/** { status, label, lastActivityIso } per una sessione e il suo ultimo punto GPS. */
export function classifyDriverPresence({ session, lastPoint, nowMs = Date.now() } = {}) {
  const lastActivityIso = resolveLastActivityIso(session, lastPoint);
  const status = classifyPresenceFromActivity(lastActivityIso, nowMs);
  return { status, label: DRIVER_PRESENCE_LABELS[status], lastActivityIso };
}

export const SESSION_TERMINAL_LABEL = 'TERMINATO';
export const SESSION_PAUSED_LABEL = 'IN PAUSA';

/**
 * Etichetta della riga operatore / pannello sessioni.
 * Lo stato terminale dipende SOLO dal record (completed/cancelled); una
 * sessione ancora 'started', anche inattiva da giorni (lifecycle "history"),
 * mostra la presenza condivisa (ONLINE / SEGNALE DEBOLE / OFFLINE), come
 * l'header Admin e il Cliente — mai TERMINATO.
 */
export function resolveOperatorStatusLabel({ session, presence } = {}) {
  const status = session?.status;
  if (status === 'completed' || status === 'cancelled') return SESSION_TERMINAL_LABEL;
  if (status === 'paused') return SESSION_PAUSED_LABEL;
  return presence?.label || DRIVER_PRESENCE_LABELS.offline;
}

const TRACKABLE_SESSION_STATUSES = new Set(['started', 'paused', 'completed']);

/**
 * Sessione "attiva" della campagna: la trackabile avviata piu' di recente.
 * Stessa scelta per Admin (GpsMonitor) e Cliente (CampaignTracking), cosi'
 * presenza e geofence si riferiscono alla stessa delivery_session.
 */
export function getLatestTrackableSession(sessions) {
  return (Array.isArray(sessions) ? sessions : [])
    .filter((session) => TRACKABLE_SESSION_STATUSES.has(session?.status))
    .slice()
    .sort((a, b) => {
      const aTime = new Date(a.started_at || a.created_at || 0).getTime();
      const bTime = new Date(b.started_at || b.created_at || 0).getTime();
      return bTime - aTime;
    })[0] || null;
}
