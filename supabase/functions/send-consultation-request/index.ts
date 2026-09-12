// send-consultation-request — endpoint PUBBLICO POST per il form
// "Parla con un consulente" dal sito pubblico VolantiniPro.
//
// Sicurezza:
// - RESEND_API_KEY solo server-side (via _shared/sendTransactionalEmail), MAI
//   nel bundle Vite, mai loggata.
// - Il DESTINATARIO INTERNO è fissato lato server (env CONSULTATION_REQUEST_TO
//   / default volantinipro@gmail.com). Il browser NON può scegliere `to`.
// - Rate limiting in-memory per IP (5 req/60s, configurabile via env).
// - Honeypot anti-spam.
// - Validazione input + cap lunghezze (tutto riletto server-side).
// - Insert in consultation_requests via service_role PRIMA dell'invio email:
//   il dato è salvato anche se Resend non è configurato.
// - Fail closed su errori di business, graceful su email (salva comunque).

// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";
import { sendTransactionalEmail } from "../_shared/sendTransactionalEmail.ts";
import {
  sanitizeConsultationSpec,
  buildConsultationRequestEmail,
} from "../_shared/consultationRequestEmail.ts";

declare const Deno: any;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// --- Destinatario interno FISSO lato server ----------------------------------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function internalRecipient(): string {
  const candidates = [
    Deno.env.get("CONSULTATION_REQUEST_TO"),
    Deno.env.get("GRAPHIC_REQUEST_TO"),
    Deno.env.get("RESEND_REPLY_TO_EMAIL"),
    "volantinipro@gmail.com",
  ];
  for (const c of candidates) {
    const v = String(c || "").trim();
    if (v && EMAIL_RE.test(v)) return v;
  }
  return "volantinipro@gmail.com";
}

// --- Rate limiting in-memory (stesso pattern di send-graphic-request) --------
function envInt(
  name: string,
  fallback: number,
  min: number,
  max: number
): number {
  const raw = Deno.env.get(name);
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
const RATE_LIMIT_MAX = envInt("CONSULTATION_REQUEST_RATE_MAX", 5, 1, 100);
const RATE_LIMIT_WINDOW_MS = envInt(
  "CONSULTATION_REQUEST_RATE_WINDOW_MS",
  60000,
  1000,
  3600000
);
const rateBuckets = new Map<string, { windowStart: number; count: number }>();

function clientKey(req: Request): string {
  const cf = req.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || "unknown";
}

function consumeRateLimit(req: Request): {
  allowed: boolean;
  retryAfterSeconds: number;
} {
  const key = clientKey(req);
  const now = Date.now();
  const cur = rateBuckets.get(key);
  if (!cur || now - cur.windowStart >= RATE_LIMIT_WINDOW_MS) {
    rateBuckets.set(key, { windowStart: now, count: 1 });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (cur.count >= RATE_LIMIT_MAX) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((RATE_LIMIT_WINDOW_MS - (now - cur.windowStart)) / 1000)
      ),
    };
  }
  cur.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

// --- Anti-spam ---------------------------------------------------------------
function looksLikeSpam(raw: any): boolean {
  if (!raw || typeof raw !== "object") return true;
  if (typeof raw._hp === "string" && raw._hp.trim() !== "") return true; // honeypot
  if (typeof raw.messaggio === "string" && raw.messaggio.length > 50000)
    return true;
  return false;
}

// --- Validazione business minima (server) ------------------------------------
function validateSpec(
  spec: ReturnType<typeof sanitizeConsultationSpec>
): string | null {
  if (!spec.nome || spec.nome.length < 2)
    return "Nome obbligatorio (minimo 2 caratteri)";
  if (!spec.telefono || spec.telefono.length < 5)
    return "Telefono obbligatorio";
  if (!spec.comune || spec.comune.length < 1) return "Comune obbligatorio";
  if (!["d2d", "h2h", "b2b"].includes(spec.servizio))
    return "Servizio non valido";
  if (spec.quantita <= 0) return "Quantità non valida";
  return null;
}

// --- Handler principale ------------------------------------------------------
serve(async (req: Request) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST")
    return json({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405);

  // Rate limit
  const rl = consumeRateLimit(req);
  if (!rl.allowed) {
    return new Response(
      JSON.stringify({ ok: false, code: "RATE_LIMITED" }),
      {
        status: 429,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Retry-After": String(rl.retryAfterSeconds),
        },
      }
    );
  }

  // Parse body
  let raw: any;
  try {
    raw = await req.json();
  } catch {
    return json({ ok: false, code: "INVALID_JSON" }, 400);
  }
  if (looksLikeSpam(raw)) return json({ ok: false, code: "REJECTED" }, 400);

  // Sanitize server-side (mai il body così com'è)
  const spec = sanitizeConsultationSpec(raw);
  const validationError = validateSpec(spec);
  if (validationError)
    return json({ ok: false, code: "VALIDATION_ERROR", error: validationError }, 422);

  // Supabase client (service_role — bypass RLS per l'insert)
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseServiceKey) {
    return json({ ok: false, code: "SERVER_MISCONFIGURED" }, 503);
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // 1) Salvataggio DB (prioritario — il dato deve essere persisted anche se l'email fallisce)
  const { data: dbRow, error: dbError } = await supabase
    .from("consultation_requests")
    .insert([
      {
        nome: spec.nome,
        telefono: spec.telefono,
        email: spec.email || null,
        comune: spec.comune,
        servizio: spec.servizio,
        quantita: spec.quantita,
        timing: spec.timing,
        custom_date:
          spec.timing === "custom" &&
          typeof spec.customDate === "string" &&
          /^\d{4}-\d{2}-\d{2}$/.test(spec.customDate)
            ? spec.customDate
            : null,
        messaggio: spec.messaggio || null,
        source: "consultant_form",
        status: "new",
      },
    ])
    .select("id")
    .single();

  if (dbError) {
    console.error("consultation_requests insert error:", dbError);
    return json(
      { ok: false, code: "DB_ERROR", error: "Errore salvataggio richiesta" },
      500
    );
  }

  const requestId: string = dbRow?.id ?? "unknown";

  // 2) Invio email (best-effort: non blocca la risposta se Resend non configurato)
  const to = internalRecipient();
  const emailContent = buildConsultationRequestEmail(spec);
  let emailResult: { ok: boolean; id?: string; code?: string } = {
    ok: false,
    code: "EMAIL_NOT_ATTEMPTED",
  };

  try {
    emailResult = await sendTransactionalEmail({
      to,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
      replyTo: spec.email,
    });

    if (!emailResult.ok) {
      // Log lato server — non espone dettagli al browser
      console.error(
        "Email send failed after DB insert:",
        emailResult.code,
        emailResult.error
      );
    }
  } catch (err: any) {
    console.error("Email send exception:", err?.message || err);
    emailResult = { ok: false, code: "EMAIL_EXCEPTION" };
  }

  // Il salvataggio DB è avvenuto → risposta ok al client.
  // L'email è best-effort; il failure non ritorna errore al cliente e non perde il lead.
  return json({
    ok: true,
    id: requestId,
    persisted: true,
    emailDispatched: emailResult.ok,
    emailCode: emailResult.ok ? undefined : emailResult.code,
  });
});
