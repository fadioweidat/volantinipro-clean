// Mapper centrale degli errori Marketplace -> messaggi utente in italiano.
//
// Le RPC SECURITY DEFINER del Marketplace segnalano gli errori di dominio con
// `raise exception '<TOKEN>'` (es. OFFERTA_GIA_INVIATA). A seconda del client
// HTTP usato, l'errore arriva alla UI come:
//   - Error con `.message` = '<TOKEN>'
//   - Error con `.message` = corpo JSON PostgREST grezzo
//     ('{"code":"23505",...,"message":"OFFERTA_GIA_INVIATA"}')
//   - oggetto { code, message } di supabase-js
// Questo modulo estrae il TOKEN reale da tutte queste forme e restituisce SEMPRE
// un messaggio pulito: mai SQLSTATE, mai "23505"/"23503", mai JSON, mai stack.

const MESSAGES = Object.freeze({
  // — invio preventivo Fornitore —
  OFFERTA_GIA_INVIATA: 'Hai già inviato un preventivo per questa richiesta.',
  FORNITORE_NON_VERIFICATO: 'Il tuo profilo fornitore non è ancora verificato.',
  FORNITORE_NON_PIU_VERIFICATO: 'Il fornitore selezionato non è più verificato.',
  RICHIESTA_NON_TROVATA: 'Richiesta non trovata.',
  RICHIESTA_NON_DISPONIBILE: 'Questa richiesta non è più disponibile.',
  IMPORTO_NON_VALIDO: 'L’importo inserito non è valido.',
  // — accettazione preventivo Cliente —
  CAMPAGNA_GIA_ASSEGNATA: 'La campagna è già stata assegnata.',
  CAMPAGNA_NON_AUTORIZZATA: 'Non hai accesso a questa campagna.',
  CAMPAGNA_STATO_NON_COMPATIBILE: 'La campagna non è in uno stato compatibile.',
  OFFERTA_NON_TROVATA: 'Preventivo non trovato.',
  OFFERTA_NON_MARKETPLACE: 'Questo preventivo non è gestibile da qui.',
  OFFERTA_NON_ACCETTABILE: 'Questo preventivo non può essere accettato.',
  OFFERTA_SCADUTA: 'Questo preventivo è scaduto.',
  // — assegnazione operatore Fornitore —
  OPERATORE_NON_DEL_FORNITORE: 'L’operatore selezionato non appartiene alla tua organizzazione.',
  CAMPAGNA_NON_DEL_FORNITORE: 'Questa campagna non è assegnata alla tua organizzazione.',
  ASSEGNAZIONE_GIA_PRESENTE: 'Questo operatore è già assegnato alla campagna.',
  // — auth / generici di dominio —
  NON_AUTENTICATO: 'Sessione scaduta. Accedi di nuovo per continuare.',
  UTENTE_NON_AUTENTICATO: 'Sessione scaduta. Accedi di nuovo per continuare.',
  ADMIN_RICHIESTO: 'Operazione riservata agli amministratori.',
  ADMIN_NON_AUTORIZZATO: 'Operazione riservata agli amministratori.',
  STATUS_NON_VALIDO: 'Stato non valido.',
  FORNITORE_NON_TROVATO: 'Fornitore non trovato.',
});

export const MARKETPLACE_ERROR_GENERIC = 'Si è verificato un errore. Riprova.';

// Token dominio = MAIUSCOLO_CON_UNDERSCORE (>= 4 char). Non e' mai uno SQLSTATE.
const TOKEN_RE = /\b([A-Z][A-Z0-9]*(?:_[A-Z0-9]+){1,})\b/;

function extractToken(err) {
  if (!err) return null;
  const candidates = [];
  // 1) forma diretta: err.message / err (string)
  if (typeof err === 'string') candidates.push(err);
  if (typeof err?.message === 'string') candidates.push(err.message);
  if (typeof err?.error === 'string') candidates.push(err.error);
  if (typeof err?.details === 'string') candidates.push(err.details);
  // 2) corpo JSON grezzo dentro message (client REST leggero)
  for (const c of [...candidates]) {
    const trimmed = c.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const body = JSON.parse(trimmed);
        if (typeof body?.message === 'string') candidates.push(body.message);
        if (typeof body?.error === 'string') candidates.push(body.error);
        if (typeof body?.hint === 'string') candidates.push(body.hint);
      } catch { /* non JSON valido: ignora */ }
    }
  }
  for (const c of candidates) {
    if (MESSAGES[c]) return c; // match esatto
    const m = String(c).match(TOKEN_RE);
    if (m && MESSAGES[m[1]]) return m[1]; // token estratto da una frase
  }
  return null;
}

/**
 * @param {unknown} err  Error/oggetto/stringa proveniente da una RPC Marketplace.
 * @returns {string} messaggio utente in italiano, senza dettagli tecnici.
 */
export function mapMarketplaceError(err) {
  const token = extractToken(err);
  return (token && MESSAGES[token]) || MARKETPLACE_ERROR_GENERIC;
}

/** true se l'errore corrisponde a un token di dominio noto (non un generico). */
export function isKnownMarketplaceError(err) {
  return extractToken(err) != null;
}
