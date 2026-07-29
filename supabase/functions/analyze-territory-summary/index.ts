// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.4";
import { verifyNumbersAgainstPayload } from "./numericVerification.js";

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

// L'utente non e mai fidato lato client: il suo id viene sempre ricavato
// verificando il JWT ricevuto contro Supabase Auth, mai passato dal body.
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

function buildSystemPrompt(hasScoreComponents: boolean) {
  return [
    "Sei un analista di distribuzione volantini. Ricevi dati territoriali REALI su una zona specifica.",
    "Scrivi una sintesi operativa di 4-6 frasi in italiano professionale ma accessibile, in prosa continua (mai elenchi puntati o numerati).",
    "USA SOLO i numeri presenti nei dati forniti, esattamente come compaiono. Non stimare, non arrotondare oltre il formato fornito, non calcolare somme o differenze, non inventare valori, percentuali o nomi di zone non presenti nei dati.",
    "Non usare mai cifre come marcatori di elenco nel testo (niente '1.', '2)', ecc.): usa connettivi in prosa (inoltre, di conseguenza, infine).",
    "Contenuto della sintesi, in quest'ordine logico ma senza numerarlo nel testo: cosa copre la configurazione attuale; dove si concentra e perche; cosa resta scoperto; UNA sola alternativa concreta basata su un valore gia presente nei dati (ad esempio la quantita consigliata per la copertura completa, oppure un'indicazione sul raggio se il dato lo suggerisce).",
    "Niente promesse di risultati commerciali (mai frasi come 'aumenterai le vendite' o simili): parla esclusivamente di copertura e distribuzione.",
    hasScoreComponents
      ? "Nel campo scoreExplanation elenca in 2-3 frasi brevi i fattori principali (positivi e negativi) che spiegano lo score, usando solo le componenti fornite in score.components."
      : "Il campo scoreExplanation deve restare esattamente null: le componenti dello score non sono disponibili come dati strutturati, quindi non va generata alcuna spiegazione.",
    'Rispondi SOLO con un oggetto JSON valido nella forma esatta: {"summary": "...", "scoreExplanation": "..." oppure null}.',
  ].join(" ");
}

function buildUserPrompt(payload: Record<string, unknown>) {
  return `Dati territoriali della zona analizzata (JSON):\n${JSON.stringify(payload, null, 2)}`;
}

async function callOpenAi(payload: Record<string, unknown>, warnings: string[]) {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    warnings.push("OPENAI_NOT_CONFIGURED");
    return null;
  }
  const score = payload?.score as { components?: unknown[] } | undefined;
  const hasComponents = Array.isArray(score?.components) && (score!.components as unknown[]).length > 0;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: buildSystemPrompt(hasComponents) },
          { role: "user", content: buildUserPrompt(payload) },
        ],
      }),
    });
    if (!res.ok) throw new Error(`OPENAI_${res.status}`);
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error("OPENAI_EMPTY_RESPONSE");
    const parsed = JSON.parse(content);
    const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
    const scoreExplanation = hasComponents && typeof parsed.scoreExplanation === "string"
      ? parsed.scoreExplanation.trim()
      : null;
    if (!summary) throw new Error("OPENAI_EMPTY_SUMMARY");
    return { summary, scoreExplanation };
  } catch (error) {
    warnings.push(`OPENAI_CALL_FAILED:${error instanceof Error ? error.message : "unknown"}`);
    return null;
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ summary: null, scoreExplanation: null, status: "fallback", error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const user = await getAuthedUser(req);
    if (!user) return json({ summary: null, scoreExplanation: null, status: "fallback", error: "UNAUTHENTICATED" }, 401);

    const body = await req.json().catch(() => null);
    const payload = body?.payload;
    if (!payload || typeof payload !== "object") {
      return json({ summary: null, scoreExplanation: null, status: "fallback", error: "INVALID_PAYLOAD" }, 400);
    }

    const supabase = supabaseAdmin();
    const payloadHash = await hashPayload(payload);

    // Rate limiting di base: 1 sola chiamata al modello per configurazione-zona
    // identica. Se il payload (quindi il suo hash) e gia stato analizzato per
    // questo utente, il risultato salvato viene restituito senza richiamare l'AI.
    if (supabase) {
      const { data: cached } = await supabase
        .from("ai_territory_summaries")
        .select("summary, score_explanation")
        .eq("payload_hash", payloadHash)
        .eq("user_id", user.id)
        .maybeSingle();
      if (cached?.summary) {
        return json({ summary: cached.summary, scoreExplanation: cached.score_explanation ?? null, status: "ai" });
      }
    }

    const warnings: string[] = [];
    const aiResult = await callOpenAi(payload, warnings);
    if (!aiResult) {
      return json({ summary: null, scoreExplanation: null, status: "fallback", warnings });
    }

    // Verifica numerica obbligatoria: l'AI interpreta i dati, non li genera mai.
    // Se anche un solo numero nel testo non corrisponde al payload, il testo
    // viene scartato e si torna al fallback statico esistente lato frontend.
    const summaryCheck = verifyNumbersAgainstPayload(aiResult.summary, payload);
    const explanationCheck = aiResult.scoreExplanation
      ? verifyNumbersAgainstPayload(aiResult.scoreExplanation, payload)
      : { valid: true, invalidNumbers: [] as number[] };

    if (!summaryCheck.valid || !explanationCheck.valid) {
      console.error("[analyze-territory-summary] NUMERIC_VERIFICATION_FAILED", {
        userId: user.id,
        payloadHash,
        summaryInvalidNumbers: summaryCheck.invalidNumbers,
        explanationInvalidNumbers: explanationCheck.invalidNumbers,
      });
      return json({ summary: null, scoreExplanation: null, status: "fallback", warnings: ["NUMERIC_VERIFICATION_FAILED"] });
    }

    if (supabase) {
      const { error: insertError } = await supabase.from("ai_territory_summaries").insert({
        user_id: user.id,
        payload_hash: payloadHash,
        summary: aiResult.summary,
        score_explanation: aiResult.scoreExplanation,
      });
      if (insertError) console.error("[analyze-territory-summary] CACHE_INSERT_FAILED", insertError.message);
    }

    return json({ summary: aiResult.summary, scoreExplanation: aiResult.scoreExplanation, status: "ai" });
  } catch (error) {
    return json(
      { summary: null, scoreExplanation: null, status: "fallback", error: error instanceof Error ? error.message : "UNKNOWN_ERROR" },
      500
    );
  }
});
