// send-graphic-request — endpoint PUBBLICO POST per la richiesta "servizio
// grafico" dal configuratore Step1.
//
// Sicurezza:
// - RESEND_API_KEY solo server-side (via _shared/sendTransactionalEmail), mai
//   nel bundle Vite, mai loggata.
// - Il DESTINATARIO INTERNO è fissato lato server (env GRAPHIC_REQUEST_TO /
//   RESEND_REPLY_TO_EMAIL / default). Il browser NON può scegliere `to`.
// - Rate limiting in-memory per IP.
// - Validazione input + cap lunghezza note (NOTES_MAX_LEN).
// - Fail closed se Resend non è configurato: { ok:false, code:"EMAIL_NOT_CONFIGURED" }.

// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { sendTransactionalEmail } from "../_shared/sendTransactionalEmail.ts";
import {
  buildClientConfirmationEmail,
  buildGraphicRequestEmail,
  sanitizeGraphicRequestSpec,
} from "../_shared/graphicRequestEmail.ts";

declare const Deno: any;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// Destinatario INTERNO — mai dal body del browser.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function internalRecipient(): string {
  const candidates = [
    Deno.env.get("GRAPHIC_REQUEST_TO"),
    Deno.env.get("RESEND_REPLY_TO_EMAIL"),
    Deno.env.get("VITE_SUPPORT_EMAIL"),
    "info@volantinipro.it",
  ];
  for (const c of candidates) {
    const v = String(c || "").trim();
    if (v && EMAIL_RE.test(v)) return v;
  }
  return "info@volantinipro.it";
}

// --- Rate limiting in-memory (stesso pattern di fadi-gateway) ---------------
function envInt(name: string, fallback: number, min: number, max: number): number {
  const raw = Deno.env.get(name);
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
const RATE_LIMIT_MAX = envInt("GRAPHIC_REQUEST_RATE_MAX", 5, 1, 100);
const RATE_LIMIT_WINDOW_MS = envInt("GRAPHIC_REQUEST_RATE_WINDOW_MS", 60000, 1000, 3600000);
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

// Anti-spam basilare: honeypot + rifiuto note assurdamente lunghe (oltre il
// cap gia' applicato) o payload non-oggetto.
function looksLikeSpam(raw: any): boolean {
  if (!raw || typeof raw !== "object") return true;
  if (typeof raw._hp === "string" && raw._hp.trim() !== "") return true; // honeypot
  if (typeof raw.notes === "string" && raw.notes.length > 20000) return true;
  return false;
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
  if (looksLikeSpam(raw)) return json({ ok: false, code: "REJECTED" }, 400);

  // Il server RILEGGE e limita ogni campo: mai il body cosi' com'e'.
  const spec = sanitizeGraphicRequestSpec(raw);

  const to = internalRecipient(); // FISSO server-side
  const internal = buildGraphicRequestEmail(spec);
  const result = await sendTransactionalEmail({
    to,
    subject: internal.subject,
    html: internal.html,
    text: internal.text,
    // reply-to all'email cliente se disponibile, cosi' l'operatore risponde diretto
    replyTo: spec.clientEmail,
  });

  if (!result.ok) {
    const status = result.code === "EMAIL_NOT_CONFIGURED" ? 503 : 502;
    return json({ ok: false, code: result.code || "SEND_FAILED" }, status);
  }

  // Conferma al cliente — best effort, non blocca la richiesta interna.
  let clientConfirmed = false;
  if (spec.clientEmail) {
    const conf = buildClientConfirmationEmail(spec);
    const cr = await sendTransactionalEmail({
      to: spec.clientEmail,
      subject: conf.subject,
      html: conf.html,
      text: conf.text,
    });
    clientConfirmed = cr.ok;
  }

  return json({ ok: true, id: result.id, clientConfirmed });
});
