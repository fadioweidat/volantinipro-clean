// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.4";
import { isAdminProfile } from "../_shared/aiAuthorization.ts";

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
    "Sei l'AI Copilot per la Dashboard Admin di VolantiniPro.",
    "Il tuo scopo è analizzare i dati aggregati in tempo reale (o snapshot periodici) e fornire 2-4 suggerimenti o alert operativi concreti.",
    "NON INVENTARE DATI. Basati unicamente sulle metriche fornite (es. % copertura, km, anomalie GPS, date di fine).",
    "Restituisci ESCLUSIVAMENTE un JSON valido nel formato: {\"alerts\": [{\"type\": \"warning|info|success\", \"message\": \"testo alert\"}]}.",
  ].join(" ");
}

function buildUserPrompt(dashboardData: Record<string, unknown>) {
  return `Ecco i dati operativi aggregati per l'analisi:\n${JSON.stringify(dashboardData, null, 2)}`;
}

async function callOpenAi(dashboardData: Record<string, unknown>, warnings: string[]) {
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
          { role: "user", content: buildUserPrompt(dashboardData) },
        ],
      }),
    });
    
    if (!res.ok) throw new Error(`OPENAI_${res.status}`);
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error("OPENAI_EMPTY_RESPONSE");
    
    const parsed = JSON.parse(content);
    return {
      alerts: Array.isArray(parsed.alerts) ? parsed.alerts : []
    };
  } catch (error) {
    warnings.push(`OPENAI_CALL_FAILED:${error instanceof Error ? error.message : "unknown"}`);
    return null;
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ alerts: [], status: "error", error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const user = await getAuthedUser(req);
    if (!user) return json({ alerts: [], status: "error", error: "UNAUTHENTICATED" }, 401);

    const supabase = supabaseAdmin();
    if (!supabase) {
      return json({ alerts: [], status: "error", error: "SERVER_AUTH_NOT_CONFIGURED" }, 500);
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("[ai-admin-copilot] PROFILE_LOOKUP_FAILED", profileError.message);
      return json({ alerts: [], status: "error", error: "AUTHORIZATION_CHECK_FAILED" }, 500);
    }

    if (!isAdminProfile(profile)) {
      return json({ alerts: [], status: "error", error: "FORBIDDEN" }, 403);
    }

    const body = await req.json().catch(() => null);
    const dashboardData = body?.dashboardData;
    
    if (!dashboardData || typeof dashboardData !== "object") {
      return json({ alerts: [], status: "error", error: "INVALID_PAYLOAD" }, 400);
    }

    const warnings: string[] = [];
    // Potremmo cachare questo con un TTL di 10-15 minuti per evitare troppe chiamate.
    // Ma per ora lo lasciamo in real-time on-demand dal client admin.
    const aiResult = await callOpenAi(dashboardData, warnings);
    
    if (!aiResult) {
      return json({ alerts: [], status: "error", warnings });
    }

    return json({ alerts: aiResult.alerts, status: "ai" });
  } catch (error) {
    return json(
      { alerts: [], status: "error", error: error instanceof Error ? error.message : "UNKNOWN_ERROR" },
      500
    );
  }
});
