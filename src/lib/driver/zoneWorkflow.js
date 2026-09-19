// Macchina a stati zone lato Driver: DA_INIZIARE -> IN_CORSO -> COMPLETATA.
// Invariante: al massimo UNA zona IN_CORSO per incarico; le zone successive
// restano DA_INIZIARE finche' il driver non conferma esplicitamente la
// prossima. Stessa regola imposta server-side da gps_zone_start_guard()
// (migrazione 20260919150000) — qui solo presentazione dei controlli.
//
// `zones` deve essere gia' nell'ordine di programma canonico (priority,
// poi nome): questo modulo NON riordina mai.

export const ZONE_STATE = Object.freeze({
  TO_START: 'DA_INIZIARE',
  IN_PROGRESS: 'IN_CORSO',
  COMPLETED: 'COMPLETATA',
});

export function zoneStateOf(zone, sessionZoneId = null, sessionLive = false) {
  if (!zone) return ZONE_STATE.TO_START;
  if (zone.status === 'Completata') return ZONE_STATE.COMPLETED;
  if (zone.status === 'In corso') return ZONE_STATE.IN_PROGRESS;
  if (sessionLive && zone.id != null && zone.id === sessionZoneId) return ZONE_STATE.IN_PROGRESS;
  return ZONE_STATE.TO_START;
}

export function computeZoneWorkflow(zones = [], sessionZoneId = null, sessionLive = false) {
  const list = (zones || []).filter((z) => z && !z.isLegacy);
  const states = new Map(list.map((z) => [z.id, zoneStateOf(z, sessionZoneId, sessionLive)]));
  const inProgressAll = list.filter((z) => states.get(z.id) === ZONE_STATE.IN_PROGRESS);
  // Con dati storici sporchi (piu' zone "In corso") si privilegia la zona della
  // sessione viva, altrimenti la prima in ordine di programma.
  const inProgressZone = inProgressAll.find((z) => sessionLive && z.id === sessionZoneId) || inProgressAll[0] || null;
  const nextZone = list.find((z) => states.get(z.id) !== ZONE_STATE.COMPLETED) || null;
  const allCompleted = list.length > 0 && !nextZone;

  return {
    inProgressZone,
    nextZone,
    allCompleted,
    stateOf: (z) => (z && !z.isLegacy ? (states.get(z.id) ?? ZONE_STATE.TO_START) : ZONE_STATE.TO_START),
    // Solo la zona in corso (ripresa) oppure, se nessuna e' in corso, la
    // prossima in ordine puo' essere avviata — e mai con una sessione viva.
    canStart(z) {
      if (!z || z.isLegacy || sessionLive) return false;
      if (inProgressZone) return z.id === inProgressZone.id;
      return Boolean(nextZone) && z.id === nextZone.id;
    },
    canReopen(z) {
      return Boolean(z) && !z.isLegacy && !sessionLive && allCompleted && states.get(z.id) === ZONE_STATE.COMPLETED;
    },
    // Stato di ATTESA normale (non e' un errore): testo neutro per le zone
    // future. La zona subito dopo quella in corso/prossima nomina la
    // precedente; le successive usano la forma generica.
    waitingLabel(z) {
      if (!z || z.isLegacy || states.get(z.id) !== ZONE_STATE.TO_START) return null;
      if (this.canStart(z)) return null;
      const frontier = inProgressZone || nextZone;
      const frontierIdx = frontier ? list.findIndex((x) => x.id === frontier.id) : -1;
      const idx = list.findIndex((x) => x.id === z.id);
      if (frontier && frontier.id !== z.id && idx === frontierIdx + 1) return `Disponibile dopo ${frontier.zone_name}`;
      return 'Disponibile dopo la zona precedente';
    },
    // Messaggio mostrato quando si tenta di avviare una zona che non e'
    // ancora la sua volta (stesso testo del server).
    blockedReason(z) {
      if (!z || z.isLegacy || sessionLive) return null;
      if (inProgressZone && z.id !== inProgressZone.id && states.get(z.id) === ZONE_STATE.TO_START) {
        return `Completa o termina ${inProgressZone.zone_name} prima di iniziare ${z.zone_name}.`;
      }
      return null;
    },
  };
}
