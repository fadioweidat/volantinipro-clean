/* Costruzione del body per la richiesta "servizio grafico" inviata all'Edge
 * Function `send-graphic-request`.
 *
 * IMPORTANTE:
 * - NON contiene mai il destinatario: `to`/`recipient` sono decisi SOLO
 *   server-side. Qui si spediscono solo i dati della configurazione stampa.
 * - `notes` viene troncato a NOTES_MAX_LEN (il server ri-tronca comunque).
 * - Whitelist esplicita dei campi: chiavi arbitrarie non passano.
 */

export const NOTES_MAX_LEN = 2000;

const FIELDS = ["format", "quantity", "orientation", "paperType", "grammage", "sides", "color", "fold", "clientEmail"];

export function buildGraphicRequestPayload(spec = {}) {
  const out = {};
  for (const key of FIELDS) {
    const v = spec[key] ?? (key === "fold" ? spec.folding : undefined);
    if (v == null || v === "") continue;
    if (key === "quantity") {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) out.quantity = Math.round(n);
      continue;
    }
    if (key === "clientEmail") {
      const e = String(v).trim().toLowerCase();
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) out.clientEmail = e;
      continue;
    }
    out[key] = String(v).trim().slice(0, key === "format" ? 12 : 60);
  }
  const notes = (spec.notes == null ? "" : String(spec.notes)).trim();
  if (notes) out.notes = notes.slice(0, NOTES_MAX_LEN);
  return out;
}
