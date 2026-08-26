// FASE Centro Controllo — soglie alert (Blocco D). Nessuna chiamata di
// rete/DB qui: solo la configurazione dichiarativa usata da incidentEngine.js
// per decidere apri/aggiorna/risolvi.
//
// Separazione deliberata da FLOW STATUS/AUTH EVIDENCE (vedi audit Fase A):
// "gps_live" (nessuna sessione attiva), "quote_creation"/"submit_campaign"
// (nessun tentativo recente), "auth_client_real_login"/"auth_admin_real_login"
// (nessuna evidenza di login recente) NON compaiono qui e non vengono MAI
// passati a evaluateIncidentTransition — non sono infrastruttura che puo'
// "essere giu'", sono l'assenza di un evento di business. Un check_name
// assente da questa tabella non genera mai un incidente (vedi DEFAULT_RULE
// sotto: alertable=false di default, esplicito solo dove serve davvero).

export const DEFAULT_ALERT_RULE = Object.freeze({
  alertable: false,
  severity: "warning",
  consecutiveFailuresBeforeOpen: 2,
  consecutiveSuccessesBeforeResolve: 2,
  latencyThresholdMs: null,
});

// CRITICAL — infrastruttura di base: irraggiungibile per 2 check consecutivi
// (soglia richiesta esplicitamente), mai per un singolo jitter.
const CRITICAL_INFRA_RULE = Object.freeze({
  alertable: true,
  severity: "critical",
  consecutiveFailuresBeforeOpen: 2,
  consecutiveSuccessesBeforeResolve: 2,
  latencyThresholdMs: 1500, // stessa soglia "lenta" gia' usata in PlatformStatus.jsx (SLOW_THRESHOLD_MS)
});

// WARNING — provider esterni RICHIESTI: uno stato statico (configurato
// si'/no), non un blip di rete. Una singola lettura basta per
// aprire/risolvere: non ha senso "debounciare" un booleano di
// configurazione che non e' volatile.
const REQUIRED_PROVIDER_RULE = Object.freeze({
  alertable: true,
  severity: "warning",
  consecutiveFailuresBeforeOpen: 1,
  consecutiveSuccessesBeforeResolve: 1,
  latencyThresholdMs: null,
});

// Provider OPZIONALI: "non configurato" e' uno stato informativo (mostrato
// comunque come NOT_CONFIGURED nella UI), MAI un incidente. alertable=false
// per costruzione — nessuna soglia ha importanza se non si apre mai.
const OPTIONAL_PROVIDER_RULE = Object.freeze({
  alertable: false,
  severity: "warning",
  consecutiveFailuresBeforeOpen: 1,
  consecutiveSuccessesBeforeResolve: 1,
  latencyThresholdMs: null,
});

// required/optional per provider — VERIFICATO nel codice reale (audit
// dedicato di questa fase), non dichiarato a intuito:
//   mapbox       -> OPTIONAL: Step2Map.jsx ha un fallback reale a tile
//                   CARTO/OSM quando VITE_MAPBOX_TOKEN manca o viene
//                   rifiutato (buildCartoLayer(), swap automatico su
//                   tileerror); Step2.jsx ricade su Nominatim/OSM per la
//                   geocodifica.
//   googlePlaces -> OPTIONAL: analysis-poi-search/index.ts,
//                   googlePlacesProvider ritorna null se la chiave manca —
//                   uno dei 5 provider POI in parallelo, Overpass/OSM copre
//                   comunque l'arricchimento territoriale.
//   foursquare   -> OPTIONAL: stesso file, foursquareProvider, stesso
//                   pattern "ritorna null se manca la chiave", stessa
//                   catena di fallback (Overpass/OSM/cache DB/GTFS).
//   resend       -> OPTIONAL: send-email-conferma/index.ts risponde 200
//                   "Resend not configured" (mai un errore) quando la
//                   chiave manca — l'email di conferma e' un side-effect,
//                   non un gate sulla creazione di preventivo/campagna.
//   openai       -> OPTIONAL: ai-core/index.ts ritorna null + un warning
//                   interno per ogni chiamata AI se la chiave manca — tutti
//                   i chiamanti sono adapter AI-assistant/admin-copilot,
//                   mai il percorso Step1-4/preventivo/pricing.
// Nessun provider e' oggi classificato REQUIRED: nessuno dei 5 e' sul
// percorso di conversione core (Step1-4 -> preventivo), tutti hanno un
// fallback verificato nel codice. Se in futuro un provider diventasse
// realmente bloccante (es. un fallback viene rimosso), va spostato in
// REQUIRED_PROVIDER_RULE con la stessa evidenza da codice, mai per
// supposizione.
export const PROVIDER_REQUIREMENT = Object.freeze({
  mapbox: "optional",
  googlePlaces: "optional",
  foursquare: "optional",
  resend: "optional",
  openai: "optional",
});

function providerRuleFor(providerName) {
  return PROVIDER_REQUIREMENT[providerName] === "required" ? REQUIRED_PROVIDER_RULE : OPTIONAL_PROVIDER_RULE;
}

export const ALERT_RULES = Object.freeze({
  supabase: CRITICAL_INFRA_RULE,
  auth_infrastructure: CRITICAL_INFRA_RULE,
  database: CRITICAL_INFRA_RULE,
  edge_functions: CRITICAL_INFRA_RULE,

  // La sonda live jwt_is_admin() (fail-closed) e' security-critical: un
  // fail-open reale, anche isolato, e' grave — ma restiamo comunque a 2
  // check consecutivi per non aprire un incident CRITICAL su un singolo
  // timeout di rete transitorio (stessa cautela di CRITICAL_INFRA_RULE).
  auth_admin_role_probe: CRITICAL_INFRA_RULE,

  // gps_backend/analytics: raggiungibilita' di tabella (infrastruttura
  // reale), MAI da confondere con "nessuna sessione GPS attiva"/"nessun
  // traffico oggi" (quelli sono flow, non in questa tabella per costruzione
  // — vedi commento di testa del file).
  gps_backend: { ...CRITICAL_INFRA_RULE, severity: "warning" },
  analytics: { ...CRITICAL_INFRA_RULE, severity: "warning" },

  provider_mapbox: providerRuleFor("mapbox"),
  provider_googlePlaces: providerRuleFor("googlePlaces"),
  provider_foursquare: providerRuleFor("foursquare"),
  provider_resend: providerRuleFor("resend"),
  provider_openai: providerRuleFor("openai"),
});

export function resolveAlertRule(checkName) {
  return ALERT_RULES[checkName] || DEFAULT_ALERT_RULE;
}
