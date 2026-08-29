/* Contatti ufficiali VolantiniPro per i CTA rivolti al cliente
 * (servizio grafico, invio file di stampa).
 *
 * EMAIL: fallback su "info@volantinipro.it" — valore gia' usato nel progetto
 *   (footer del PDF preventivo, src/lib/pdf/printQuotePdf.js). Non e' inventato.
 * WHATSAPP: nessun fallback. Il CTA WhatsApp compare SOLO se il numero e'
 *   configurato via env, per non mostrare un contatto inventato.
 *
 * Override opzionali: VITE_SUPPORT_EMAIL, VITE_SUPPORT_WHATSAPP (vedi .env.example).
 */

const env = (typeof import.meta !== "undefined" && import.meta.env) || {};

export const SUPPORT_EMAIL = String(env.VITE_SUPPORT_EMAIL || "info@volantinipro.it").trim();

const rawWhatsApp = String(env.VITE_SUPPORT_WHATSAPP || "").replace(/[^\d]/g, "");
export const SUPPORT_WHATSAPP = rawWhatsApp.length >= 8 ? rawWhatsApp : null;
export const HAS_SUPPORT_WHATSAPP = SUPPORT_WHATSAPP != null;

// Invio richiesta grafica via backend (Edge Function `send-graphic-request` +
// Resend). Flag FRONTEND non-segreto: NON è la RESEND_API_KEY, che resta solo
// server-side. Quando è attivo e Supabase è configurato, la card "Servizio
// grafico" mostra "Invia richiesta" (primaria) + "Apri email" (secondaria);
// altrimenti resta solo il fallback mailto.
export const GRAPHIC_REQUEST_ENABLED =
  String(env.VITE_GRAPHIC_REQUEST_ENABLED || "") === "true" && Boolean(env.VITE_SUPABASE_URL);

function fmtQty(q) {
  const n = Number(q);
  return Number.isFinite(n) && n > 0 ? n.toLocaleString("it-IT") : "";
}

/** Messaggio WhatsApp precompilato per la richiesta di servizio grafico. */
export function buildGraphicRequestText({ format, quantity, printEnabled, notes } = {}) {
  const lines = [
    "Ciao VolantiniPro,",
    "sto configurando una campagna e ho bisogno del servizio grafico.",
    "",
  ];
  if (format) lines.push(`Formato: ${String(format).toUpperCase()}`);
  if (fmtQty(quantity)) lines.push(`Quantità: ${fmtQty(quantity)}`);
  lines.push(`Stampa: ${printEnabled ? "Sì" : "No"}`);
  const trimmedNotes = notes == null ? "" : String(notes).trim();
  if (trimmedNotes) lines.push(`Note: ${trimmedNotes}`);
  lines.push("", "Vorrei informazioni e un preventivo per la grafica.");
  return lines.join("\n");
}

/** URL wa.me con messaggio precompilato, oppure null se WhatsApp non configurato. */
export function buildGraphicWhatsAppUrl(params = {}) {
  if (!HAS_SUPPORT_WHATSAPP) return null;
  return `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(buildGraphicRequestText(params))}`;
}

/** mailto: verso l'email ufficiale con oggetto e corpo precompilati. */
export function buildGraphicMailtoUrl({ format, quantity, notes } = {}) {
  const subject = "Richiesta servizio grafico - VolantiniPro";
  const body = [
    "Buongiorno,",
    "sto preparando una campagna VolantiniPro e ho bisogno del servizio grafico.",
    "",
    `Formato: ${format ? String(format).toUpperCase() : ""}`,
    `Quantità: ${fmtQty(quantity)}`,
    `Note: ${notes == null ? "" : String(notes).trim()}`,
    "",
    "Vorrei ricevere informazioni e un preventivo.",
  ].join("\n");
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
