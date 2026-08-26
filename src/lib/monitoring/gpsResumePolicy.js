// Politica di resume driver (FASE GPS — Prevenzione nuove sessioni zombie).
// Pure function: nessuna chiamata di rete, nessuna scrittura DB, nessun side
// effect. Decide SOLO cosa fare quando useGpsTracking trova, al mount, una
// delivery_sessions gia' started/paused per questo driver+campagna — usando
// la classificazione gia' prodotta da gpsSessionLifecycle.classifyDeliverySession.
//
// Regola esplicita (richiesta utente, Fase D):
// LIVE/PAUSED  -> RESUME normale, nessun messaggio bloccante.
// STALE        -> RESUME comunque (il driver puo' aver perso campo per ore in
//                  un turno reale), ma espone un warning: il driver sa che la
//                  sessione sembra ferma da un po'.
// ABANDONED    -> BLOCK: NON riagganciare silenziosamente il tracking a una
//                  sessione vecchia di ore. Il Driver non deve MAI chiamare la
//                  RPC admin-only gps_recover_abandoned_session (nessun
//                  privilegio admin lato Driver) — puo' solo essere informato
//                  e invitato a contattare l'amministratore.
import { GPS_SESSION_STATE } from './gpsSessionLifecycle.js';

export const RESUME_ACTION = Object.freeze({
  RESUME: 'resume',
  RESUME_WITH_WARNING: 'resume_with_warning',
  BLOCK: 'block',
});

const ABANDONED_MESSAGE =
  'È stata trovata una sessione precedente non più attiva. Serve chiuderla/recuperarla prima di iniziare una nuova sessione. Contatta l\'amministratore.';

function staleMessage(classification) {
  const minutes = classification.ageMs != null ? Math.round(classification.ageMs / 60000) : null;
  const suffix = minutes != null ? ` (nessuna attività da circa ${minutes} minuti)` : '';
  return `Sessione precedente ripresa, ma sembra ferma da un po'${suffix}. Verifica GPS e connessione.`;
}

// classification: il risultato di classifyDeliverySession({ state, reason, ageMs }).
export function resolveResumePolicy(classification) {
  const state = classification?.state;

  if (state === GPS_SESSION_STATE.LIVE || state === GPS_SESSION_STATE.PAUSED) {
    return { action: RESUME_ACTION.RESUME, message: null };
  }

  if (state === GPS_SESSION_STATE.STALE) {
    return { action: RESUME_ACTION.RESUME_WITH_WARNING, message: staleMessage(classification) };
  }

  if (state === GPS_SESSION_STATE.ABANDONED) {
    return { action: RESUME_ACTION.BLOCK, message: ABANDONED_MESSAGE };
  }

  // CLOSED o stato non gestito: nessuna sessione da riagganciare — non e'
  // competenza di questa policy (il chiamante non dovrebbe nemmeno arrivare
  // qui con una sessione closed, ma fail-safe: nessun resume automatico).
  return { action: RESUME_ACTION.BLOCK, message: 'Sessione precedente non valida per il resume.' };
}
