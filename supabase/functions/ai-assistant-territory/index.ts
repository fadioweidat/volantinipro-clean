// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.4";

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

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ answer: null, status: "error", error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const user = await getAuthedUser(req);
    if (!user) return json({ answer: null, status: "error", error: "UNAUTHENTICATED" }, 401);

    const body = await req.json().catch(() => null);
    const snapshot = body?.snapshot;
    const question = body?.question;
    
    if (!snapshot || typeof snapshot !== "object" || !question || typeof question !== "string") {
      return json({ answer: null, status: "error", error: "INVALID_PAYLOAD" }, 400);
    }

    const supabase = supabaseAdmin();
    // Use the snapshot and question to form a unique cache key
    const payloadHash = await hashPayload({ snapshot, question });

    if (supabase) {
      const { data: cached } = await supabase
        .from("ai_territorial_chat_cache")
        .select("answer")
        .eq("payload_hash", payloadHash)
        .eq("user_id", user.id)
        .maybeSingle();
        
      if (cached?.answer) {
        return json({ answer: cached.answer, status: "ai_cached" });
      }
    }

    const warnings: string[] = [];
    const aiResult = await callOpenAi(snapshot, question, warnings);
    
    if (!aiResult) {
      return json({ answer: null, status: "error", warnings });
    }

    if (supabase) {
      const { error: insertError } = await supabase.from("ai_territorial_chat_cache").insert({
        user_id: user.id,
        payload_hash: payloadHash,
        question: question,
        answer: aiResult,
      });
      if (insertError) console.error("[ai-assistant-territory] CACHE_INSERT_FAILED", insertError.message);
    }

    return json({ answer: aiResult, status: "ai" });
  } catch (error) {
    return json(
      { answer: null, status: "error", error: error instanceof Error ? error.message : "UNKNOWN_ERROR" },
      500
    );
  }
});
