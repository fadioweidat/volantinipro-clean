// Costruttore contenuto email "Richiesta servizio grafico" (server-side).
// Riceve un payload GIA' sanitizzato dall'endpoint (il server non si fida mai
// del body del browser: rilegge e limita ogni campo).

export const GRAPHIC_REQUEST_SUBJECT = "Richiesta servizio grafico - VolantiniPro";
export const NOTES_MAX_LEN = 2000;

export type GraphicRequestSpec = {
  format?: string;
  quantity?: number | string;
  orientation?: string;
  paperType?: string;
  grammage?: string;
  sides?: string;
  color?: string;
  fold?: string;
  notes?: string;
  clientEmail?: string;
};

const SIDES_LABEL: Record<string, string> = {
  fronte: "Solo fronte",
  fronte_retro_eq: "Fronte/retro uguali",
  fronte_retro: "Fronte/retro differenti",
};
const FOLD_LABEL: Record<string, string> = { nessuna: "Nessuna", meta: "Piega a metà", tre: "Piega a tre" };
const PAPER_LABEL: Record<string, string> = {
  patinata_opaca: "Patinata opaca",
  patinata_lucida: "Patinata lucida",
  uso_mano: "Uso mano",
};

function esc(v: unknown): string {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function fmtQty(q: unknown): string {
  const n = Number(q);
  return Number.isFinite(n) && n > 0 ? n.toLocaleString("it-IT") : "";
}

/** Sanitizza il payload lato server: whitelist di campi, cap lunghezza note. */
export function sanitizeGraphicRequestSpec(raw: any): GraphicRequestSpec {
  const s = (v: unknown, max = 60) => String(v == null ? "" : v).trim().slice(0, max);
  const notes = String(raw?.notes == null ? "" : raw.notes).slice(0, NOTES_MAX_LEN).trim();
  const clientEmailRaw = s(raw?.clientEmail, 120).toLowerCase();
  const clientEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmailRaw) ? clientEmailRaw : undefined;
  const qtyNum = Number(raw?.quantity);
  return {
    format: s(raw?.format, 12).toUpperCase() || undefined,
    quantity: Number.isFinite(qtyNum) && qtyNum > 0 ? Math.min(Math.round(qtyNum), 100000000) : undefined,
    orientation: s(raw?.orientation) || undefined,
    paperType: s(raw?.paperType) || undefined,
    grammage: s(raw?.grammage, 12).replace(/[^\d]/g, "") || undefined,
    sides: s(raw?.sides) || undefined,
    color: s(raw?.color) || undefined,
    fold: s(raw?.folding ?? raw?.fold) || undefined,
    notes: notes || undefined,
    clientEmail,
  };
}

function rows(spec: GraphicRequestSpec): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  if (spec.format) out.push(["Formato", spec.format]);
  if (fmtQty(spec.quantity)) out.push(["Quantità", fmtQty(spec.quantity)]);
  if (spec.orientation) out.push(["Orientamento", spec.orientation === "orizzontale" ? "Orizzontale" : "Verticale"]);
  if (spec.paperType) out.push(["Carta", PAPER_LABEL[spec.paperType] || spec.paperType]);
  if (spec.grammage) out.push(["Grammatura", `${spec.grammage} g/m²`]);
  if (spec.sides) out.push(["Lati", SIDES_LABEL[spec.sides] || spec.sides]);
  if (spec.color) out.push(["Colore", spec.color === "bianco_nero" ? "Bianco/nero" : "Colori"]);
  if (spec.fold) out.push(["Piega", FOLD_LABEL[spec.fold] || spec.fold]);
  if (spec.clientEmail) out.push(["Email cliente", spec.clientEmail]);
  return out;
}

/** { subject, html, text } per l'email interna a VolantiniPro. */
export function buildGraphicRequestEmail(spec: GraphicRequestSpec): { subject: string; html: string; text: string } {
  const list = rows(spec);
  const notes = spec.notes ? spec.notes : "—";

  const html = `<h2>Richiesta servizio grafico</h2>
<p>Un cliente ha richiesto il servizio grafico dal configuratore VolantiniPro.</p>
<table cellpadding="6" style="border-collapse:collapse">
${list.map(([k, v]) => `<tr><td style="color:#64748b">${esc(k)}</td><td><strong>${esc(v)}</strong></td></tr>`).join("\n")}
<tr><td style="color:#64748b;vertical-align:top">Note cliente</td><td>${esc(notes).replace(/\n/g, "<br>")}</td></tr>
</table>`;

  const text = [
    "Richiesta servizio grafico — VolantiniPro",
    "",
    ...list.map(([k, v]) => `${k}: ${v}`),
    `Note cliente: ${notes}`,
  ].join("\n");

  return { subject: GRAPHIC_REQUEST_SUBJECT, html, text };
}

/** Conferma semplice al cliente (solo se l'email cliente è disponibile e valida). */
export function buildClientConfirmationEmail(spec: GraphicRequestSpec): { subject: string; html: string; text: string } {
  const html = `<p>Ciao,</p>
<p>abbiamo ricevuto la tua richiesta per il <strong>servizio grafico VolantiniPro</strong>.</p>
<p>Ti ricontatteremo al più presto con informazioni e un preventivo. Il costo della grafica non è incluso nel prezzo di stampa.</p>
<p>Il team VolantiniPro</p>`;
  const text = [
    "Ciao,",
    "abbiamo ricevuto la tua richiesta per il servizio grafico VolantiniPro.",
    "Ti ricontatteremo al più presto con informazioni e un preventivo.",
    "Il costo della grafica non è incluso nel prezzo di stampa.",
    "Il team VolantiniPro",
  ].join("\n");
  return { subject: "Richiesta servizio grafico ricevuta - VolantiniPro", html, text };
}
