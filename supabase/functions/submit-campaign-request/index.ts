import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function resolveAuthenticatedOwnerId(req: Request, supabase: any, clientEmail: string) {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user?.id || !data.user.email) return null;

  const authenticatedEmail = String(data.user.email).trim().toLowerCase();
  return authenticatedEmail === clientEmail.trim().toLowerCase() ? data.user.id : null;
}

// Idempotency: nessun identificatore di richiesta arriva dal client (Step4
// non genera un request id), quindi lo deriviamo qui da tutto cio' che rende
// "la stessa richiesta" tale nel merito — non solo il nome del comune, come
// esplicitamente richiesto: cliente, citta', importo/quantita' dichiarati e
// l'intero elenco comuni+quantita'. Due preventivi realmente diversi (comuni
// o quantita' diversi) producono fingerprint diversi e restano due campagne.
async function computeSubmissionFingerprint(input: {
  clientEmail: string;
  cityName: string | null;
  quantity: number;
  totalAmount: number;
  zones: Array<{ zone_name: string | null; quantity_assigned: number | null }>;
}) {
  const canonicalZones = [...input.zones]
    .filter((z) => z.zone_name)
    .map((z) => `${z.zone_name}:${z.quantity_assigned ?? 0}`)
    .sort()
    .join("|");
  const canonical = [
    input.clientEmail,
    input.cityName || "",
    String(input.quantity),
    String(input.totalAmount),
    canonicalZones,
  ].join("::");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing Supabase env vars");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const body = await req.json();

    // Validazione base
    if (!body.client_email || !body.client_name) {
      return new Response(JSON.stringify({ error: "Email e nome obbligatori" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(body.client_email)) {
      return new Response(JSON.stringify({ error: "Email non valida" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Name/Phone bounding
    const clientName = String(body.client_name).substring(0, 100);
    const clientPhone = body.client_phone ? String(body.client_phone).substring(0, 20) : null;
    const companyName = body.company_name ? String(body.company_name).substring(0, 100) : null;
    const clientEmail = String(body.client_email).trim().toLowerCase();
    const authenticatedOwnerId = await resolveAuthenticatedOwnerId(req, supabase, clientEmail);

    // Numeric bounding
    const quantity = body.total_flyers ?? body.flyer_quantity ?? 0;
    const totalAmount = body.total_budget ?? body.total_amount ?? 0;

    if (isNaN(quantity) || quantity < 0 || quantity > 10000000) {
      return new Response(JSON.stringify({ error: "Quantità non valida" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (isNaN(totalAmount) || totalAmount < 0 || totalAmount > 1000000) {
      return new Response(JSON.stringify({ error: "Prezzo non valido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service enum
    const rawService = body.service_type || body.type;
    const allowedServices = ["d2d", "h2h", "business", "Door to Door", "Hand to Hand", "Business Distribution"];
    const serviceType = allowedServices.includes(rawService) ? rawService : "d2d";

    // Zone strutturate per comune (source of truth reale, non title/city):
    // validate/bound prima di scrivere, mai il body arbitrario cosi' com'e'.
    // metadata.campaign_zones resta come snapshot leggibile (retrocompatibile
    // con i consumer esistenti del JSON), ma la vera lettura per
    // Customer/Admin/AssignWork avviene dalla tabella campaign_zones sotto.
    const rawZones = Array.isArray(body.campaignZones) ? body.campaignZones.slice(0, 100) : [];
    const zoneValidationErrors: string[] = [];
    const validatedZones = rawZones
      .map((z: any, idx: number) => {
        const zoneName = typeof z?.municipality === "string" ? z.municipality.trim().substring(0, 200) : "";
        const quantityAssigned = Number(z?.quantity);
        const priorityRaw = Number(z?.priority);
        if (!zoneName) { zoneValidationErrors.push(`zona #${idx + 1}: nome comune mancante`); return null; }
        if (!Number.isFinite(quantityAssigned) || quantityAssigned <= 0) { zoneValidationErrors.push(`zona #${idx + 1} (${zoneName}): quantita' non valida (${z?.quantity})`); return null; }
        return {
          zone_name: zoneName,
          quantity_assigned: Math.round(quantityAssigned),
          priority: Number.isFinite(priorityRaw) && priorityRaw >= 0 ? Math.round(priorityRaw) : idx + 1,
          // campaign_zones.center_lat/center_lng sono NOT NULL nello schema
          // reale (confermato via OpenAPI PostgREST: entrambe in "required",
          // nessun default) — NULL non e' un'opzione disponibile qui, quindi
          // non lo forziamo: 0/0 resta un placeholder esplicito e mai una
          // coordinata plausibile-ma-sbagliata quando lat/lng non arrivano
          // dal client (nessun geocoding per singolo comune in questo scope).
          center_lat: Number.isFinite(Number(z?.lat)) ? Number(z.lat) : 0,
          center_lng: Number.isFinite(Number(z?.lng)) ? Number(z.lng) : 0,
        };
      })
      .filter((z): z is NonNullable<typeof z> => z !== null);

    // Se il client ha dichiarato zone strutturate ma nessuna e' risultata
    // valida, la richiesta e' malformata: meglio rifiutarla esplicitamente
    // ora che creare una campagna "fantasma" senza zone utilizzabili.
    if (rawZones.length > 0 && validatedZones.length === 0) {
      return new Response(JSON.stringify({ error: "Nessuna zona valida nella richiesta", details: zoneValidationErrors }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cityName = body.city_name || null;
    const fingerprint = await computeSubmissionFingerprint({
      clientEmail,
      cityName,
      quantity,
      totalAmount,
      zones: validatedZones,
    });

    // Idempotenza sulla richiesta reale (non solo sul nome comune): se lo
    // stesso cliente ha gia' inviato esattamente la stessa combinazione
    // citta'/quantita'/importo/zone negli ultimi 10 minuti, e' un retry
    // (doppio click, timeout di rete) — restituiamo la campagna gia' creata
    // invece di duplicarla. Una richiesta realmente diversa (altri comuni o
    // altre quantita') produce un fingerprint diverso e resta una nuova riga.
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: existingByFingerprint } = await supabase
      .from("campaigns")
      .select("*, campaign_zones(*)")
      .eq("client_email", clientEmail)
      .eq("metadata->>submission_fingerprint", fingerprint)
      .gte("created_at", tenMinutesAgo)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingByFingerprint) {
      return new Response(JSON.stringify({
        success: true,
        campaign: existingByFingerprint,
        zonesCreated: (existingByFingerprint.campaign_zones || []).length,
        zonesError: null,
        idempotent: true,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const metadata = {
      ...(body.metadata || {}),
      campaign_zones: rawZones,
      payment_status: "in_attesa_pagamento",
      company_name: companyName,
      is_public_request: true,
      submission_fingerprint: fingerprint,
    };

    // Inseriamo in campaigns con status pending_review
    const { data: campaign, error } = await supabase
      .from("campaigns")
      .insert([
        {
          user_id: authenticatedOwnerId,
          title: body.title || `Campagna Preventivo (${clientName})`,
          service_type: serviceType,
          status: "pending_review",
          source: "quote_requests",
          city: cityName,
          zone_name: cityName,
          quantity: quantity,
          total_amount: totalAmount,
          start_date: body.start_date || body.startDate || null,
          end_date: body.end_date || body.endDate || null,
          client_name: clientName,
          client_phone: clientPhone,
          client_email: clientEmail,
          metadata,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (error) {
      console.error("Errore inserimento in campaigns:", error);
      return new Response(JSON.stringify({ error: "Errore salvataggio campagna" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Materializza campaign_zones: root cause del bug "comuni non visibili"
    // era proprio qui — le zone arrivavano solo dentro metadata (JSON), mai
    // come righe reali nella tabella che Customer/Admin/AssignWork leggono
    // davvero (campaign_zones(*) via embed). A differenza della versione
    // precedente, un fallimento qui NON viene piu' inghiottito: se il client
    // aveva dichiarato zone valide e l'insert fallisce, la campagna appena
    // creata viene rimossa (supabase-js non espone transazioni multi-tabella
    // qui: questa e' la compensazione esplicita richiesta quando una vera
    // transazione/RPC non e' nello scope attuale) e la richiesta fallisce con
    // un errore reale, mai un "success:true" con zero zone.
    if (validatedZones.length > 0) {
      const { error: zonesInsertError } = await supabase
        .from("campaign_zones")
        .insert(validatedZones.map((z) => ({ ...z, campaign_id: campaign.id })));
      if (zonesInsertError) {
        console.error("Errore inserimento in campaign_zones, rollback campagna:", zonesInsertError);
        await supabase.from("campaigns").delete().eq("id", campaign.id);
        return new Response(JSON.stringify({ error: "Impossibile creare le zone della campagna.", details: zonesInsertError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({ success: true, campaign, zonesCreated: validatedZones.length, zonesError: null }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Function error:", err);
    return new Response(JSON.stringify({ error: err?.message || String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
