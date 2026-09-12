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

export type QuoteEmailSpec = {
  recipientEmail: string;
  recipientName?: string;
  customerPhone?: string;
  location?: string;
  quantity?: number;
  service?: string;
  distribution?: string;
  format?: string;
  printStatus?: string;
  timing?: string;
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
  const recipientEmail = s(raw?.recipientEmail ?? raw?.cliente?.email ?? raw?.email, 160).toLowerCase();
  if (!EMAIL_RE.test(recipientEmail)) return null;
  const grandTotal = num(raw?.grandTotal ?? raw?.preventivo?.grandTotal ?? raw?.total_amount ?? raw?.total);
  if (grandTotal == null || grandTotal < 0) return null;

  const q = raw?.preventivo || raw || {};
  const extrasRaw = Array.isArray(q.extras) ? q.extras : Array.isArray(raw?.extras) ? raw.extras : [];
  const extras: QuoteEmailExtra[] = extrasRaw.slice(0, 20).map((e: any) => ({
    label: s(typeof e === "string" ? e : (e?.label || e?.head || e?.name), 80),
    amount: num(e?.amount ?? e?.price),
  })).filter((e: QuoteEmailExtra) => e.label);

  const quantity = num(q.quantity ?? q.quantita ?? raw?.quantity ?? raw?.flyer_quantity);
  return {
    recipientEmail,
    recipientName: s(raw?.recipientName ?? raw?.cliente?.nome ?? raw?.nome ?? raw?.client_name, 80) || undefined,
    customerPhone: s(raw?.customerPhone ?? raw?.cliente?.telefono ?? raw?.telefono ?? raw?.client_phone, 40) || undefined,
    location: s(q.location ?? q.localita ?? raw?.location ?? raw?.zones ?? raw?.comune ?? raw?.city_name, 200) || undefined,
    quantity: quantity != null && quantity >= 0 ? Math.round(quantity) : undefined,
    service: s(q.service ?? q.servizio ?? raw?.service ?? raw?.service_type, 120) || undefined,
    distribution: s(q.distribution ?? q.distribuzione ?? raw?.distribution, 160) || undefined,
    format: s(q.format ?? raw?.format ?? raw?.flyer_format, 40) || undefined,
    printStatus: s(q.printStatus ?? raw?.printStatus ?? raw?.materialStatus, 60) || undefined,
    timing: s(q.timing ?? raw?.timing, 80) || undefined,
    printingLabel: s(q.printingLabel ?? raw?.printingLabel, 80) || undefined,
    printingAmount: num(q.printingAmount ?? raw?.printingAmount),
    graphicLabel: s(q.graphicLabel ?? raw?.graphicLabel, 80) || undefined,
    graphicAmount: num(q.graphicAmount ?? raw?.graphicAmount),
    extras,
    grandTotal,
    quoteId: s(q.quoteId ?? q.campaignId ?? raw?.quoteId ?? raw?.campaignId ?? raw?.id, 64) || undefined,
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

/** { subject, html, text } per l'email "preventivo" inviata al cliente (Step4 legacy). */
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

/**
 * Email di notifica interna all'Admin per nuovo preventivo ricevuto.
 * Richiede destinatario fisso: info@volantinipro.it.
 */
export function buildAdminQuoteNotificationEmail(spec: QuoteEmailSpec): { subject: string; html: string; text: string } {
  const zoneSummary = spec.location || "Zona non specificata";
  const totalFormatted = spec.grandTotal.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const subject = `Nuovo preventivo VolantiniPro — ${zoneSummary} — €${totalFormatted}`;
  const extrasSummary = spec.extras && spec.extras.length > 0 ? spec.extras.map((e) => e.label).join(", ") : "Nessuno";
  const adminUrl = `${spec.siteUrl.replace(/\/+$/, "")}/admin/clients-quotes`;

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;line-height:1.6;color:#1e293b;padding:20px;background:#f8fafc;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:24px;box-shadow:0 4px 12px rgba(0,0,0,0.05);">
    <h2 style="color:#0f172a;margin-top:0;font-size:20px;border-bottom:2px solid #e2e8f0;padding-bottom:12px;">Nuova richiesta preventivo ricevuta</h2>
    <p style="margin:0 0 16px;color:#475569;">È stata inviata una nuova richiesta di preventivo dal sito VolantiniPro.</p>
    
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:14px;">
      <tr><td style="padding:8px 0;color:#64748b;width:140px;"><strong>Cliente:</strong></td><td style="padding:8px 0;color:#0f172a;">${esc(spec.recipientName || "Non indicato")}</td></tr>
      <tr><td style="padding:8px 0;color:#64748b;"><strong>Email:</strong></td><td style="padding:8px 0;color:#0f172a;"><a href="mailto:${esc(spec.recipientEmail)}" style="color:#e8571a;text-decoration:none;">${esc(spec.recipientEmail)}</a></td></tr>
      <tr><td style="padding:8px 0;color:#64748b;"><strong>Telefono:</strong></td><td style="padding:8px 0;color:#0f172a;">${esc(spec.customerPhone || "Non indicato")}</td></tr>
      <tr><td style="padding:8px 0;color:#64748b;"><strong>Servizio:</strong></td><td style="padding:8px 0;color:#0f172a;">${esc(spec.service || "Door to Door")}</td></tr>
      <tr><td style="padding:8px 0;color:#64748b;"><strong>Zone:</strong></td><td style="padding:8px 0;color:#0f172a;">${esc(zoneSummary)}</td></tr>
      <tr><td style="padding:8px 0;color:#64748b;"><strong>Quantità:</strong></td><td style="padding:8px 0;color:#0f172a;">${spec.quantity ? `${spec.quantity.toLocaleString("it-IT")} volantini` : "Non indicata"}</td></tr>
      <tr><td style="padding:8px 0;color:#64748b;"><strong>Formato / Stampa:</strong></td><td style="padding:8px 0;color:#0f172a;">${esc(spec.format || "Standard")} — ${esc(spec.printStatus || "Da definire")}</td></tr>
      <tr><td style="padding:8px 0;color:#64748b;"><strong>Tempistica:</strong></td><td style="padding:8px 0;color:#0f172a;">${esc(spec.timing || "Flessibile")}</td></tr>
      <tr><td style="padding:8px 0;color:#64748b;"><strong>Extra:</strong></td><td style="padding:8px 0;color:#0f172a;">${esc(extrasSummary)}</td></tr>
      <tr style="border-top:1px solid #e2e8f0;"><td style="padding:12px 0 8px;color:#0f172a;font-size:16px;"><strong>Totale stimato:</strong></td><td style="padding:12px 0 8px;color:#0f172a;font-size:18px;"><strong>€${totalFormatted}</strong></td></tr>
      <tr><td style="padding:8px 0;color:#64748b;"><strong>ID richiesta:</strong></td><td style="padding:8px 0;color:#64748b;font-family:monospace;">${esc(spec.quoteId || "n/d")}</td></tr>
    </table>

    <div style="margin-top:24px;text-align:center;">
      <a href="${esc(adminUrl)}" style="display:inline-block;padding:12px 24px;border-radius:8px;background:#e8571a;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;">Apri richiesta in Admin</a>
    </div>
  </div>
</body>
</html>`;

  const text = [
    "Nuova richiesta preventivo ricevuta.",
    "",
    `Cliente: ${spec.recipientName || "Non indicato"}`,
    `Email: ${spec.recipientEmail}`,
    `Telefono: ${spec.customerPhone || "Non indicato"}`,
    `Servizio: ${spec.service || "Door to Door"}`,
    `Zone: ${zoneSummary}`,
    `Quantità: ${spec.quantity ? `${spec.quantity.toLocaleString("it-IT")} volantini` : "Non indicata"}`,
    `Formato / Stampa: ${spec.format || "Standard"} — ${spec.printStatus || "Da definire"}`,
    `Tempistica: ${spec.timing || "Flessibile"}`,
    `Extra: ${extrasSummary}`,
    `Totale stimato: €${totalFormatted}`,
    `ID richiesta: ${spec.quoteId || "n/d"}`,
    "",
    `Apri richiesta in Admin: ${adminUrl}`,
  ].join("\n");

  return { subject, html, text };
}

/**
 * Email di conferma ricezione inviata al cliente.
 * Non promette "pagamento ricevuto" né "campagna confermata" (quote receipt only).
 */
export function buildCustomerQuoteConfirmationEmail(spec: QuoteEmailSpec): { subject: string; html: string; text: string } {
  const subject = "VolantiniPro — Preventivo ricevuto";
  const customerName = spec.recipientName || "Cliente";
  const zones = spec.location || "Zona da definire";
  const totalFormatted = spec.grandTotal.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const service = spec.service || "Door to Door";
  const quantity = spec.quantity ? spec.quantity.toLocaleString("it-IT") : "Non specificata";

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;line-height:1.6;color:#1e293b;padding:20px;background:#f8fafc;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:24px;box-shadow:0 4px 12px rgba(0,0,0,0.05);">
    <h2 style="color:#0f172a;margin-top:0;font-size:20px;">Ciao ${esc(customerName)},</h2>
    <p style="color:#475569;margin-bottom:18px;">abbiamo ricevuto correttamente la tua richiesta di preventivo.</p>
    
    <div style="background:#f1f5f9;border-radius:8px;padding:16px;margin-bottom:20px;">
      <div style="font-weight:700;color:#0f172a;margin-bottom:8px;font-size:14px;">Riepilogo preventivo:</div>
      <ul style="margin:0;padding-left:20px;color:#334155;font-size:14px;">
        <li style="margin-bottom:4px;"><strong>Servizio:</strong> ${esc(service)}</li>
        <li style="margin-bottom:4px;"><strong>Zone:</strong> ${esc(zones)}</li>
        <li style="margin-bottom:4px;"><strong>Quantità:</strong> ${esc(quantity)} volantini</li>
        <li style="margin-bottom:4px;"><strong>Totale stimato:</strong> €${totalFormatted} (+ IVA)</li>
      </ul>
    </div>

    <p style="color:#475569;font-size:14px;margin-bottom:16px;">Il nostro team verificherà i dettagli della richiesta.</p>
    
    <p style="color:#64748b;font-size:12px;font-family:monospace;margin-bottom:24px;">ID richiesta: ${esc(spec.quoteId || "n/d")}</p>

    <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;" />

    <p style="color:#64748b;font-size:13px;margin:0;">
      <strong>VolantiniPro</strong><br>
      <a href="mailto:${esc(SUPPORT_EMAIL)}" style="color:#e8571a;text-decoration:none;">${esc(SUPPORT_EMAIL)}</a><br>
      <a href="${esc(spec.siteUrl)}" style="color:#64748b;text-decoration:none;">www.volantinipro.it</a>
    </p>
  </div>
</body>
</html>`;

  const text = [
    `Ciao ${customerName},`,
    "",
    "abbiamo ricevuto correttamente la tua richiesta di preventivo.",
    "",
    "Riepilogo:",
    `- Servizio: ${service}`,
    `- Zone: ${zones}`,
    `- Quantità: ${quantity}`,
    `- Totale stimato: €${totalFormatted}`,
    "",
    "Il nostro team verificherà i dettagli della richiesta.",
    "",
    `ID richiesta: ${spec.quoteId || "n/d"}`,
    "",
    "VolantiniPro",
    SUPPORT_EMAIL,
    "www.volantinipro.it",
  ].join("\n");

  return { subject, html, text };
}

