// FASE Centro Controllo — motore incidenti (Blocco C). Funzione pura: nessuna
// chiamata di rete/DB. Decide SOLO cosa fare (open/update/resolve/none) dato
// lo stato attuale — la scrittura reale su platform_incidents avviene altrove
// (chiamante), cosi' questa logica resta testabile senza DB.
//
// REGOLE (richieste esplicitamente):
// - non aprire incident per un singolo jitter breve se il check e' volatile
//   -> soglia consecutiveFailuresBeforeOpen (da alertRules.js), mai 1 per i
//      check di infrastruttura.
// - aprire incident solo dopo soglia deterministica -> vedi sopra.
// - aggiornare incidente gia' aperto invece di crearne duplicati -> se
//   existingIncident e' presente, l'azione e' sempre 'update'/'resolve',
//   mai 'open' (che duplicherebbe object) — rinforzato anche a livello DB
//   dall'unique index parziale platform_incidents_one_open_per_check_uidx.
// - risolvere automaticamente quando il check torna sano per N verifiche
//   consecutive -> soglia consecutiveSuccessesBeforeResolve.
//
// MAI: severity "promossa" a caldo (un incidente aperto warning resta
// warning finche' non si risolve — vedi test 11 "warning non diventa
// critical": la severity e' decisa SOLO all'apertura, dalla regola).

export const INCIDENT_ACTION = Object.freeze({
  NONE: "none",
  OPEN: "open",
  UPDATE: "update",
  RESOLVE: "resolve",
});

function countLeadingMatching(recentResults, predicate) {
  let count = 0;
  for (const r of recentResults) {
    if (predicate(r?.status)) count += 1;
    else break;
  }
  return count;
}

const isFailureStatus = (status) => status === "fail" || status === "warning";
const isOkStatus = (status) => status === "ok";

// checkName: string. rule: vedi alertRules.js (resolveAlertRule). recentResults:
// array di {status, errorCode, errorMessage, checkedAt}, ORDINATO dal PIU'
// RECENTE al piu' vecchio, il primo elemento e' il risultato appena
// registrato (deve includerlo, lunghezza >= 1). existingIncident: la riga
// platform_incidents attualmente 'open' per questo check_name, o null.
export function evaluateIncidentTransition({ checkName, rule, recentResults, existingIncident = null, now = new Date() } = {}) {
  if (!Array.isArray(recentResults) || recentResults.length === 0) {
    return { action: INCIDENT_ACTION.NONE, reason: "nessun risultato da valutare" };
  }
  const latest = recentResults[0];

  // Check non alertable per policy (vedi alertRules.js): mai un incidente,
  // indipendentemente da quanti fallimenti consecutivi. Un incidente gia'
  // aperto in precedenza (regola cambiata nel frattempo) non viene toccato
  // qui — nessuna azione automatica su una configurazione mutata a runtime.
  if (!rule?.alertable) {
    return { action: INCIDENT_ACTION.NONE, reason: "check non alertable per policy" };
  }

  const consecutiveFailures = countLeadingMatching(recentResults, isFailureStatus);
  const consecutiveSuccesses = countLeadingMatching(recentResults, isOkStatus);
  const nowIso = now.toISOString();

  if (existingIncident) {
    if (isOkStatus(latest.status)) {
      if (consecutiveSuccesses >= rule.consecutiveSuccessesBeforeResolve) {
        return {
          action: INCIDENT_ACTION.RESOLVE,
          patch: {
            status: "resolved",
            resolved_at: nowIso,
            last_seen_at: nowIso,
            consecutive_successes: consecutiveSuccesses,
          },
        };
      }
      return {
        action: INCIDENT_ACTION.UPDATE,
        patch: {
          last_seen_at: nowIso,
          consecutive_successes: consecutiveSuccesses,
        },
      };
    }
    // Ancora in fail/warning: aggiorna l'incidente esistente, MAI un nuovo
    // record (l'unique index parziale a DB lo impedirebbe comunque).
    return {
      action: INCIDENT_ACTION.UPDATE,
      patch: {
        last_seen_at: nowIso,
        occurrence_count: (existingIncident.occurrence_count || 0) + 1,
        last_error_code: latest.errorCode || null,
        consecutive_successes: 0,
      },
    };
  }

  // Nessun incidente aperto per questo check.
  if (!isFailureStatus(latest.status)) {
    return { action: INCIDENT_ACTION.NONE, reason: "ultimo check sano, nessun incidente da aprire" };
  }
  if (consecutiveFailures < rule.consecutiveFailuresBeforeOpen) {
    return {
      action: INCIDENT_ACTION.NONE,
      reason: `soglia non raggiunta (${consecutiveFailures}/${rule.consecutiveFailuresBeforeOpen} fallimenti consecutivi)`,
    };
  }

  return {
    action: INCIDENT_ACTION.OPEN,
    incident: {
      check_name: checkName,
      severity: rule.severity,
      status: "open",
      started_at: nowIso,
      last_seen_at: nowIso,
      occurrence_count: consecutiveFailures,
      consecutive_successes: 0,
      first_error_code: latest.errorCode || null,
      last_error_code: latest.errorCode || null,
      summary: latest.errorMessage || `${checkName}: stato ${latest.status} per ${consecutiveFailures} controlli consecutivi`,
    },
  };
}
