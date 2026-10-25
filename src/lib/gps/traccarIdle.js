// Sessioni Piano B (Traccar Client): quando l'operatore e' fermo l'app entra in
// pausa (StationaryEnter) e smette di inviare punti finche' non si muove. Senza
// punti recenti il Monitor la vedrebbe "offline", ma non e' un guasto: finche'
// la sessione e' aperta e il Piano B e' ancora attivo la mostriamo come
// "Fermo o senza segnale". L'app non ci dice se e' ferma o senza rete
// (TODO.md: salvare is_moving), quindi l'etichetta resta onesta su entrambi.
export const TRACCAR_IDLE_LIFECYCLE = 'traccar_idle';
export const TRACCAR_IDLE_LABEL = 'Fermo o senza segnale';
export const TRACCAR_IDLE_EXPLANATION =
  'Con Traccar è normale: quando l’operatore è fermo l’app smette di inviare punti e riprende appena si muove.';

// Id delle sessioni Piano B ancora aperte e autorizzate a ricevere punti, dalla
// lista di traccar_admin_control('list').
export function openTraccarSessionIds(sessions, nowMs = Date.now()) {
  const ids = new Set();
  for (const row of Array.isArray(sessions) ? sessions : []) {
    const until = row?.enabled_until ? new Date(row.enabled_until).getTime() : NaN;
    if (row?.id && ['started', 'paused'].includes(row.status) && row.enabled && Number.isFinite(until) && until > nowMs) {
      ids.add(row.id);
    }
  }
  return ids;
}

// Solo "segnale debole" e "offline recente" diventano "fermo o senza segnale":
// live e storico restano come sono.
export function traccarAwareLifecycle(lifecycle, sessionId, traccarIds) {
  if (!traccarIds?.has(sessionId)) return lifecycle;
  return lifecycle === 'warning' || lifecycle === 'offline_recent' ? TRACCAR_IDLE_LIFECYCLE : lifecycle;
}
