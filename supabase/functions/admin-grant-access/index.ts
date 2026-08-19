// admin-grant-access — conferma admin di una campagna e abilita l'accesso
// cliente: trova/crea l'utente Auth, collega profilo e campagna, invia un
// Magic Link reale verso /dashboard.
//
// Il pagamento (metadata.payment_status + status: pending_review/draft ->
// approved) e' gestito da confirmCampaignPayment() in
// src/lib/supabaseClient.js, chiamata dal frontend PRIMA di questa function
// (stesso handler in AdminDashboard.jsx): questa function non tocca mai i
// campi di pagamento, solo grant/utente/magic link.
//
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

// L'utente chiamante non e' mai fidato dal body: solo il JWT verificato
// contro Supabase Auth. Ruolo riletto da profiles.role server-side subito
// dopo, mai dal body/frontend.
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

// Campagne su cui e' legittimo concedere accesso: pending_review (grant
// chiamato senza passare da confirmCampaignPayment) o approved (percorso
// normale, dopo la conferma pagamento). Qualunque altro status reale
// osservato (draft, in_progress, ...) e' rifiutato con 409 — tranne quando
// l'accesso e' gia' stato concesso in passato (vedi idempotenza sotto), dove
// lo status puo' essere legittimamente avanzato oltre "approved".
const GRANTABLE_STATUSES = new Set(["pending_review", "approved"]);

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Cerca un utente Auth per email con paginazione limitata: la SDK non offre
// un filtro email diretto in questa versione. Il tetto (10 pagine da 200,
// 2000 utenti) evita un loop indefinito restando ampiamente sufficiente per
// il volume attuale della piattaforma.
async function findAuthUserByEmail(supabase: any, email: string) {
  const normalized = email.trim().toLowerCase();
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const users = data?.users || [];
    const match = users.find((u: any) => String(u.email || "").toLowerCase() === normalized);
    if (match) return match;
    if (users.length < 200) break; // ultima pagina raggiunta
  }
  return null;
}

// Stesso pattern gia' in uso in ensureCurrentClient() (src/lib/supabaseClient.js):
// SELECT poi INSERT/PATCH esplicito, mai un upsert cieco. Un upsert su un
// profilo esistente scriverebbe anche `role`, rischiando di sovrascrivere un
// ruolo diverso da "client" gia' assegnato; qui il ruolo si scrive SOLO alla
// creazione, mai in un aggiornamento successivo.
async function ensureClientProfile(supabase: any, userId: string, safeColumns: Record<string, unknown>) {
  const { data: existing, error: selectErr } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (selectErr) throw selectErr;

  if (existing) {
    const { error: updateErr } = await supabase
      .from("profiles")
      .update({ ...safeColumns, updated_at: new Date().toISOString() })
      .eq("id", userId);
    if (updateErr) throw updateErr;
    return;
  }

  const { error: insertErr } = await supabase
    .from("profiles")
    .insert({ id: userId, role: "client", ...safeColumns });
  if (insertErr) throw insertErr;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

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
      console.error("[admin-grant-access] PROFILE_LOOKUP_FAILED", profileError.message);
      return json({ error: "AUTHORIZATION_CHECK_FAILED" }, 500);
    }
    if (!profile || profile.role !== "admin") {
      return json({ error: "FORBIDDEN" }, 403);
    }

    const body = await req.json().catch(() => null);
    const campaignId = body?.campaignId;
    if (!campaignId || typeof campaignId !== "string") {
      return json({ error: "INVALID_CAMPAIGN_ID" }, 400);
    }

    const { data: campaign, error: campErr } = await supabase
      .from("campaigns")
      .select("id, user_id, status, client_email, client_name, client_phone, metadata")
      .eq("id", campaignId)
      .maybeSingle();
    if (campErr) {
      console.error("[admin-grant-access] CAMPAIGN_LOOKUP_FAILED", campErr.message);
      return json({ error: "CAMPAIGN_LOOKUP_FAILED" }, 500);
    }
    if (!campaign) {
      return json({ error: "CAMPAIGN_NOT_FOUND" }, 404);
    }

    // Idempotenza: se la campagna ha gia' un utente collegato, l'accesso e'
    // gia' stato concesso in una chiamata precedente. Nessun secondo utente,
    // nessun secondo magic link, nessuna riscrittura: ritorno controllato.
    if (campaign.user_id) {
      return json({ success: true, already_granted: true, userId: campaign.user_id }, 200);
    }

    if (!GRANTABLE_STATUSES.has(campaign.status)) {
      return json({ error: "CAMPAIGN_STATUS_INCOMPATIBLE", status: campaign.status }, 409);
    }

    const clientEmail = typeof campaign.client_email === "string" ? campaign.client_email.trim() : "";
    if (!clientEmail || !EMAIL_REGEX.test(clientEmail)) {
      return json({ error: "INVALID_CLIENT_EMAIL" }, 400);
    }
    const clientName = campaign.client_name || null;
    const clientPhone = campaign.client_phone || null;
    const companyName = campaign.metadata?.company_name || null;

    // 1. Trova o crea l'utente Auth (mai duplicato: cerca per email prima di creare).
    let targetUser = await findAuthUserByEmail(supabase, clientEmail);
    if (!targetUser) {
      const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
        email: clientEmail,
        email_confirm: true,
        user_metadata: { nome: clientName, telefono: clientPhone, company: companyName },
      });
      if (createErr) throw createErr;
      targetUser = newUser.user;
    }
    const targetUserId = targetUser.id;

    // 2. Profilo cliente — colonne reali (profiles: id, full_name, phone,
    // company_name, role, created_at, updated_at — NESSUNA colonna email).
    await ensureClientProfile(supabase, targetUserId, {
      full_name: clientName,
      phone: clientPhone,
      company_name: companyName,
    });

    // 3. Collega la campagna all'utente.
    const { error: assignErr } = await supabase
      .from("campaigns")
      .update({ user_id: targetUserId, updated_at: new Date().toISOString() })
      .eq("id", campaignId);
    if (assignErr) throw assignErr;

    // 4. Magic Link reale verso /dashboard (mai verso Step4: il router forza
    // sempre la pagina di login quando l'hash contiene access_token,
    // indipendentemente dal path, poi redirige a /dashboard — vedi
    // src/app/routeResolution.js e volantinipro-final.jsx/LoginPage).
    const siteUrl = Deno.env.get("SITE_URL") || "https://app.volantinipro.it";
    const { error: otpErr } = await supabase.auth.signInWithOtp({
      email: clientEmail,
      options: { emailRedirectTo: `${siteUrl}/dashboard` },
    });
    if (otpErr) throw otpErr;

    return json({ success: true, already_granted: false, userId: targetUserId }, 200);
  } catch (err) {
    console.error("[admin-grant-access] UNHANDLED_ERROR", err instanceof Error ? err.message : err);
    return json({ error: err instanceof Error ? err.message : "UNKNOWN_ERROR" }, 500);
  }
});
