// FASE Centro Controllo — orchestratore storico/incidenti lato browser
// Admin (Blocco E, percorso "manual"). Traduce risultati GIA' calcolati da
// runPlatformHealthCheck()/computeAuthHealth() (nessuna nuova chiamata di
// rete qui) in righe platform_health_checks, poi decide le transizioni di
// incidenti con incidentEngine.js. Tutte le operazioni DB sono INIETTATE
// (stesso pattern di runPlatformHealthCheck({getSiteTrafficFn})): questo
// modulo resta testabile senza una connessione Supabase reale.
//
// source e' sempre 'manual' qui: e' un Admin che ha aperto la pagina e
// premuto "Esegui controllo completo". Il collector periodico
// (source='collector') vive nell'edge function separata
// supabase/functions/platform-health-collector (scritta, NON deployata in
// questa fase).
//
// COSA VIENE SCARTATO DELIBERATAMENTE (mai persistito in
// platform_health_checks):
// - row.key==='auth' di platformHealth.js: stesso identico endpoint gia'
//   coperto da authHealth.infrastructure con un nome piu' preciso
//   (auth_infrastructure) — evita due righe duplicate per lo stesso
//   segnale nello stesso istante.
// - row.key==='api' di platformHealth.js: stessa probe di 'analytics'
//   (getSiteTrafficFn), ridondante.
// - auth CONTRACT (client/admin route-invarianti): invariante di codice,
//   non un segnale operativo "che va giu'" — non ha senso storicizzarlo
//   ogni 5 minuti, cambia solo quando cambia il codice (coperto dai test).
// - auth REAL LOGIN evidence (OK_RECENT/NO_RECENT_EVIDENCE/ERROR_RECENT):
//   assenza di un login non e' un'infrastruttura rotta (vedi requisito
//   esplicito "no recent login non apre critical incident").
// - qualunque FLOW (gps_live, quote_creation, submit_campaign, ...):
//   assenza di traffico/sessioni non e' un incidente di infrastruttura.

import { resolveAlertRule } from "./alertRules.js";
import { evaluateIncidentTransition } from "./incidentEngine.js";

const MAX_MESSAGE_LENGTH = 500;
// Stessa difesa in profondita' di src/lib/monitoring/errorLog.js: un
// messaggio di errore concatenato non deve MAI portare con se' un
// token/JWT/apikey, anche per errore.
const SECRET_LIKE_PATTERN = /(eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,})|(sb_(secret|publishable)_[a-zA-Z0-9_-]+)|(apikey=[^&\s]+)|(authorization:\s*bearer\s+\S+)/gi;

export function sanitizeCheckMessage(raw) {
  if (!raw) return null;
  const text = String(raw).replace(SECRET_LIKE_PATTERN, "[redacted]");
  return text.length > MAX_MESSAGE_LENGTH ? `${text.slice(0, MAX_MESSAGE_LENGTH - 1)}…` : text;
}

// Codice Postgres standard per violazione di un unique index (23505) — lo
// stesso gia' usato altrove in questo progetto per SESSIONE_GIA_ATTIVA
// (vedi gps-api.js). Usato SOLO per riconoscere la race sull'apertura di
// un incidente, MAI per silenziare altri errori di scrittura.
function isUniqueViolationError(error) {
  return String(error?.code || "") === "23505";
}

function mapHealthStatus(status) {
  if (status === "ok") return "ok";
  if (status === "warning") return "warning";
  if (status === "error") return "fail";
  return "unknown";
}

const HEALTH_ROW_GROUP = Object.freeze({
  frontend: "frontend",
  supabase: "supabase",
  database: "database",
  edge_functions: "edge_function",
  gps_backend: "gps",
  analytics: "analytics",
});

export function normalizeCheckResults({ health = null, authHealth = null, configStatus = null } = {}) {
  const results = [];

  for (const row of health?.rows || []) {
    const checkGroup = HEALTH_ROW_GROUP[row.key];
    if (!checkGroup) continue; // 'auth'/'api' esclusi deliberatamente, vedi commento di testa
    results.push({
      checkName: row.key,
      checkGroup,
      status: mapHealthStatus(row.status),
      responseTimeMs: Number.isFinite(row.responseTimeMs) ? row.responseTimeMs : null,
      errorCode: null,
      errorMessage: sanitizeCheckMessage(row.error),
    });
  }

  if (authHealth?.infrastructure) {
    results.push({
      checkName: "auth_infrastructure",
      checkGroup: "auth",
      status: authHealth.infrastructure.status === "OK" ? "ok" : "fail",
      responseTimeMs: Number.isFinite(authHealth.infrastructure.responseTimeMs) ? authHealth.infrastructure.responseTimeMs : null,
      errorCode: null,
      errorMessage: sanitizeCheckMessage(authHealth.infrastructure.error),
    });
  }
  if (authHealth?.adminContract?.liveProbe) {
    const probe = authHealth.adminContract.liveProbe;
    results.push({
      checkName: "auth_admin_role_probe",
      checkGroup: "auth",
      status: probe.status === "ok" ? "ok" : "fail",
      responseTimeMs: Number.isFinite(probe.responseTimeMs) ? probe.responseTimeMs : null,
      errorCode: null,
      errorMessage: sanitizeCheckMessage(probe.error),
    });
  }

  if (configStatus?.available && configStatus.providers && typeof configStatus.providers === "object") {
    for (const [name, configured] of Object.entries(configStatus.providers)) {
      results.push({
        checkName: `provider_${name}`,
        checkGroup: "provider",
        status: configured ? "ok" : "warning",
        responseTimeMs: null,
        errorCode: null,
        errorMessage: configured ? null : "Provider non configurato.",
      });
    }
  }

  return results;
}

// Tutte le funzioni di IO sono iniettate (mai importate qui direttamente):
// insertHealthChecks(rows), getRecentChecks(checkName, limit) [desc by
// checked_at, DEVE includere la riga appena inserita], getOpenIncident(checkName),
// insertIncident(incident), updateIncident(id, patch).
export async function recordHealthAndIncidents({
  health = null,
  authHealth = null,
  configStatus = null,
  now = new Date(),
  source = "manual",
  insertHealthChecks,
  getRecentChecks,
  getOpenIncident,
  insertIncident,
  updateIncident,
} = {}) {
  const results = normalizeCheckResults({ health, authHealth, configStatus });
  if (results.length === 0) return { inserted: 0, incidentActions: [] };

  const rowsToInsert = results.map((r) => ({
    check_name: r.checkName,
    check_group: r.checkGroup,
    status: r.status,
    response_time_ms: r.responseTimeMs,
    error_code: r.errorCode,
    error_message: r.errorMessage,
    checked_at: now.toISOString(),
    source,
  }));
  await insertHealthChecks(rowsToInsert);

  const incidentActions = [];
  for (const r of results) {
    const rule = resolveAlertRule(r.checkName);
    if (!rule.alertable) {
      incidentActions.push({ checkName: r.checkName, action: "none", reason: "check non alertable per policy" });
      continue;
    }
    const historyLimit = Math.max(rule.consecutiveFailuresBeforeOpen, rule.consecutiveSuccessesBeforeResolve, 1) + 1;
    const [recent, existingIncident] = await Promise.all([
      getRecentChecks(r.checkName, historyLimit),
      getOpenIncident(r.checkName),
    ]);
    const decision = evaluateIncidentTransition({ checkName: r.checkName, rule, recentResults: recent, existingIncident, now });
    if (decision.action === "open") {
      const insertResult = await insertIncident(decision.incident);
      if (insertResult?.error && isUniqueViolationError(insertResult.error)) {
        // Race: l'unique index parziale platform_incidents_one_open_per_check_uidx
        // ha rifiutato questo insert perche' un'altra esecuzione concorrente
        // (es. due collector che partono nello stesso istante) ha gia'
        // aperto l'incidente per questo check_name nel frattempo. Non e' un
        // fallimento da ignorare: recuperiamo quell'incidente e lo
        // aggiorniamo, esattamente come se l'avessimo trovato gia' aperto
        // — mai un secondo incidente duplicato per lo stesso check.
        const raceIncident = await getOpenIncident(r.checkName);
        if (raceIncident) {
          await updateIncident(raceIncident.id, {
            last_seen_at: now.toISOString(),
            occurrence_count: (raceIncident.occurrence_count || 0) + 1,
            last_error_code: decision.incident.last_error_code,
            consecutive_successes: 0,
          });
          incidentActions.push({ checkName: r.checkName, action: "update", reason: "race su apertura incidente, aggiornato invece di duplicato" });
          continue;
        }
      }
    } else if ((decision.action === "update" || decision.action === "resolve") && existingIncident) {
      await updateIncident(existingIncident.id, decision.patch);
    }
    incidentActions.push({ checkName: r.checkName, ...decision });
  }

  return { inserted: rowsToInsert.length, incidentActions };
}
