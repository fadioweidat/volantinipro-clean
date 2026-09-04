// send-email-conferma — endpoint email transazionali cliente:
//  - type "conferma" / "pagamento_ricevuto": contenuto INVARIATO rispetto
//    alla versione precedente (istruzioni bonifico / notifica pagamento).
//  - type "preventivo" (nuovo): invia il riepilogo del preventivo Step4 via
//    email al cliente ("Invia preventivo via email"), FASE ticket "EMAIL
//    PREVENTIVO REALE END-TO-END".
//
// Sicurezza (hardening di questo giro — la function non aveva MAI un
// chiamante reale prima d'ora, quindi nessun comportamento live cambia):
// - RESEND_API_KEY letta SOLO da _shared/sendTransactionalEmail.ts, mai qui.
// - CORS + solo POST, rate limiting in-memory per IP (stesso pattern di
//   send-graphic-request/fadi-gateway).
// - Validazione payload lato server per ogni type (nessun trust del body).
// - Idempotenza in-memory: un doppio invio ravvicinato (stesso destinatario
//   + stesso contenuto, o stesso requestId esplicito) non genera una seconda
//   email — risponde "ok" senza rispedire (evita l'effetto "email duplicata"
//   da doppio click, difesa in profondita' oltre al disable lato frontend).
// - Nessun log di email/PII: solo type/esito/status.

// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { sendTransactionalEmail } from "../_shared/sendTransactionalEmail.ts";
import { buildQuoteEmail, sanitizeQuoteEmailSpec } from "../_shared/quoteEmail.ts";

declare const Deno: any;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// --- Rate limiting in-memory (stesso pattern di send-graphic-request) ------
function envInt(name: string, fallback: number, min: number, max: number): number {
  const raw = Deno.env.get(name);
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
const RATE_LIMIT_MAX = envInt("SEND_EMAIL_CONFERMA_RATE_MAX", 5, 1, 100);
const RATE_LIMIT_WINDOW_MS = envInt("SEND_EMAIL_CONFERMA_RATE_WINDOW_MS", 60000, 1000, 3600000);
const rateBuckets = new Map<string, { windowStart: number; count: number }>();
function clientKey(req: Request): string {
  const cf = req.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || "unknown";
}
function consumeRateLimit(req: Request): { allowed: boolean; retryAfterSeconds: number } {
  const key = clientKey(req);
  const now = Date.now();
  const cur = rateBuckets.get(key);
  if (!cur || now - cur.windowStart >= RATE_LIMIT_WINDOW_MS) {
    rateBuckets.set(key, { windowStart: now, count: 1 });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (cur.count >= RATE_LIMIT_MAX) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((RATE_LIMIT_WINDOW_MS - (now - cur.windowStart)) / 1000)) };
  }
  cur.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

// --- Idempotenza in-memory: evita un secondo invio quasi-simultaneo --------
const IDEMPOTENCY_WINDOW_MS = envInt("SEND_EMAIL_CONFERMA_IDEMPOTENCY_WINDOW_MS", 30000, 1000, 300000);
const recentSends = new Map<string, number>();
function idempotencyKey(type: string, recipientEmail: string, requestId: unknown, fingerprint: string): string {
  const explicit = String(requestId || "").trim().slice(0, 100);
  return explicit ? `${type}:${recipientEmail}:req:${explicit}` : `${type}:${recipientEmail}:${fingerprint}`;
}
function alreadySentRecently(key: string): boolean {
  const now = Date.now();
  for (const [k, ts] of recentSends) if (now - ts > IDEMPOTENCY_WINDOW_MS) recentSends.delete(k);
  const ts = recentSends.get(key);
  if (ts != null && now - ts <= IDEMPOTENCY_WINDOW_MS) return true;
  recentSends.set(key, now);
  return false;
}

// --- Contenuto "conferma" / "pagamento_ricevuto" — INVARIATO ---------------
const IBAN = "IT60 X0542 8111 0100 0001 2345 6";
const INTESTATARIO = "VolantiniPro Srl";

function buildConfermaEmail(cliente: any, campagna: any, isPaid: boolean): { subject: string; html: string } {
  // Distinzione esplicita (nessun calcolo qui, solo presentazione):
  //  - totale_euro           = importo distribuzione pagabile ORA via bonifico
  //  - grand_totale_euro      = totale preventivo stimato (distribuzione +
  //                             stampa indicativa + grafica) mostrato in Step 4 / PDF
  //  - stampa_indicativa      = importo stampa da confermare in tipografia
  // total_amount NON viene mai chiamato "Totale preventivo" / "Prezzo finale".
  const payNow = campagna?.totale_euro;
  const grandTotal = campagna?.grand_totale_euro ?? campagna?.grand_total ?? null;
  const stampaIndicativa = campagna?.stampa_indicativa ?? null;
  const hasDistinctGrandTotal =
    grandTotal != null && payNow != null && Number(grandTotal) !== Number(payNow);
  const quoteRecapRows = hasDistinctGrandTotal
    ? `
    <h2>Riepilogo preventivo</h2>
    <table>
      <tr><td>Totale preventivo stimato</td><td><strong>€${grandTotal}</strong></td></tr>
      <tr><td>Importo distribuzione da pagare ora</td><td><strong>€${payNow}</strong></td></tr>
      ${stampaIndicativa != null ? `<tr><td>Stampa (indicativa, da confermare in tipografia)</td><td>~€${stampaIndicativa}</td></tr>` : ""}
    </table>
    <p>La stampa è una stima indicativa: verrà confermata e fatturata separatamente dalla tipografia e non è inclusa nell'importo del bonifico qui sotto.</p>
  `
    : "";

  const html = isPaid ? `
    <h1>Pagamento ricevuto</h1>
    <p>Ciao ${cliente?.nome || cliente?.email || "Cliente"},</p>
    <p>Abbiamo ricevuto il pagamento per la tua campagna <strong>${campagna?.servizio}</strong> · <strong>${campagna?.zona}</strong>.</p>
    <p>La distribuzione inizierà entro 24 ore come concordato.</p>
    <p><a href="${campagna?.dashboard_url || "#"}">Vai alla dashboard</a></p>
    <p>Il team VolantiniPro</p>
  ` : `
    <h1>Campagna confermata — VolantiniPro</h1>
    <p>Ciao ${cliente?.nome || cliente?.email || "Cliente"},</p>
    <p>La tua campagna <strong>${campagna?.servizio}</strong> per la zona <strong>${campagna?.zona}</strong> è stata confermata.</p>
    ${quoteRecapRows}
    <h2>Istruzioni per il pagamento</h2>
    <table>
      <tr><td>Intestatario</td><td><strong>${INTESTATARIO}</strong></td></tr>
      <tr><td>IBAN</td><td><strong>${IBAN}</strong></td></tr>
      <tr><td>${hasDistinctGrandTotal ? "Importo distribuzione da pagare ora" : "Importo"}</td><td><strong>€${campagna?.totale_euro}</strong></td></tr>
      <tr><td>Causale</td><td><strong>${campagna?.causale_bonifico}</strong></td></tr>
    </table>
    <p>Inserire la causale ESATTA per il corretto abbinamento.</p>
    <p>La distribuzione partirà entro 24h dalla ricezione del pagamento.</p>
    <p>Il team VolantiniPro</p>
  `;
  return {
    subject: isPaid ? "Pagamento ricevuto — La distribuzione inizia presto!" : `Conferma campagna ${campagna?.servizio} — Istruzioni pagamento`,
    html,
  };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405);

  const rl = consumeRateLimit(req);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ ok: false, code: "RATE_LIMITED" }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": String(rl.retryAfterSeconds) },
    });
  }

  let raw: any;
  try {
    raw = await req.json();
  } catch {
    return json({ ok: false, code: "INVALID_JSON" }, 400);
  }
  if (!raw || typeof raw !== "object") return json({ ok: false, code: "INVALID_PAYLOAD" }, 400);

  const type = String(raw.type || "conferma");

  if (type === "preventivo") {
    const siteUrl = String(Deno.env.get("SITE_URL") || "https://www.volantinipro.it").trim() || "https://www.volantinipro.it";
    const spec = sanitizeQuoteEmailSpec(raw, siteUrl);
    if (!spec) return json({ ok: false, code: "INVALID_PAYLOAD" }, 400);

    const fingerprint = `${spec.quoteId || ""}:${spec.grandTotal}:${Math.floor(Date.now() / IDEMPOTENCY_WINDOW_MS)}`;
    const key = idempotencyKey(type, spec.recipientEmail, raw.requestId, fingerprint);
    if (alreadySentRecently(key)) return json({ ok: true, deduped: true });

    const content = buildQuoteEmail(spec);
    const result = await sendTransactionalEmail({ to: spec.recipientEmail, subject: content.subject, html: content.html, text: content.text });
    if (!result.ok) {
      console.error("[send-email-conferma] SEND_FAILED", { type, code: result.code });
      const status = result.code === "EMAIL_NOT_CONFIGURED" ? 503 : 502;
      return json({ ok: false, code: result.code || "SEND_FAILED" }, status);
    }
    return json({ ok: true, id: result.id });
  }

  // --- type "conferma" / "pagamento_ricevuto" (invariato) ------------------
  const cliente = raw.cliente || {};
  const campagna = raw.campagna || {};
  const recipientEmail = String(cliente?.email || "").trim().toLowerCase();
  if (!EMAIL_RE.test(recipientEmail)) return json({ ok: false, code: "INVALID_RECIPIENT" }, 400);

  const isPaid = type === "pagamento_ricevuto";
  const fingerprint = `${campagna?.servizio || ""}:${campagna?.zona || ""}:${Math.floor(Date.now() / IDEMPOTENCY_WINDOW_MS)}`;
  const key = idempotencyKey(type, recipientEmail, raw.requestId, fingerprint);
  if (alreadySentRecently(key)) return json({ ok: true, deduped: true });

  const { subject, html } = buildConfermaEmail(cliente, campagna, isPaid);
  const result = await sendTransactionalEmail({ to: recipientEmail, subject, html });
  if (!result.ok) {
    console.error("[send-email-conferma] SEND_FAILED", { type, code: result.code });
    const status = result.code === "EMAIL_NOT_CONFIGURED" ? 503 : 502;
    return json({ ok: false, code: result.code || "SEND_FAILED" }, status);
  }
  return json({ ok: true, id: result.id });
});
