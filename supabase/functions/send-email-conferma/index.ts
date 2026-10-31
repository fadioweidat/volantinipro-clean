// send-email-conferma — endpoint email transazionali cliente:
//  - type "pagamento_ricevuto": solo Admin, destinatario e dati letti dal database (notifica pagamento).
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
import {
  buildQuoteEmail,
  sanitizeQuoteEmailSpec,
  buildAdminQuoteNotificationEmail,
  buildCustomerQuoteConfirmationEmail,
} from "../_shared/quoteEmail.ts";

declare const Deno: any;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getAdminRecipient(): string {
  const candidates = [
    Deno.env.get("CONSULTATION_REQUEST_TO"),
    Deno.env.get("RESEND_REPLY_TO_EMAIL"),
    "info@volantinipro.it",
  ];
  for (const c of candidates) {
    const v = String(c || "").trim();
    if (v && EMAIL_RE.test(v)) return v;
  }
  return "info@volantinipro.it";
}

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

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

function esc(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

function buildPaymentEmail(campaign: { client_name?: string | null; title?: string | null }): { subject: string; html: string } {
  const siteUrl = String(Deno.env.get("SITE_URL") || "https://www.volantinipro.it").trim();
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#1e293b;line-height:1.6">
      <h2>Pagamento ricevuto</h2>
      <p>Ciao ${esc(campaign.client_name || "Cliente")}, abbiamo ricevuto il pagamento per ${esc(campaign.title || "la tua campagna")}.</p>
      <p>La distribuzione inizia presto: puoi seguirla dalla tua area cliente.</p>
      <p><a href="${esc(siteUrl)}/dashboard">Vai alla dashboard</a></p>
    </div>`;
  return { subject: "Pagamento ricevuto — La distribuzione inizia presto!", html };
}

async function callerIsAdmin(req: Request): Promise<boolean> {
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const authorization = req.headers.get("Authorization");
  if (!url || !anonKey || !authorization) return false;
  const client = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const { data, error } = await client.rpc("gps_is_admin");
  return !error && data === true;
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

  const type = String(raw.type || "");
  const clientIp = extractClientIp(req);
  const ipHash = await sha256Hex(clientIp);

  let recipientEmail = "";
  let replyToEmail: string | undefined = undefined;
  let quoteOrCampaignId: string | null = null;
  let fingerprintPayload = "";
  let subject = "";
  let html = "";
  let text: string | undefined = undefined;
  let customIdempotencyKey: string | null = null;

  if (type === "preventivo_admin") {
    // SICUREZZA: Il destinatario Admin è FORZATO lato server su info@volantinipro.it.
    // Il payload frontend NON PUÒ MAI sovrascrivere il destinatario admin.
    const siteUrl = String(Deno.env.get("SITE_URL") || "https://www.volantinipro.it").trim() || "https://www.volantinipro.it";
    const spec = sanitizeQuoteEmailSpec(raw, siteUrl);
    if (!spec) return json({ ok: false, code: "INVALID_PAYLOAD" }, 400);

    recipientEmail = "info@volantinipro.it";
    // Reply-to indirizzato al cliente così l'admin può rispondere con 1 click
    replyToEmail = spec.recipientEmail;
    quoteOrCampaignId = spec.quoteId || null;
    fingerprintPayload = `admin:${spec.quoteId || ""}:${spec.grandTotal}:${spec.location || ""}`;

    const content = buildAdminQuoteNotificationEmail(spec);
    subject = content.subject;
    html = content.html;
    text = content.text;

    if (quoteOrCampaignId) {
      customIdempotencyKey = `quote_admin:${quoteOrCampaignId}`;
    }
  } else if (type === "preventivo_cliente") {
    // Conferma per il cliente: destinatario validato con solo i dati della richiesta
    const siteUrl = String(Deno.env.get("SITE_URL") || "https://www.volantinipro.it").trim() || "https://www.volantinipro.it";
    const spec = sanitizeQuoteEmailSpec(raw, siteUrl);
    if (!spec) return json({ ok: false, code: "INVALID_PAYLOAD" }, 400);

    recipientEmail = spec.recipientEmail;
    replyToEmail = "info@volantinipro.it";
    quoteOrCampaignId = spec.quoteId || null;
    fingerprintPayload = `cust:${spec.quoteId || ""}:${spec.grandTotal}:${spec.location || ""}`;

    const content = buildCustomerQuoteConfirmationEmail(spec);
    subject = content.subject;
    html = content.html;
    text = content.text;

    if (quoteOrCampaignId) {
      customIdempotencyKey = `quote_customer:${quoteOrCampaignId}`;
    }
  } else if (type === "preventivo") {
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
  } else if (type === "pagamento_ricevuto") {
    // Ramo solo Admin: il body indica la campagna, tutto il resto viene dal database.
    if (!(await callerIsAdmin(req))) return json({ ok: false, code: "FORBIDDEN" }, 403);
    const campaignId = String(raw.campaign_id || "");
    const admin = getSupabaseAdmin();
    if (!admin || !/^[0-9a-f-]{36}$/i.test(campaignId)) return json({ ok: false, code: "INVALID_PAYLOAD" }, 400);
    const { data: campaign } = await admin.from("campaigns").select("id, client_name, client_email, title").eq("id", campaignId).maybeSingle();
    recipientEmail = normalizeEmail(campaign?.client_email);
    if (!campaign || !EMAIL_RE.test(recipientEmail)) return json({ ok: false, code: "INVALID_RECIPIENT" }, 400);
    quoteOrCampaignId = campaignId;
    fingerprintPayload = campaignId;
    customIdempotencyKey = `payment_received:${campaignId}`;
    const content = buildPaymentEmail(campaign);
    subject = content.subject;
    html = content.html;
  } else {
    return json({ ok: false, code: "INVALID_TYPE" }, 400);
  }

  const recipientHash = await sha256Hex(recipientEmail);
  const key = customIdempotencyKey || await buildPersistentIdempotencyKey(type, recipientHash, quoteOrCampaignId, raw.requestId, fingerprintPayload);

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
    // preventivo_admin va sempre allo stesso destinatario: il contatore e' per IP,
    // cosi' un anonimo non puo' esaurirlo per tutti.
    const perRecipient = type !== "preventivo_admin";
    const { data: rl, error: rlErr } = await supabase.rpc("consume_edge_rate_limit", {
      p_scope: `email_${type}`,
      p_identifier_type: perRecipient ? "recipient" : "ip",
      p_identifier_hash: perRecipient ? recipientHash : ipHash,
      p_max_requests: 5,
      p_window_seconds: 600,
    });
    const { data: ipRl, error: ipRlErr } = rlErr
      ? { data: null, error: rlErr }
      : await supabase.rpc("consume_edge_rate_limit", {
        p_scope: "email_any",
        p_identifier_type: "ip",
        p_identifier_hash: ipHash,
        p_max_requests: 20,
        p_window_seconds: 3600,
      });

    if (rlErr || ipRlErr) {
      console.error("[send-email-conferma] RATE_LIMIT_RPC_ERROR", { type, code: (rlErr || ipRlErr)?.code });
      return json({ ok: false, code: "RATE_LIMIT_UNAVAILABLE" }, 503);
    }
    const limited = rl && !rl.allowed ? rl : ipRl && !ipRl.allowed ? ipRl : null;
    if (limited) {
      // Superato limite invii effettivi: segnala failed sull'idempotency per consentire retry futuro
      await supabase.rpc("mark_idempotency_result", {
        p_idempotency_key: key,
        p_status: "failed",
        p_error_code: "RATE_LIMITED",
      });
      const retryAfter = Number(limited.retry_after_seconds || 60);
      return new Response(JSON.stringify({ ok: false, code: "RATE_LIMITED", retryAfterSeconds: retryAfter }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": String(retryAfter) },
      });
    }
  }

  // --- 3. Invio effettivo tramite provider transazionale (Resend) ----------
  const result = await sendTransactionalEmail({
    to: recipientEmail,
    subject,
    html,
    text,
    ...(replyToEmail ? { replyTo: replyToEmail } : {}),
  });

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
