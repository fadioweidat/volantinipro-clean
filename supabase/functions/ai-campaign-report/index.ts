// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.4";
import { canAccessCampaign } from "../_shared/aiAuthorization.ts";

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

function buildSystemPrompt() {
  return [
    "Sei l'AI ufficiale di VolantiniPro, esperto in reportistica di campagne di volantinaggio.",
    "Analizza i dati finali della campagna forniti nel payload JSON.",
    "NON INVENTARE MAI NUMERI O DATI non presenti.",
    "Genera due campi: 'summary' (un riepilogo in prosa di 4-5 frasi sulla riuscita della campagna, menzionando copertura GPS, quantità, budget e zone) e 'suggestions' (un array di 2 o 3 frasi brevi, ad esempio: 'Aumentare il raggio nella zona X', 'Le tempistiche sono state ottimali').",
    "Restituisci ESCLUSIVAMENTE un JSON valido nel formato: {\"summary\": \"testo\", \"suggestions\": [\"suggerimento 1\", \"suggerimento 2\"]}.",
  ].join(" ");
}

function buildUserPrompt(campaignData: Record<string, unknown>) {
  return `Ecco i dati reali e finali della campagna per la generazione del report:\n${JSON.stringify(campaignData, null, 2)}`;
}

async function callOpenAi(campaignData: Record<string, unknown>, warnings: string[]) {
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
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: buildSystemPrompt() },
          { role: "user", content: buildUserPrompt(campaignData) },
        ],
      }),
    });
    
    if (!res.ok) throw new Error(`OPENAI_${res.status}`);
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error("OPENAI_EMPTY_RESPONSE");
    
    const parsed = JSON.parse(content);
    return {
      summary: typeof parsed.summary === "string" ? parsed.summary.trim() : "",
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.filter((s: any) => typeof s === "string") : []
    };
  } catch (error) {
    warnings.push(`OPENAI_CALL_FAILED:${error instanceof Error ? error.message : "unknown"}`);
    return null;
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ summary: null, suggestions: [], status: "error", error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const user = await getAuthedUser(req);
    if (!user) return json({ summary: null, suggestions: [], status: "error", error: "UNAUTHENTICATED" }, 401);

    const body = await req.json().catch(() => null);
    const campaignId = body?.campaignId;
    
    if (!campaignId || typeof campaignId !== "string") {
      return json({ summary: null, suggestions: [], status: "error", error: "INVALID_PAYLOAD" }, 400);
    }

    const supabase = supabaseAdmin();
    if (!supabase) {
      return json({ summary: null, suggestions: [], status: "error", error: "SERVER_AUTH_NOT_CONFIGURED" }, 500);
    }

    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", campaignId)
      .maybeSingle();

    if (campaignError) {
      console.error("[ai-campaign-report] CAMPAIGN_LOOKUP_FAILED", campaignError.message);
      return json({ summary: null, suggestions: [], status: "error", error: "CAMPAIGN_LOOKUP_FAILED" }, 500);
    }
    if (!campaign) {
      return json({ summary: null, suggestions: [], status: "error", error: "CAMPAIGN_NOT_FOUND" }, 404);
    }

    let profile = null;
    if (campaign.user_id !== user.id) {
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      if (profileError) {
        console.error("[ai-campaign-report] PROFILE_LOOKUP_FAILED", profileError.message);
        return json({ summary: null, suggestions: [], status: "error", error: "AUTHORIZATION_CHECK_FAILED" }, 500);
      }
      profile = profileData;
    }

    if (!canAccessCampaign(user.id, campaign, profile)) {
      return json({ summary: null, suggestions: [], status: "error", error: "FORBIDDEN" }, 403);
    }

    if (campaign.ai_summary) {
      return json({
        summary: campaign.ai_summary,
        suggestions: Array.isArray(campaign.ai_suggestions) ? campaign.ai_suggestions : [],
        status: "ai_cached"
      });
    }

    const warnings: string[] = [];
    const aiResult = await callOpenAi(campaign, warnings);
    
    if (!aiResult || !aiResult.summary) {
      return json({ summary: null, suggestions: [], status: "error", warnings });
    }

    const { error: updateError } = await supabase
      .from("campaigns")
      .update({
        ai_summary: aiResult.summary,
        ai_suggestions: aiResult.suggestions
      })
      .eq("id", campaignId);

    if (updateError) {
      console.error("[ai-campaign-report] UPDATE_FAILED", updateError.message);
      return json({ summary: null, suggestions: [], status: "error", error: "PERSISTENCE_FAILED" }, 500);
    }

    return json({ summary: aiResult.summary, suggestions: aiResult.suggestions, status: "ai" });
  } catch (error) {
    return json(
      { summary: null, suggestions: [], status: "error", error: error instanceof Error ? error.message : "UNKNOWN_ERROR" },
      500
    );
  }
});
