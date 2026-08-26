// GPS session lifecycle classification (Centro Controllo — Fase B/C).
// Pure function: nessuna chiamata di rete, nessuna scrittura DB, nessun
// side effect. Non chiude/modifica nulla — serve solo a CLASSIFICARE una
// riga delivery_sessions gia' letta altrove in LIVE / STALE / ABANDONED /
// PAUSED / CLOSED, per la UI del Centro Controllo e per un futuro,
// separato, meccanismo di cleanup (non implementato in questa fase).
//
// Riusa lo stesso concetto di "attivita' recente" gia' collaudato in
// src/lib/services/gps-api.js (classifyDriverStatus: online<=2min,
// warning<=5min, offline>5min — quello e' per la UI live, colora subito),
// ma con soglie piu' permissive: qui decidiamo se una sessione va
// considerata abbandonata, non se il pallino deve essere verde o giallo in
// questo istante. Una sessione non va marcata "morta" solo perche' il
// driver ha perso campo per 6 minuti in un tunnel.
//
// GERARCHIA DELL'EVIDENZA (verifica Fase "GPS Zombie — Verifica finale"):
// delivery_sessions.updated_at viene toccato da PIU' scritture, non solo
// dall'heartbeat del driver — anche da gps_transition_session,
// gps_transition_zone, e potenzialmente da un'operazione admin. Prova reale
// nei dati: 6 delle 11 sessioni zombie condividono lo stesso identico
// updated_at al microsecondo, incompatibile con heartbeat driver organico —
// quasi certamente un tocco amministrativo/di reconciliazione. updated_at
// da solo NON e' quindi prova affidabile di attivita' driver.
//
// Nessuna colonna "ultimo heartbeat" dedicata esiste oggi (non aggiunta qui
// senza necessita' dimostrata) — quindi la gerarchia usata e':
//   1. ultimo gps_tracking_points.recorded_at — evidenza piu' forte, e'
//      generato solo dal dispositivo del driver mentre traccia davvero.
//   2. started_at — grace period iniziale, per non marcare zombie una
//      sessione appena avviata che non ha ancora inviato il primo punto.
// generic updated_at NON entra nel calcolo di "ultima attivita'": un
// admin che tocca metadata/updated_at su una sessione vecchia non deve
// mai farla risultare LIVE.
//
// SOGLIE (vedi audit Fase A: heartbeat ogni 20s mentre status='started' e
// foreground; nessun heartbeat/GPS atteso mentre 'paused' per design):
//
// LIVE      — ultima attivita' reale entro 10 minuti. Margine ampio (30x
//              il periodo di heartbeat) per assorbire throttling del
//              browser in background, tunnel, ascensori, brevi cali di rete
//              — senza classificare come problema un normale jitter.
// STALE     — ultima attivita' tra 10 minuti e 4 ore fa. Copre una pausa
//              pranzo lunga, un telefono scarico poi ricaricato nello
//              stesso turno, una zona con pessima copertura per un tratto
//              di consegna: situazioni plausibili durante un turno reale,
//              da segnalare ma NON da considerare abbandono.
// ABANDONED — ultima attivita' oltre 4 ore fa. Nessun turno di consegna
//              realistico dura silenzioso cosi' a lungo restando
//              genuinamente attivo: e' il segnale che la sessione e' stata
//              lasciata aperta (app chiusa, telefono spento, driver mai
//              tornato) senza mai chiamare stop.
export const GPS_SESSION_LIVE_THRESHOLD_MS = 10 * 60 * 1000;
export const GPS_SESSION_STALE_THRESHOLD_MS = 4 * 60 * 60 * 1000;

export const GPS_SESSION_STATE = Object.freeze({
  LIVE: "live",
  STALE: "stale",
  ABANDONED: "abandoned",
  PAUSED: "paused",
  CLOSED: "closed",
});

function toTime(value) {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : null;
}

// session: riga grezza di delivery_sessions (status, started_at, paused_at,
// updated_at, ended_at). lastGpsRecordedAt: il piu' recente
// gps_tracking_points.recorded_at per quella sessione, se disponibile
// (nessuna query qui — va passato dal chiamante, gia' letto altrove).
export function classifyDeliverySession(session, { now = new Date(), lastGpsRecordedAt = null } = {}) {
  const status = session?.status;

  if (status === "completed" || status === "cancelled") {
    return { state: GPS_SESSION_STATE.CLOSED, reason: `Sessione ${status === "completed" ? "completata" : "annullata"}`, ageMs: null };
  }

  if (status === "paused") {
    // Nessun heartbeat/GPS atteso in pausa (per design, vedi gps-api.js):
    // l'assenza di attivita' qui non e' un segnale di abbandono, si
    // giudica solo l'eta' della pausa stessa. paused_at e' scritto SOLO da
    // gps_transition_session('pause') — a differenza di updated_at non e'
    // condiviso con altre scritture, ma per coerenza con la gerarchia
    // sopra il fallback (se mai nullo) e' started_at, non updated_at.
    const pausedAt = toTime(session.paused_at) ?? toTime(session.started_at);
    const ageMs = pausedAt != null ? now.getTime() - pausedAt : null;
    return { state: GPS_SESSION_STATE.PAUSED, reason: "Sessione in pausa", ageMs };
  }

  if (status !== "started") {
    return { state: GPS_SESSION_STATE.CLOSED, reason: `Stato non gestito: ${status ?? "sconosciuto"}`, ageMs: null };
  }

  // Ultima attivita' reale = la piu' recente tra ultimo punto GPS e avvio
  // stesso — MAI updated_at (vedi nota sulla gerarchia dell'evidenza sopra).
  // Cosi' una sessione appena avviata (nessun GPS ancora arrivato) usa
  // started_at come riferimento (grace period, non chiudere troppo presto),
  // ma una sessione vecchia con GPS vecchio non puo' mai "ringiovanire"
  // solo perche' qualcuno ha toccato updated_at.
  const candidates = [toTime(lastGpsRecordedAt), toTime(session.started_at)].filter((t) => t != null);
  if (candidates.length === 0) {
    return { state: GPS_SESSION_STATE.ABANDONED, reason: "Nessun dato di avvio o attivita' disponibile", ageMs: null };
  }
  const lastActivityAt = Math.max(...candidates);
  const ageMs = now.getTime() - lastActivityAt;

  if (ageMs <= GPS_SESSION_LIVE_THRESHOLD_MS) {
    return { state: GPS_SESSION_STATE.LIVE, reason: "GPS recente (o sessione appena avviata)", ageMs };
  }
  if (ageMs <= GPS_SESSION_STALE_THRESHOLD_MS) {
    return { state: GPS_SESSION_STATE.STALE, reason: `Nessuna attivita' da ${Math.round(ageMs / 60000)} minuti`, ageMs };
  }
  return { state: GPS_SESSION_STATE.ABANDONED, reason: `Nessuna attivita' da ${(ageMs / 3600000).toFixed(1)} ore`, ageMs };
}

// Aggregazione pura su un elenco di sessioni gia' letto altrove
// (delivery_sessions rows) + una mappa sessionId -> ultimo recorded_at gia'
// calcolata dal chiamante (nessuna query qui dentro).
export function summarizeDeliverySessions(sessions = [], lastGpsBySessionId = {}, options = {}) {
  const classified = (Array.isArray(sessions) ? sessions : []).map((session) => ({
    session,
    classification: classifyDeliverySession(session, { ...options, lastGpsRecordedAt: lastGpsBySessionId[session.id] || null }),
  }));
  const counts = { live: 0, stale: 0, abandoned: 0, paused: 0, closed: 0 };
  for (const { classification } of classified) counts[classification.state] = (counts[classification.state] || 0) + 1;
  return { classified, counts };
}
