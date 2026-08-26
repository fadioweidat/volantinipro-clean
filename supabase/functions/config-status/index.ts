// config-status — Admin "Centro Controllo Sito" (Blocco 6 + parte del
// Blocco 8): riporta SOLO booleani ("questa chiave e' impostata sul
// server?") e timestamp di ultimo accesso, MAI il valore dei secret. Questi
// dati vivono solo lato server (Deno.env di questa function, service-role
// per auth.admin.listUsers) e non sono altrimenti verificabili dal
// frontend — nessun secret transita mai in questa risposta.
//
// Stesso pattern di autenticazione/autorizzazione gia' in uso in
// admin-grant-access/index.ts: JWT verificato via client anon, ruolo
// riletto da profiles.role con il client service-role (mai fidato dal
// body/frontend).

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

function boolEnv(...names: string[]) {
  return names.some((name) => Boolean(Deno.env.get(name)));
}

// Trova l'ultimo sign-in tra un insieme di user id (paginazione limitata,
// stesso tetto gia' usato in findAuthUserByEmail di admin-grant-access:
// ampiamente sufficiente per il volume attuale, evita un loop indefinito).
async function findLastSignIn(supabase: any, userIds: Set<string>) {
  if (userIds.size === 0) return null;
  let latest: string | null = null;
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const users = data?.users || [];
    for (const u of users) {
      if (userIds.has(u.id) && u.last_sign_in_at) {
        if (!latest || u.last_sign_in_at > latest) latest = u.last_sign_in_at;
      }
    }
    if (users.length < 200) break;
  }
  return latest;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET" && req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const supabase = supabaseAdmin();
    if (!supabase) return json({ error: "SERVER_AUTH_NOT_CONFIGURED" }, 500);

    const user = await getAuthedUser(req);
    if (!user) return json({ error: "UNAUTHENTICATED" }, 401);

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError) {
      console.error("[config-status] PROFILE_LOOKUP_FAILED", profileError.message);
      return json({ error: "AUTHORIZATION_CHECK_FAILED" }, 500);
    }
    if (!profile || !["admin", "super_admin"].includes(profile.role)) {
      return json({ error: "FORBIDDEN" }, 403);
    }

    const providers = {
      mapbox: boolEnv("MAPBOX_TOKEN", "VITE_MAPBOX_TOKEN"),
      googlePlaces: boolEnv("GOOGLE_PLACES_API_KEY", "GOOGLE_API_KEY"),
      foursquare: boolEnv("FOURSQUARE_API_KEY"),
      resend: boolEnv("RESEND_API_KEY") && boolEnv("RESEND_FROM_EMAIL"),
      openai: boolEnv("OPENAI_API_KEY"),
    };

    // Ultimo login admin / cliente: derivato da profiles.role, mai da un
    // elenco email esposto al frontend — solo due timestamp aggregati.
    let lastAdminSignIn: string | null = null;
    let lastCustomerSignIn: string | null = null;
    try {
      const { data: adminProfiles } = await supabase.from("profiles").select("id").in("role", ["admin", "super_admin"]);
      const { data: clientProfiles } = await supabase.from("profiles").select("id").eq("role", "client");
      const adminIds = new Set((adminProfiles || []).map((p: any) => p.id));
      const clientIds = new Set((clientProfiles || []).map((p: any) => p.id));
      [lastAdminSignIn, lastCustomerSignIn] = await Promise.all([
        findLastSignIn(supabase, adminIds),
        findLastSignIn(supabase, clientIds),
      ]);
    } catch (signInErr: any) {
      console.error("[config-status] LAST_SIGN_IN_LOOKUP_FAILED", signInErr?.message);
      // Non fatale: i booleani provider restano validi anche se questa parte fallisce.
    }

    return json({
      providers,
      lastAdminSignIn,
      lastCustomerSignIn,
      checkedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("[config-status] UNEXPECTED_ERROR", err?.message || err);
    return json({ error: "INTERNAL_ERROR" }, 500);
  }
});
