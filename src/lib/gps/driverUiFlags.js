// Flag UI Driver — SOSPENSIONE (non rimozione) di funzionalita'.
//
// DRIVER_PAUSE_ENABLED = false: i pulsanti "Metti in pausa" / "Riprendi
// lavoro" sono nascosti dalla UI Driver per semplificare il flusso operativo
// a due sole azioni: "Inizia" -> "Termina lavoro".
//
// Tutta la logica sottostante resta INTATTA e riattivabile rimettendo
// questo flag a true, senza altre modifiche:
//   - useGpsTracking.pause() / resume() (con i rispettivi timeout)
//   - gps-api pauseGpsSession() / resumeGpsSession()
//   - RPC gps_transition_session_v3 ('pause' / 'resume')
//   - i test backend/contract esistenti
//
// "Termina lavoro" NON dipende da questo flag: resta sempre disponibile per
// una sessione active o paused (anche sessioni gia' in pausa da prima della
// sospensione — vedi il fallback session-level in DriverAssignmentPage).
export const DRIVER_PAUSE_ENABLED = false;
