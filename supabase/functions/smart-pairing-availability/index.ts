import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});
const DAY_MS = 86_400_000;
const PAIRING_OFFSETS = new Set([5, 6, 7, 12, 13, 14]);
const DAILY_CAPACITY = 4;

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function clean(value: unknown) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const rad = (value: number) => value * Math.PI / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return json({ error: "SMART_PAIRING_BACKEND_NOT_CONFIGURED" }, 503);
    const body = await req.json().catch(() => ({}));
    const service = ["d2d", "h2h", "b2b"].includes(String(body.service)) ? String(body.service) : null;
    const zone = clean(body.zone);
    if (!service || !zone) return json({ error: "INVALID_SMART_PAIRING_CONTEXT" }, 400);

    const requestedStart = /^\d{4}-\d{2}-\d{2}$/.test(String(body.startDate || "")) ? String(body.startDate) : isoDate(new Date());
    const today = isoDate(new Date());
    const start = new Date(`${requestedStart < today ? today : requestedStart}T00:00:00Z`);
    const end = new Date(start.getTime() + 89 * DAY_MS);
    const client = createClient(url, key, { auth: { persistSession: false } });
    const { data: campaigns, error } = await client.from("campaigns")
      .select("service_type,status,city,zone_name,lat,lng,start_date,end_date")
      .in("status", ["approved", "scheduled", "in_progress"])
      .lte("start_date", isoDate(end))
      .gte("end_date", isoDate(start));
    if (error) return json({ error: "SMART_PAIRING_DATA_UNAVAILABLE" }, 503);

    const rows = Array.isArray(campaigns) ? campaigns : [];
    const occupancy = new Map<string, number>();
    for (const campaign of rows) {
      const from = new Date(`${campaign.start_date || today}T00:00:00Z`);
      const to = new Date(`${campaign.end_date || campaign.start_date || today}T00:00:00Z`);
      for (let cursor = from; cursor <= to; cursor = new Date(cursor.getTime() + DAY_MS)) {
        const keyDate = isoDate(cursor);
        occupancy.set(keyDate, (occupancy.get(keyDate) || 0) + 1);
      }
    }

    const availableDates = [];
    for (let cursor = start; cursor <= end; cursor = new Date(cursor.getTime() + DAY_MS)) {
      if (cursor.getUTCDay() === 0) continue;
      const date = isoDate(cursor);
      const placesAvailable = Math.max(0, DAILY_CAPACITY - (occupancy.get(date) || 0));
      if (placesAvailable > 0) availableDates.push({ date, placesAvailable });
    }

    const requestedLat = Number(body.lat);
    const requestedLng = Number(body.lng);
    const slots = new Map<string, { date: string; type: string; discountPercent: number; placesAvailable: number; source: string }>();
    for (const campaign of rows) {
      if (campaign.service_type !== service || !campaign.start_date) continue;
      const campaignDate = new Date(`${campaign.start_date}T00:00:00Z`);
      const offset = Math.round((campaignDate.getTime() - start.getTime()) / DAY_MS);
      if (!PAIRING_OFFSETS.has(offset)) continue;
      const sameZone = [campaign.city, campaign.zone_name].some(value => clean(value) === zone);
      const nearby = !sameZone && Number.isFinite(requestedLat) && Number.isFinite(requestedLng) && Number.isFinite(Number(campaign.lat)) && Number.isFinite(Number(campaign.lng))
        && distanceKm(requestedLat, requestedLng, Number(campaign.lat), Number(campaign.lng)) <= 5;
      if (!sameZone && !nearby) continue;
      const date = campaign.start_date;
      const placesAvailable = Math.max(0, DAILY_CAPACITY - (occupancy.get(date) || 0));
      if (placesAvailable < 1) continue;
      const candidate = { date, type: sameZone ? "same" : "nearby", discountPercent: sameZone ? 40 : 20, placesAvailable, source: "campaign_capacity" };
      const previous = slots.get(date);
      if (!previous || candidate.discountPercent > previous.discountPercent) slots.set(date, candidate);
    }

    return json({
      availableDates,
      smartPairingSlots: [...slots.values()],
      source: "campaign_capacity",
      limits: { offsets: [...PAIRING_OFFSETS], dailyCapacity: DAILY_CAPACITY },
    });
  } catch {
    return json({ error: "SMART_PAIRING_DATA_UNAVAILABLE" }, 500);
  }
});
