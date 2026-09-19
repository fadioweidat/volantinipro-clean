// Stato operativo zone lato Driver.
// Le zone possono essere avviate/completate manualmente e PIU' zone possono
// risultare IN_CORSO contemporaneamente (es. piu' ragazzi sullo stesso incarico).
// Il GPS del singolo dispositivo resta separato dallo stato operativo delle zone.

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
  const inProgressZone = inProgressAll.find((z) => sessionLive && z.id === sessionZoneId) || inProgressAll[0] || null;
  const nextZone = list.find((z) => states.get(z.id) === ZONE_STATE.TO_START) || null;
  const allCompleted = list.length > 0 && list.every((z) => states.get(z.id) === ZONE_STATE.COMPLETED);

  return {
    inProgressZone,
    inProgressZones: inProgressAll,
    nextZone,
    allCompleted,
    stateOf: (z) => (z && !z.isLegacy ? (states.get(z.id) ?? ZONE_STATE.TO_START) : ZONE_STATE.TO_START),

    // Tutte le zone DA INIZIARE sono avviabili manualmente. Non dipendono
    // dallo stato delle altre zone: il team puo' lavorare su 2/3/4 zone insieme.
    canStart(z) {
      return Boolean(z) && !z.isLegacy && states.get(z.id) === ZONE_STATE.TO_START;
    },

    // Una zona completata resta chiusa: eventuale riapertura deve essere una
    // scelta separata/esplicita, non automatica.
    canReopen() {
      return false;
    },

    waitingLabel() {
      return null;
    },

    blockedReason() {
      return null;
    },
  };
}
