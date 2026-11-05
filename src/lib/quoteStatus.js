// STATO DEL PREVENTIVO (2026-11-05). Una sola fonte per Step 4 e PDF.
//
// Stato reale della campagna:
//  - prima del salvataggio non esiste una campagna: il preventivo e' una
//    stima ("Preventivo stimato"; "Stima indicativa" nel Preventivo rapido);
//  - dopo "Conferma e avvia" submit-campaign-request crea la campagna con
//    status "pending_review": il cliente ha confermato, l'operativita' deve
//    ancora verificarla ("Preventivo confermato", in attesa di verifica;
//    la dashboard cliente mostra lo stesso stato come "confermata");
//  - "Campagna confermata" solo quando lo stato DB e' approvato o successivo.

export const QUOTE_STATUS = Object.freeze({
  INDICATIVE: "indicative",
  ESTIMATED: "estimated",
  SUBMITTED: "submitted",
  CONFIRMED: "confirmed",
});

const CONFIRMED_DB_STATUSES = new Set(["approved", "scheduled", "in_progress", "completed"]);

const ESTIMATE_DISCLAIMER = "Il presente documento è una stima operativa generata da VolantiniPro sulla base dei dati inseriti e delle analisi territoriali disponibili. Il preventivo può essere soggetto a conferma operativa.";
const SUBMITTED_DISCLAIMER = "Preventivo confermato dal cliente e registrato da VolantiniPro. La campagna è in attesa di verifica operativa (disponibilità, operatori e date) prima dell'avvio.";
const CONFIRMED_DISCLAIMER = "Campagna confermata da VolantiniPro. Importi e quantità sono quelli riportati in questo documento.";

/**
 * @param {{ isQuick?: boolean, sent?: boolean, campaignStatus?: string|null }} input
 * @returns {{ key: string, label: string, badge: string|null, planning: string, actionHint: string, disclaimer: string }}
 */
export function resolveQuoteStatus({ isQuick = false, sent = false, campaignStatus = null } = {}) {
  const db = String(campaignStatus || "").toLowerCase();
  if (sent && CONFIRMED_DB_STATUSES.has(db)) {
    return { key: QUOTE_STATUS.CONFIRMED, label: "Campagna confermata", badge: "✓ Campagna confermata", planning: "CONFERMATA", actionHint: "Campagna confermata", disclaimer: CONFIRMED_DISCLAIMER };
  }
  if (sent) {
    return { key: QUOTE_STATUS.SUBMITTED, label: "Preventivo confermato", badge: "✓ Preventivo confermato", planning: "IN VERIFICA OPERATIVA", actionHint: "Preventivo confermato · in attesa di verifica operativa", disclaimer: SUBMITTED_DISCLAIMER };
  }
  if (isQuick) {
    return { key: QUOTE_STATUS.INDICATIVE, label: "Stima indicativa", badge: "Stima indicativa", planning: "DA CONFERMARE", actionHint: "Stima indicativa", disclaimer: ESTIMATE_DISCLAIMER };
  }
  return { key: QUOTE_STATUS.ESTIMATED, label: "Preventivo stimato", badge: null, planning: "DA CONFERMARE", actionHint: "Preventivo stimato · da confermare", disclaimer: ESTIMATE_DISCLAIMER };
}

/**
 * Prezzo medio per volantino della riga di distribuzione: totale della riga
 * diviso la quantita' (le tariffe sono per zona/fascia, non un prezzo unico).
 * Restituisce null se non calcolabile.
 */
export function averageUnitPrice(total, quantity) {
  const t = Number(total);
  const q = Number(quantity);
  if (!Number.isFinite(t) || !Number.isFinite(q) || q <= 0) return null;
  return t / q;
}
