// ai-core — backend AI centrale di VolantiniPro.
//
// Fase 1 e' un porting di ai-assistant-territory dietro un dispatcher
// contextType, non una riscrittura: stesso prompt territoriale, stesso
// modello, stessa cache. ai-assistant-territory resta deployata e invariata
// come rollback (nessuna cancellazione).
//
// Auth: il funnel Step1->Step2->Step3->Step4 e' usabile senza login, quindi
// contextType=step2 accetta richieste ANONIME (nessun JWT obbligatorio) —
// diverso da ai-assistant-territory, che lo richiede sempre. Se un JWT valido
// e' presente viene comunque usato (identita' verificata, mai dal body) per
// abilitare la cache utente; se assente o non valido la richiesta procede
// comunque, solo senza cache. Nessun dato cliente/account, nessuna query
// campaigns/profiles in questo branch: lo snapshot territoriale e' gia'
// pubblico/di preventivo. Deploy previsto con verify_jwt=false (il gateway
// Supabase non deve bloccare l'anonimo a monte della funzione).
//
// Il dispatcher mantiene policy per contesto: Step2 e Report Territoriale sono
// pubblici; Admin Dashboard verifica JWT e ruolo server-side. I contesti noti
// non ancora implementati rispondono NOT_IMPLEMENTED.
// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.4";
import { isKnownContextType, isImplementedContextType } from "./contextTypes.ts";
import { isAdminProfile } from "../_shared/aiAuthorization.ts";
import {
  buildAdminSystemPrompt,
  buildAdminUserPrompt,
  deterministicAdminResponse,
  numbersAreGrounded,
  validateAdminAiResult,
  validateAdminSnapshot,
} from "./adminDashboard.ts";
import {
  buildTerritorialReportSystemPrompt,
  buildTerritorialReportUserPrompt,
  deterministicTerritorialReportResponse,
  territorialReportNumbersAreGrounded,
  validateTerritorialReportAiResult,
  validateTerritorialReportSnapshot,
} from "./territorialReport.ts";

declare const Deno: any;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function supabaseAdmin() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

// L'utente non e' MAI fidato dal body, solo il JWT verificato contro Supabase
// Auth. Il funnel Step1->Step2->Step3->Step4 e' usabile senza login, quindi
// per contextType=step2 l'identita' e' OPZIONALE: se il Bearer token manca o
// non verifica, la richiesta NON viene rifiutata, procede semplicemente come
// anonima (return null, mai un errore) — validato solo se presente, mai
// imposto. Questa funzione resta comune: ogni branch decide se l'identita' e'
// obbligatoria (Admin) oppure opzionale (Step2 e Report Territoriale).
async function getAuthedUser(req: Request) {
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anonKey) return null;
  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

async function hashPayload(payload: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ── Validazione input Step2 ─────────────────────────────────────────────────
// Whitelist stretta sui campi di primo livello del body e limiti dimensionali
// espliciti: il body arbitrario del client non arriva mai cosi' com'e' a
// OpenAI, solo snapshot/question dopo questi controlli.
const MAX_QUESTION_LENGTH = 500;
const MAX_SNAPSHOT_JSON_LENGTH = 20000; // ~20KB, ampiamente sufficiente per uno snapshot territoriale reale
const MAX_SNAPSHOT_ARRAY_LENGTH = 200;
const MAX_SNAPSHOT_DEPTH = 8;
// Difesa in profondita': JSON.parse non attiva mai il prototipo reale (crea
// una proprieta' propria letterale), quindi non e' exploitable qui, ma un
// body raggiungibile anche in forma anonima (nessun JWT a monte) non deve
// contenere queste chiavi in nessun punto dello snapshot.
const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function isSnapshotStructureSafe(value: unknown, depth = 0): boolean {
  if (depth > MAX_SNAPSHOT_DEPTH) return false;
  if (value === null || value === undefined) return true;
  const type = typeof value;
  if (type === "string" || type === "boolean") return true;
  if (type === "number") return Number.isFinite(value);
  if (Array.isArray(value)) {
    if (value.length > MAX_SNAPSHOT_ARRAY_LENGTH) return false;
    return value.every((item) => isSnapshotStructureSafe(item, depth + 1));
  }
  if (type === "object") {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      if (DANGEROUS_KEYS.has(key)) return false;
      if (!isSnapshotStructureSafe((value as Record<string, unknown>)[key], depth + 1)) return false;
    }
    return true;
  }
  return false; // funzioni/simboli non validi in uno snapshot JSON
}

function validateStep2Payload(body: any): { ok: true; snapshot: Record<string, unknown>; question: string } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "INVALID_PAYLOAD" };

  const { snapshot, question } = body;

  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return { ok: false, error: "INVALID_SNAPSHOT" };
  }
  let snapshotJson: string;
  try {
    snapshotJson = JSON.stringify(snapshot);
  } catch {
    return { ok: false, error: "INVALID_SNAPSHOT" };
  }
  if (snapshotJson.length > MAX_SNAPSHOT_JSON_LENGTH) {
    return { ok: false, error: "SNAPSHOT_TOO_LARGE" };
  }
  if (!isSnapshotStructureSafe(snapshot)) {
    return { ok: false, error: "INVALID_SNAPSHOT_STRUCTURE" };
  }

  if (typeof question !== "string") return { ok: false, error: "INVALID_QUESTION" };
  const trimmedQuestion = question.trim();
  if (!trimmedQuestion || trimmedQuestion.length > MAX_QUESTION_LENGTH) {
    return { ok: false, error: "INVALID_QUESTION" };
  }

  return { ok: true, snapshot, question: trimmedQuestion };
}

// ── Prompt territoriale — identico a quello di ai-assistant-territory ──────
// Duplicato volutamente (non importato dalla vecchia function): ogni Edge
// Function Supabase e' un deploy isolato, ai-assistant-territory resta
// autonoma e invariata per il rollback, quindi non deve dipendere da ai-core
// ne' viceversa.
function buildSystemPrompt() {
  return [
    "Sei un Assistente Territoriale esperto per l'app VolantiniPro. Rispondi alle domande dell'utente usando SOLO i dati forniti nel payload JSON.",
    "NON INVENTARE MAI NUMERI. Se un dato non e' presente nei dati forniti, rispondi esplicitamente: 'Dato non disponibile'.",
    "I dati che ricevi riguardano un'analisi territoriale (Step 2) o di campagna.",
    "Spiega in modo semplice e diretto, usando un tono professionale ma amichevole.",
    "Non usare markdown complesso, usa solo paragrafi normali.",
    "La risposta deve essere contenuta in un campo testuale semplice e restituito come JSON valido nel formato: {\"answer\": \"tua risposta\"}.",
  ].join(" ");
}

function buildUserPrompt(snapshot: Record<string, unknown>, question: string) {
  return `Ecco i dati reali dello snapshot territoriale:\n${JSON.stringify(snapshot, null, 2)}\n\nDomanda dell'utente: "${question}"`;
}

async function callOpenAi(snapshot: Record<string, unknown>, question: string, warnings: string[]) {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    warnings.push("OPENAI_NOT_CONFIGURED");
    return null;
  }

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: buildSystemPrompt() },
          { role: "user", content: buildUserPrompt(snapshot, question) },
        ],
      }),
    });

    if (!res.ok) throw new Error(`OPENAI_${res.status}`);
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error("OPENAI_EMPTY_RESPONSE");

    const parsed = JSON.parse(content);
    const answer = typeof parsed.answer === "string" ? parsed.answer.trim() : "";
    if (!answer) throw new Error("OPENAI_EMPTY_ANSWER");

    return answer;
  } catch (error) {
    warnings.push(`OPENAI_CALL_FAILED:${error instanceof Error ? error.message : "unknown"}`);
    return null;
  }
}

async function callAdminOpenAi(snapshot: Record<string, unknown>, question: string, warnings: string[]) {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    warnings.push("OPENAI_NOT_CONFIGURED");
    return null;
  }
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: buildAdminSystemPrompt() },
          { role: "user", content: buildAdminUserPrompt(snapshot, question) },
        ],
      }),
    });
    if (!res.ok) throw new Error(`OPENAI_${res.status}`);
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error("OPENAI_EMPTY_RESPONSE");
    const parsed = JSON.parse(content);
    if (!validateAdminAiResult(parsed)) throw new Error("OPENAI_INVALID_ADMIN_RESPONSE");
    if (!numbersAreGrounded(parsed, snapshot)) throw new Error("OPENAI_UNGROUNDED_NUMBER");
    return parsed;
  } catch (error) {
    warnings.push(`OPENAI_CALL_FAILED:${error instanceof Error ? error.message : "unknown"}`);
    return null;
  }
}

async function callTerritorialReportOpenAi(snapshot: Record<string, unknown>, question: string, warnings: string[]) {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    warnings.push("OPENAI_NOT_CONFIGURED");
    return null;
  }
  try {
    const allowedSources = Array.isArray(snapshot.sources) ? snapshot.sources.filter((source): source is string => typeof source === "string") : [];
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: buildTerritorialReportSystemPrompt(allowedSources) },
          { role: "user", content: buildTerritorialReportUserPrompt(snapshot, question) },
        ],
      }),
    });
    if (!res.ok) throw new Error(`OPENAI_${res.status}`);
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error("OPENAI_EMPTY_RESPONSE");
    const parsed = JSON.parse(content);
    if (!validateTerritorialReportAiResult(parsed, snapshot)) throw new Error("OPENAI_INVALID_TERRITORIAL_REPORT");
    if (!territorialReportNumbersAreGrounded(parsed, snapshot)) throw new Error("OPENAI_UNGROUNDED_NUMBER");
    return parsed;
  } catch (error) {
    warnings.push(`OPENAI_CALL_FAILED:${error instanceof Error ? error.message : "unknown"}`);
    return null;
  }
}

// ── Branch step2 — porting 1:1 di ai-assistant-territory, identita' opzionale ──
// contextType=step2 e' "public safe context": nessun dato cliente, nessuna
// query su campaigns/profiles, nessun uso di un user_id ricevuto dal body
// (l'unica identita' possibile e' quella verificata da getAuthedUser, mai
// quella del payload). `user` puo' essere null: in quel caso la richiesta
// procede comunque, solo senza cache.
async function handleStep2(user: { id: string } | null, body: any) {
  const validation = validateStep2Payload(body);
  if (!validation.ok) {
    return json({ answer: null, status: "error", error: validation.error }, 400);
  }
  const { snapshot, question } = validation;

  // ai_territorial_chat_cache.user_id e' pensata per "solo le proprie righe"
  // (RLS + design): per una richiesta anonima non si inventa un'identita' ne'
  // si scrive user_id nullo per forzare la cache. Nessuna migration in questa
  // fase: gli anonimi semplicemente saltano la cache e richiamano OpenAI ad
  // ogni domanda.
  if (!user) {
    const warnings: string[] = [];
    const aiResult = await callOpenAi(snapshot, question, warnings);
    if (!aiResult) return json({ answer: null, status: "fallback", warnings });
    return json({ answer: aiResult, status: "ai" });
  }

  const supabase = supabaseAdmin();
  // Stesso hash-cache di ai-assistant-territory, con contextType incluso
  // nell'hash: stessa tabella (ai_territorial_chat_cache, nessuna migrazione
  // richiesta in Fase 1), ma una domanda identica su un contextType diverso
  // produce comunque un hash diverso e non collide mai con la cache esistente.
  const payloadHash = await hashPayload({ contextType: "step2", snapshot, question });

  if (supabase) {
    const { data: cached } = await supabase
      .from("ai_territorial_chat_cache")
      .select("answer")
      .eq("payload_hash", payloadHash)
      .eq("user_id", user.id)
      .maybeSingle();

    if (cached?.answer) {
      return json({ answer: cached.answer, status: "ai" });
    }
  }

  const warnings: string[] = [];
  // L'AI riceve solo lo snapshot gia' calcolato dai sistemi deterministici
  // (famiglie, copertura, quantita', raggio, comuni...): non li ricalcola,
  // non li modifica, li interpreta soltanto. Se un dato manca nello snapshot
  // il prompt impone esplicitamente "Dato non disponibile", mai un numero
  // inventato.
  const aiResult = await callOpenAi(snapshot, question, warnings);

  if (!aiResult) {
    return json({ answer: null, status: "fallback", warnings });
  }

  if (supabase) {
    const { error: insertError } = await supabase.from("ai_territorial_chat_cache").insert({
      user_id: user.id,
      payload_hash: payloadHash,
      question,
      answer: aiResult,
    });
    if (insertError) console.error("[ai-core:step2] CACHE_INSERT_FAILED", insertError.message);
  }

  return json({ answer: aiResult, status: "ai" });
}

async function handleAdminDashboard(user: { id: string } | null, body: any) {
  if (!user) return json({ answer: null, status: "error", error: "AUTHENTICATION_REQUIRED" }, 401);

  const supabase = supabaseAdmin();
  if (!supabase) return json({ answer: null, status: "error", error: "AUTH_SERVICE_UNAVAILABLE" }, 500);
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) return json({ answer: null, status: "error", error: "AUTH_CHECK_FAILED" }, 500);
  if (!isAdminProfile(profile)) return json({ answer: null, status: "error", error: "FORBIDDEN" }, 403);

  const validation = validateStep2Payload(body);
  if (!validation.ok) return json({ answer: null, status: "error", error: validation.error }, 400);
  const { snapshot, question } = validation;
  if (!validateAdminSnapshot(snapshot)) return json({ answer: null, status: "error", error: "INVALID_ADMIN_SNAPSHOT" }, 400);

  const deterministic = deterministicAdminResponse(snapshot, question);
  if (deterministic) return json({ ...deterministic, status: "deterministic" });

  const payloadHash = await hashPayload({ verifiedAdminId: user.id, contextType: "admin_dashboard", snapshot, question });
  const { data: cached } = await supabase
    .from("ai_territorial_chat_cache")
    .select("answer")
    .eq("payload_hash", payloadHash)
    .eq("user_id", user.id)
    .maybeSingle();
  if (cached?.answer) {
    try {
      const parsed = JSON.parse(cached.answer);
      if (validateAdminAiResult(parsed) && numbersAreGrounded(parsed, snapshot)) return json({ ...parsed, status: "ai", cached: true });
    } catch { /* cache legacy/non strutturata: ignorata */ }
  }

  const warnings: string[] = [];
  const aiResult = await callAdminOpenAi(snapshot, question, warnings);
  if (!aiResult) return json({ answer: null, summary: null, priorities: [], warnings, sources: [], status: "fallback" });

  const { error: insertError } = await supabase.from("ai_territorial_chat_cache").insert({
    user_id: user.id,
    payload_hash: payloadHash,
    question,
    answer: JSON.stringify(aiResult),
  });
  if (insertError && insertError.code !== "23505") console.error("[ai-core:admin_dashboard] CACHE_INSERT_FAILED", insertError.message);
  return json({ ...aiResult, status: "ai", cached: false });
}

async function handleTerritorialReport(user: { id: string } | null, body: any) {
  const validation = validateStep2Payload(body);
  if (!validation.ok) return json({ status: "error", error: validation.error }, 400);
  const { snapshot, question } = validation;
  if (!validateTerritorialReportSnapshot(snapshot)) return json({ status: "error", error: "INVALID_TERRITORIAL_REPORT_SNAPSHOT" }, 400);

  const deterministic = deterministicTerritorialReportResponse(snapshot, question);
  if (deterministic) return json({ ...deterministic, status: "deterministic" });

  // Come Step2, il report e' gia' parte del funnel pubblico: anonimo ammesso
  // senza cache. Solo un JWT verificato abilita la cache tecnica per utente.
  if (!user) {
    const warnings: string[] = [];
    const result = await callTerritorialReportOpenAi(snapshot, question, warnings);
    if (!result) return json({ status: "error", error: "AI_ANALYSIS_UNAVAILABLE", warnings }, 503);
    return json({ ...result, status: "ai", cached: false });
  }

  const supabase = supabaseAdmin();
  const payloadHash = await hashPayload({ contextType: "territorial_report", snapshot, question });
  if (supabase) {
    const { data: cached } = await supabase
      .from("ai_territorial_chat_cache")
      .select("answer")
      .eq("payload_hash", payloadHash)
      .eq("user_id", user.id)
      .maybeSingle();
    if (cached?.answer) {
      try {
        const parsed = JSON.parse(cached.answer);
        if (validateTerritorialReportAiResult(parsed, snapshot) && territorialReportNumbersAreGrounded(parsed, snapshot)) {
          return json({ ...parsed, status: "ai", cached: true });
        }
      } catch { /* cache legacy/non strutturata: ignorata */ }
    }
  }

  const warnings: string[] = [];
  const result = await callTerritorialReportOpenAi(snapshot, question, warnings);
  if (!result) return json({ status: "error", error: "AI_ANALYSIS_UNAVAILABLE", warnings }, 503);
  if (supabase) {
    const { error: insertError } = await supabase.from("ai_territorial_chat_cache").insert({
      user_id: user.id,
      payload_hash: payloadHash,
      question,
      answer: JSON.stringify(result),
    });
    if (insertError && insertError.code !== "23505") console.error("[ai-core:territorial_report] CACHE_INSERT_FAILED", insertError.message);
  }
  return json({ ...result, status: "ai", cached: false });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ answer: null, status: "error", error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const body = await req.json().catch(() => null);
    const contextType = body?.contextType;

    if (!isKnownContextType(contextType)) {
      return json({ answer: null, status: "error", error: "INVALID_CONTEXT_TYPE" }, 400);
    }
    if (!isImplementedContextType(contextType)) {
      return json({ answer: null, status: "error", error: "CONTEXT_TYPE_NOT_IMPLEMENTED" }, 501);
    }

    // Identita' risolta una sola volta, sempre in modo opzionale a questo
    // livello: e' il singolo branch contextType a decidere se e' obbligatoria.
    // Step2 e territorial_report accettano user===null; admin_dashboard
    // respinge l'anonimo e verifica il ruolo nel proprio handler.
    const user = await getAuthedUser(req);

    if (contextType === "step2") return await handleStep2(user, body);
    if (contextType === "admin_dashboard") return await handleAdminDashboard(user, body);
    if (contextType === "territorial_report") return await handleTerritorialReport(user, body);
    return json({ answer: null, status: "error", error: "CONTEXT_TYPE_NOT_IMPLEMENTED" }, 501);
  } catch (error) {
    return json(
      { answer: null, status: "error", error: error instanceof Error ? error.message : "UNKNOWN_ERROR" },
      500
    );
  }
});
