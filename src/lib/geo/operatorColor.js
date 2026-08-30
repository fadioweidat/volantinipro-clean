// Colore STABILE per operatore. Lo stesso operatore mantiene lo stesso colore
// ovunque: traccia GPS reale, correzione manuale Admin a lui associata,
// legenda, dettaglio. Nessun colore che cambia a ogni render.
//
// Deterministico su una chiave che identifica l'operatore reale
// (`operator_id` / `driver_id` da auth.users; fallback `assignment_id`).
// Palette di 12 tinte ben distanziate in tonalita': oltre i 12 operatori si
// ricicla, ma senza confusione evidente entro i 12.

export const OPERATOR_PALETTE = Object.freeze([
  '#e8571a', // arancio brand
  '#2563eb', // blu
  '#16a34a', // verde
  '#a855f7', // viola
  '#0891b2', // ciano
  '#d97706', // ambra
  '#db2777', // fucsia
  '#4d7c0f', // oliva
  '#7c3aed', // indaco
  '#0f766e', // teal scuro
  '#b91c1c', // rosso mattone
  '#c026d3', // magenta
]);

// Grigio neutro: operatore non determinato (correzioni pre-feature senza id
// reale, oppure campagna senza assignment).
export const UNASSIGNED_OPERATOR_COLOR = '#94a3b8';

function djb2(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i += 1) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return h >>> 0;
}

/**
 * @param {string|number|null|undefined} operatorId  operator_id / driver_id reale
 * @returns {string} colore hex stabile (UNASSIGNED_OPERATOR_COLOR se id assente)
 */
export function getOperatorColor(operatorId) {
  const key = operatorId == null ? '' : String(operatorId).trim();
  if (!key) return UNASSIGNED_OPERATOR_COLOR;
  return OPERATOR_PALETTE[djb2(key) % OPERATOR_PALETTE.length];
}
