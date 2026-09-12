// Template email "Nuova richiesta consulenza" (server-side, Edge Functions Deno).
// Riceve un payload già sanitizzato dall'endpoint send-consultation-request.

export const CONSULTATION_REQUEST_SUBJECT = "Nuova richiesta consulenza VolantiniPro";
export const MESSAGE_MAX_LEN = 3000;

export type ConsultationRequestSpec = {
  nome: string;
  telefono: string;
  email?: string;
  comune: string;
  servizio: string;
  quantita: number;
  timing: string;
  customDate?: string;
  messaggio?: string;
  createdAt: string;
};

const SERVIZIO_LABEL: Record<string, string> = {
  d2d: "Door to Door",
  h2h: "Hand to Hand",
  b2b: "Business Distribution",
};

const TIMING_LABEL: Record<string, string> = {
  asap: "Prima possibile",
  "1week": "Entro 1 settimana",
  "2weeks": "Entro 2 settimane",
  "1month": "Entro 1 mese",
  custom: "Data specifica",
};

function esc(v: unknown): string {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtQty(n: number): string {
  return Number.isFinite(n) && n > 0 ? n.toLocaleString("it-IT") : String(n);
}

function fmtTiming(timing: string, customDate?: string): string {
  if (timing === "custom" && customDate) {
    return `Data specifica: ${customDate}`;
  }
  return TIMING_LABEL[timing] || timing;
}

/** Sanitizza il payload lato server: whitelist di campi, cap lunghezze. */
export function sanitizeConsultationSpec(raw: any): ConsultationRequestSpec {
  const s = (v: unknown, max = 150) =>
    String(v == null ? "" : v)
      .trim()
      .slice(0, max);

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const emailRaw = s(raw?.email, 254).toLowerCase();
  const email = emailRaw && EMAIL_RE.test(emailRaw) ? emailRaw : undefined;

  const qtyNum = Number(raw?.quantita ?? raw?.qty);
  const quantita =
    Number.isFinite(qtyNum) && qtyNum > 0
      ? Math.min(Math.round(qtyNum), 10_000_000)
      : 10_000;

  const allowedServ = ["d2d", "h2h", "b2b"];
  const rawServ = s(raw?.servizio ?? raw?.service, 20);
  const servizio = allowedServ.includes(rawServ) ? rawServ : "d2d";

  const messaggio = String(raw?.messaggio ?? "")
    .slice(0, MESSAGE_MAX_LEN)
    .trim();

  return {
    nome: s(raw?.nome, 150),
    telefono: s(raw?.telefono, 30),
    email,
    comune: s(raw?.comune, 150),
    servizio,
    quantita,
    timing: s(raw?.timing, 40) || "asap",
    customDate: s(raw?.customDate ?? raw?.custom_date, 30) || undefined,
    messaggio: messaggio || undefined,
    createdAt: new Date().toISOString(),
  };
}

/** { subject, html, text } per l'email interna a VolantiniPro. */
export function buildConsultationRequestEmail(spec: ConsultationRequestSpec): {
  subject: string;
  html: string;
  text: string;
} {
  const rows: Array<[string, string]> = [
    ["Nome", spec.nome],
    ["Telefono / WhatsApp", spec.telefono],
    ["Email", spec.email || "—"],
    ["Comune / zona", spec.comune],
    ["Servizio", SERVIZIO_LABEL[spec.servizio] || spec.servizio],
    ["Quantità", `${fmtQty(spec.quantita)} volantini`],
    ["Quando vuole distribuire", fmtTiming(spec.timing, spec.customDate)],
  ];
  if (spec.timing === "custom" && spec.customDate) {
    rows.push(["Data specifica", spec.customDate]);
  }

  const messaggio = spec.messaggio || "—";
  const dataRichiesta = new Date(spec.createdAt).toLocaleString("it-IT", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Rome",
  });

  const tableRows = rows
    .map(
      ([k, v]) =>
        `<tr><td style="color:#64748b;padding:6px 12px 6px 0;white-space:nowrap;vertical-align:top">${esc(k)}</td><td style="padding:6px 0"><strong>${esc(v)}</strong></td></tr>`
    )
    .join("\n");

  const html = `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto">
  <h2 style="color:#0B192C;border-bottom:3px solid #E8571A;padding-bottom:8px">
    Nuova richiesta consulenza VolantiniPro
  </h2>
  <p style="color:#475569">Un cliente ha richiesto di parlare con un consulente dal sito VolantiniPro.</p>
  <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;margin:16px 0">
    ${tableRows}
    <tr>
      <td style="color:#64748b;padding:6px 12px 6px 0;white-space:nowrap;vertical-align:top">Messaggio</td>
      <td style="padding:6px 0">${esc(messaggio).replace(/\n/g, "<br>")}</td>
    </tr>
  </table>
  <hr style="border:none;border-top:1px solid #E2E8F0;margin:16px 0">
  <p style="font-size:12px;color:#94A3B8">
    Origine: Parla con un consulente (sito volantinipro.it)<br>
    Data richiesta: ${esc(dataRichiesta)}
  </p>
</div>`.trim();

  const text = [
    "Nuova richiesta dal sito VolantiniPro",
    "==========================================",
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    `Messaggio: ${messaggio}`,
    "",
    "Origine: Parla con un consulente",
    `Data richiesta: ${dataRichiesta}`,
  ].join("\n");

  return { subject: CONSULTATION_REQUEST_SUBJECT, html, text };
}
