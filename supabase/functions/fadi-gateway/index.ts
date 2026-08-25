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

function isAuthenticated(req: Request): boolean {
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  const secret = Deno.env.get("FADI_ONE_SECRET");

  if (!secret) {
    console.error("[fadi-gateway] FADI_ONE_SECRET non configurato.");
    return false;
  }

  return token === secret;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // 1. Metodo permesso solo POST
  if (req.method !== "POST") {
    return json({ status: "error", error: "METHOD_NOT_ALLOWED" }, 405);
  }

  // 2. Autenticazione Forte Server-Side
  if (!isAuthenticated(req)) {
    console.warn(`[fadi-gateway] Accesso negato IP: ${req.headers.get("x-forwarded-for") || "unknown"}`);
    return json({ status: "error", error: "UNAUTHORIZED" }, 401);
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return json({ status: "error", error: "INVALID_PAYLOAD" }, 400);
    }

    const { action, params } = body;

    const supabase = supabaseAdmin();
    if (!supabase) {
      return json({ status: "error", error: "INTERNAL_SERVER_ERROR" }, 500);
    }

    console.log(`[fadi-gateway] Audit: Richiesta azione '${action}' ricevuta.`);

    // 3. Routing (Allowlist Azioni)
    switch (action) {
      case "health": {
        return json({ status: "ok", message: "Fadi Gateway VP-1 is healthy and running in READ_ONLY mode." });
      }

      case "get_active_campaigns": {
        // Estraiamo campagne (minimizzando i dati esposti: es. omettiamo email se non necessario)
        const { data, error } = await supabase
          .from("campaigns")
          .select("id, status, quantity, service_type, created_at, start_date, end_date, distribution_mode")
          .in("status", ["pending", "active", "in_progress", "completed"])
          .order("created_at", { ascending: false })
          .limit(50);

        if (error) throw error;
        return json({ status: "ok", data });
      }

      case "get_driver_assignments": {
        const { data, error } = await supabase
          .from("operator_assignments")
          .select("id, status, created_at, starts_at, ends_at, campaign_id")
          .order("created_at", { ascending: false })
          .limit(50);

        if (error) throw error;
        return json({ status: "ok", data });
      }

      case "get_recent_quotes": {
        const { data, error } = await supabase
          .from("quotes")
          .select("id, campaign_id, total_amount, is_active, created_at")
          .order("created_at", { ascending: false })
          .limit(50);

        if (error) throw error;
        return json({ status: "ok", data });
      }

      case "get_operational_anomalies": {
        // Cerchiamo campagne attive senza driver assegnati come anomalia
        const { data: campaigns, error: campErr } = await supabase
          .from("campaigns")
          .select("id, status, quantity")
          .eq("status", "active");

        if (campErr) throw campErr;

        const { data: assignments, error: assErr } = await supabase
          .from("operator_assignments")
          .select("campaign_id")
          .in("status", ["active", "pending"]);

        if (assErr) throw assErr;

        const activeAssignedCampaigns = new Set(assignments.map((a: any) => a.campaign_id));
        const unassignedActiveCampaigns = campaigns.filter((c: any) => !activeAssignedCampaigns.has(c.id));

        return json({
          status: "ok",
          data: {
            unassigned_active_campaigns: unassignedActiveCampaigns
          }
        });
      }

      default: {
        console.warn(`[fadi-gateway] Azione non permessa richiesta: '${action}'`);
        return json({ status: "error", error: "ACTION_NOT_ALLOWED" }, 403);
      }
    }
  } catch (error) {
    console.error("[fadi-gateway] ERRORE INTERNO:", error);
    return json({ status: "error", error: "INTERNAL_SERVER_ERROR" }, 500);
  }
});
