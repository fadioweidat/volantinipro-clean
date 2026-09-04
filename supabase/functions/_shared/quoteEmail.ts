// Costruttore contenuto email "Invia preventivo via email" (server-side).
// Riceve un payload GIA' sanitizzato dall'endpoint (sanitizeQuoteEmailSpec):
// il server non si fida mai del body del browser, rilegge e limita ogni
// campo. NESSUN calcolo di prezzo qui — grandTotal e le altre righe sono
// SOLO presentate cosi' come arrivano dal client (stesso principio gia'
// documentato in send-email-conferma/index.ts per campagna.grand_totale_euro:
// Step4 e' l'unica fonte di verita' del prezzo prima della conferma
// campagna, non esiste un totale server-side alternativo da verificare qui).

export const QUOTE_EMAIL_SUBJECT = "Il tuo preventivo VolantiniPro";

// Stessi contatti ufficiali di src/lib/contactConfig.js (SUPPORT_EMAIL
// default, numero WhatsApp del ticket) — duplicati qui perche' un edge
// function Deno non puo' importare un modulo Vite/import.meta.env (stessa
// scelta gia' fatta per maintenance.ts SENSITIVE_KEY/VALUE).
export const SUPPORT_EMAIL = "info@volantinipro.it";
export const SUPPORT_WHATSAPP_DIGITS = "393517673737";
export const SUPPORT_WHATSAPP_DISPLAY = "+39 351 767 3737";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type QuoteEmailExtra = { label: string; amount?: number | null };

export type QuoteEmailSpec = {
  recipientEmail: string;
  recipientName?: string;
  location?: string;
  quantity?: number;
  service?: string;
  distribution?: string;
  printingLabel?: string;
  printingAmount?: number;
  graphicLabel?: string;
  graphicAmount?: number;
  extras: QuoteEmailExtra[];
  grandTotal: number;
  quoteId?: string;
  siteUrl: string;
};

function s(v: unknown, max = 120): string {
  return String(v == null ? "" : v).trim().slice(0, max);
}
function num(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
function esc(v: unknown): string {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function eur(n: unknown): string {
  const v = num(n);
  return v == null ? "" : `€${v.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Sanitizza il payload lato server: whitelist di campi, validazione email e
 * grandTotal (unico campo obbligatorio oltre al destinatario — senza un
 * totale valido l'email non ha senso e viene rifiutata a monte).
 * Ritorna null se il payload non e' utilizzabile (email/grandTotal invalidi).
 */
export function sanitizeQuoteEmailSpec(raw: any, siteUrl: string): QuoteEmailSpec | null {
  const recipientEmail = s(raw?.recipientEmail ?? raw?.cliente?.email, 160).toLowerCase();
  if (!EMAIL_RE.test(recipientEmail)) return null;
  const grandTotal = num(raw?.grandTotal ?? raw?.preventivo?.grandTotal);
  if (grandTotal == null || grandTotal < 0) return null;

  const q = raw?.preventivo || raw || {};
  const extrasRaw = Array.isArray(q.extras) ? q.extras : [];
  const extras: QuoteEmailExtra[] = extrasRaw.slice(0, 20).map((e: any) => ({
    label: s(e?.label, 80),
    amount: num(e?.amount ?? e?.price),
  })).filter((e: QuoteEmailExtra) => e.label);

  const quantity = num(q.quantity ?? q.quantita);
  return {
    recipientEmail,
    recipientName: s(raw?.recipientName ?? raw?.cliente?.nome, 80) || undefined,
    location: s(q.location ?? q.localita, 160) || undefined,
    quantity: quantity != null && quantity >= 0 ? Math.round(quantity) : undefined,
    service: s(q.service ?? q.servizio, 120) || undefined,
    distribution: s(q.distribution ?? q.distribuzione, 160) || undefined,
    printingLabel: s(q.printingLabel, 80) || undefined,
    printingAmount: num(q.printingAmount),
    graphicLabel: s(q.graphicLabel, 80) || undefined,
    graphicAmount: num(q.graphicAmount),
    extras,
    grandTotal,
    quoteId: s(q.quoteId ?? q.campaignId, 64) || undefined,
    siteUrl,
  };
}

function rows(spec: QuoteEmailSpec): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  if (spec.location) out.push(["Località", spec.location]);
  if (spec.quantity != null) out.push(["Quantità", spec.quantity.toLocaleString("it-IT")]);
  if (spec.service) out.push(["Servizio", spec.service]);
  if (spec.distribution) out.push(["Distribuzione", spec.distribution]);
  if (spec.printingLabel) out.push([spec.printingLabel, spec.printingAmount != null ? eur(spec.printingAmount) : "—"]);
  if (spec.graphicLabel) out.push([spec.graphicLabel, spec.graphicAmount != null ? eur(spec.graphicAmount) : "—"]);
  for (const extra of spec.extras) out.push([extra.label, extra.amount != null ? eur(extra.amount) : "—"]);
  return out;
}

/** { subject, html, text } per l'email "preventivo" inviata al cliente. */
export function buildQuoteEmail(spec: QuoteEmailSpec): { subject: string; html: string; text: string } {
  const list = rows(spec);
  const greetingName = spec.recipientName ? esc(spec.recipientName) : "";
  const whatsappUrl = `https://wa.me/${SUPPORT_WHATSAPP_DIGITS}`;

  const html = `<h1>Il tuo preventivo VolantiniPro</h1>
<p>Ciao${greetingName ? ` ${greetingName}` : ""},</p>
<p>ecco il riepilogo del preventivo che hai configurato.</p>
<table cellpadding="6" style="border-collapse:collapse">
${list.map(([k, v]) => `<tr><td style="color:#64748b">${esc(k)}</td><td><strong>${esc(v)}</strong></td></tr>`).join("\n")}
<tr><td style="color:#64748b;border-top:1px solid #e2e8f0;padding-top:10px"><strong>Totale preventivo</strong></td><td style="border-top:1px solid #e2e8f0;padding-top:10px"><strong>${esc(eur(spec.grandTotal))}</strong></td></tr>
</table>
<p style="margin-top:16px"><a href="${esc(spec.siteUrl)}" style="display:inline-block;padding:10px 18px;border-radius:8px;background:#E8571A;color:#fff;text-decoration:none;font-weight:700">Vai al configuratore VolantiniPro</a></p>
<p>Puoi scaricare il PDF del preventivo direttamente dal configuratore, nella stessa schermata da cui hai richiesto questa email.</p>
<h2 style="margin-top:24px">Hai domande?</h2>
<p>WhatsApp: <a href="${esc(whatsappUrl)}">${esc(SUPPORT_WHATSAPP_DISPLAY)}</a><br>
Email: <a href="mailto:${esc(SUPPORT_EMAIL)}">${esc(SUPPORT_EMAIL)}</a></p>
<p>Il team VolantiniPro</p>`;

  const text = [
    "Il tuo preventivo VolantiniPro",
    "",
    `Ciao${greetingName ? ` ${greetingName}` : ""},`,
    "ecco il riepilogo del preventivo che hai configurato.",
    "",
    ...list.map(([k, v]) => `${k}: ${v}`),
    `Totale preventivo: ${eur(spec.grandTotal)}`,
    "",
    `Configuratore: ${spec.siteUrl}`,
    "Puoi scaricare il PDF direttamente dal configuratore.",
    "",
    `WhatsApp: ${SUPPORT_WHATSAPP_DISPLAY}`,
    `Email: ${SUPPORT_EMAIL}`,
    "",
    "Il team VolantiniPro",
  ].join("\n");

  return { subject: QUOTE_EMAIL_SUBJECT, html, text };
}
