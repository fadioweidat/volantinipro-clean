// send-email-conferma — endpoint email transazionali cliente:
//  - type "conferma" / "pagamento_ricevuto": contenuto INVARIATO (istruzioni bonifico / notifica pagamento).
//  - type "preventivo": invia il riepilogo del preventivo Step4 via email al cliente ("Invia preventivo via email").
//
// Sicurezza & Hardening DB Live:
// - RESEND_API_KEY letta SOLO da _shared/sendTransactionalEmail.ts, mai qui.
// - CORS + solo POST.
// - Validazione payload lato server per ogni type (nessun trust del body).
// - Nessuna PII memorizzata nel DB né nei log tecnici:
//   * recipientEmail normalizzato (trim + lower) e convertito in SHA-256 (recipient_hash).
//   * IP del client convertito in SHA-256 (ip_hash), nessun IP raw nel DB.
// - Persistenza atomica su DB (tabelle edge_rate_limit_buckets e edge_idempotency_keys):
//   * Idempotenza atomica tramite RPC check_idempotency_and_mark (status: pending, sent, failed).
//   * Richieste deduplicate (sent o pending concorrente) NON consumano token di rate limit.
//   * Failed retry consentito solo dopo cooldown >= 60s con incremento di attempt_count.
//   * Rate limit: max 5 invii effettivi per recipient_hash in 10 minuti (HTTP 429 + Retry-After).
//   * Nessun cron job creato (pulizia gestita separatamente).

// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";
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

// --- Hashing crittografico (SHA-256) per tutela della privacy (GDPR / zero PII) ---
async function sha256Hex(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function normalizeEmail(email: unknown): string {
  return String(email || "").trim().toLowerCase();
}

function extractClientIp(req: Request): string {
  const cf = req.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || "unknown";
}

function getSupabaseAdmin() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

// Costruzione chiave di idempotenza priva di PII (usa recipient_hash)
async function buildPersistentIdempotencyKey(
  type: string,
  recipientHash: string,
  quoteOrCampaignId: string | null,
  requestId: unknown,
  payloadFingerprintRaw: string
): Promise<string> {
  const explicit = String(requestId || "").trim().slice(0, 100);
  const secondaryIdentifier = explicit ? `req:${explicit}` : `fp:${await sha256Hex(payloadFingerprintRaw)}`;
  const middle = quoteOrCampaignId ? `:${quoteOrCampaignId}:` : ":";
  return `${type}:${recipientHash}${middle}${secondaryIdentifier}`;
}

// --- Contenuto "conferma" / "pagamento_ricevuto" — INVARIATO ---------------
const IBAN = "IT60 X0542 8111 0100 0001 2345 6";
const INTESTATARIO = "VolantiniPro Srl";

function buildConfermaEmail(cliente: any, campagna: any, isPaid: boolean): { subject: string; html: string } {
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

  let raw: any;
  try {
    raw = await req.json();
  } catch {
    return json({ ok: false, code: "INVALID_JSON" }, 400);
  }
  if (!raw || typeof raw !== "object") return json({ ok: false, code: "INVALID_PAYLOAD" }, 400);

  const type = String(raw.type || "conferma");
  const clientIp = extractClientIp(req);
  const ipHash = await sha256Hex(clientIp);

  let recipientEmail = "";
  let quoteOrCampaignId: string | null = null;
  let fingerprintPayload = "";
  let subject = "";
  let html = "";
  let text: string | undefined = undefined;

  if (type === "preventivo") {
    const siteUrl = String(Deno.env.get("SITE_URL") || "https://www.volantinipro.it").trim() || "https://www.volantinipro.it";
    const spec = sanitizeQuoteEmailSpec(raw, siteUrl);
    if (!spec) return json({ ok: false, code: "INVALID_PAYLOAD" }, 400);

    recipientEmail = spec.recipientEmail;
    quoteOrCampaignId = spec.quoteId || null;
    fingerprintPayload = `${spec.quoteId || ""}:${spec.grandTotal}:${spec.location || ""}:${spec.service || ""}`;

    const content = buildQuoteEmail(spec);
    subject = content.subject;
    html = content.html;
    text = content.text;
  } else {
    // type "conferma" / "pagamento_ricevuto"
    const cliente = raw.cliente || {};
    const campagna = raw.campagna || {};
    recipientEmail = normalizeEmail(cliente?.email);
    if (!EMAIL_RE.test(recipientEmail)) return json({ ok: false, code: "INVALID_RECIPIENT" }, 400);

    quoteOrCampaignId = campagna?.id ? String(campagna.id) : null;
    fingerprintPayload = `${campagna?.servizio || ""}:${campagna?.zona || ""}:${campagna?.totale_euro || ""}`;

    const isPaid = type === "pagamento_ricevuto";
    const content = buildConfermaEmail(cliente, campagna, isPaid);
    subject = content.subject;
    html = content.html;
  }

  const recipientHash = await sha256Hex(recipientEmail);
  const key = await buildPersistentIdempotencyKey(type, recipientHash, quoteOrCampaignId, raw.requestId, fingerprintPayload);

  const supabase = getSupabaseAdmin();

  // --- 1. Controllo Idempotenza Atomico nel DB -----------------------------
  if (supabase) {
    const { data: idem, error: idemErr } = await supabase.rpc("check_idempotency_and_mark", {
      p_idempotency_key: key,
      p_email_type: type,
      p_recipient_hash: recipientHash,
      p_ip_hash: ipHash,
      p_cooldown_seconds: 60,
      p_ttl_seconds: 86400,
    });

    if (idemErr) {
      console.error("[send-email-conferma] IDEMPOTENCY_RPC_ERROR", { type, code: idemErr.code });
    } else if (idem) {
      if (idem.action === "dedup") {
        // Già inviata con successo: deduped true, NESSUN invio, NESSUN consumo rate limit
        return json({ ok: true, deduped: true, id: idem.provider_message_id || undefined });
      }
      if (idem.action === "in_progress") {
        // Richiesta concorrente già in elaborazione: deduped true, nessun secondo invio
        return json({ ok: true, deduped: true, in_progress: true });
      }
      if (idem.action === "cooldown") {
        // Tentativo precedente fallito: cooldown >= 60s
        const retryAfter = Number(idem.retry_after_seconds || 60);
        return new Response(JSON.stringify({ ok: false, code: "RETRY_TOO_EARLY", retryAfterSeconds: retryAfter }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": String(retryAfter) },
        });
      }
      // idem.action === "proceed" -> prosegui verso rate limit e invio
    }

    // --- 2. Rate Limiting Atomico nel DB (max 5 invii effettivi in 10 min) --
    // Eseguito SOLO per invii effettivi (non deduplicati)
    const { data: rl, error: rlErr } = await supabase.rpc("consume_edge_rate_limit", {
      p_scope: `email_${type}`,
      p_identifier_type: "recipient",
      p_identifier_hash: recipientHash,
      p_max_requests: 5,
      p_window_seconds: 600,
    });

    if (rlErr) {
      console.error("[send-email-conferma] RATE_LIMIT_RPC_ERROR", { type, code: rlErr.code });
    } else if (rl && !rl.allowed) {
      // Superato limite invii effettivi: segnala failed sull'idempotency per consentire retry futuro
      await supabase.rpc("mark_idempotency_result", {
        p_idempotency_key: key,
        p_status: "failed",
        p_error_code: "RATE_LIMITED",
      });
      const retryAfter = Number(rl.retry_after_seconds || 60);
      return new Response(JSON.stringify({ ok: false, code: "RATE_LIMITED", retryAfterSeconds: retryAfter }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": String(retryAfter) },
      });
    }
  }

  // --- 3. Invio effettivo tramite provider transazionale (Resend) ----------
  const result = await sendTransactionalEmail({ to: recipientEmail, subject, html, text });

  // --- 4. Registrazione Esito Atomico nel DB -------------------------------
  if (supabase) {
    if (result.ok) {
      await supabase.rpc("mark_idempotency_result", {
        p_idempotency_key: key,
        p_status: "sent",
        p_provider_message_id: result.id || null,
      });
    } else {
      await supabase.rpc("mark_idempotency_result", {
        p_idempotency_key: key,
        p_status: "failed",
        p_error_code: result.code || "SEND_FAILED",
      });
    }
  }

  if (!result.ok) {
    console.error("[send-email-conferma] SEND_FAILED", { type, code: result.code });
    const status = result.code === "EMAIL_NOT_CONFIGURED" ? 503 : 502;
    return json({ ok: false, code: result.code || "SEND_FAILED" }, status);
  }

  return json({ ok: true, id: result.id });
});
