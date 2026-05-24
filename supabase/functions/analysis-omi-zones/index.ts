import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.4";
import { sourceLabel } from "../_shared/dataSources.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

type OmiZoneRequest = {
  lat: number;
  lng: number;
  radiusKm: number;
  year?: number;
  semester?: number;
};

type OmiZoneRow = {
  source?: string | null;
  year?: number | null;
  semester?: number | null;
  municipality_name?: string | null;
  municipality_code?: string | null;
  zone_code?: string | null;
  zone_name?: string | null;
  min_value?: number | null;
  max_value?: number | null;
  typology?: string | null;
  geometry_geojson?: string | null;
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

function toFiniteNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function readInput(req: Request): Promise<OmiZoneRequest> {
  const url = new URL(req.url);
  const body = req.method === "POST"
    ? await req.json().catch(() => ({}))
    : {};

  const lat = toFiniteNumber((body as Record<string, unknown>).lat ?? url.searchParams.get("lat"));
  const lng = toFiniteNumber((body as Record<string, unknown>).lng ?? url.searchParams.get("lng"));
  const radiusKm = toFiniteNumber(
    (body as Record<string, unknown>).radiusKm ??
      (body as Record<string, unknown>).radius ??
      url.searchParams.get("radiusKm") ??
      url.searchParams.get("radius"),
  );
  const year = toFiniteNumber((body as Record<string, unknown>).year ?? url.searchParams.get("year"));
  const semester = toFiniteNumber((body as Record<string, unknown>).semester ?? url.searchParams.get("semester"));

  return {
    lat: lat ?? NaN,
    lng: lng ?? NaN,
    radiusKm: radiusKm ?? NaN,
    year: year ?? undefined,
    semester: semester ?? undefined,
  };
}

function validateInput(input: OmiZoneRequest) {
  if (!Number.isFinite(input.lat) || input.lat < -90 || input.lat > 90) return "INVALID_LAT";
  if (!Number.isFinite(input.lng) || input.lng < -180 || input.lng > 180) return "INVALID_LNG";
  if (!Number.isFinite(input.radiusKm) || input.radiusKm <= 0 || input.radiusKm > 50) return "INVALID_RADIUS";
  if (input.year !== undefined && (!Number.isInteger(input.year) || input.year < 2000 || input.year > 2100)) return "INVALID_YEAR";
  if (input.semester !== undefined && ![1, 2].includes(input.semester)) return "INVALID_SEMESTER";
  return null;
}

function uniqueValues<T>(values: T[]) {
  return [...new Set(values.filter(Boolean))];
}

function summarize(rows: OmiZoneRow[]) {
  const minValues = rows.map((row) => Number(row.min_value)).filter(Number.isFinite);
  const maxValues = rows.map((row) => Number(row.max_value)).filter(Number.isFinite);
  return {
    rows_count: rows.length,
    zone_count: uniqueValues(rows.map((row) => row.zone_code)).length,
    municipality_count: uniqueValues(rows.map((row) => row.municipality_name)).length,
    typology_count: uniqueValues(rows.map((row) => row.typology)).length,
    municipalities: uniqueValues(rows.map((row) => row.municipality_name)),
    typologies: uniqueValues(rows.map((row) => row.typology)),
    min_value: minValues.length ? Math.min(...minValues) : null,
    max_value: maxValues.length ? Math.max(...maxValues) : null,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!["GET", "POST"].includes(req.method)) return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const input = await readInput(req);
    const validationError = validateInput(input);
    if (validationError) {
      return json({
        zones: [],
        values: {},
        metadata: { isEstimated: false, warnings: [validationError] },
        sources: [],
        error: validationError,
      }, 400);
    }

    const supabase = supabaseAdmin();
    if (!supabase) {
      return json({
        zones: [],
        values: {},
        metadata: { isEstimated: false, warnings: ["SUPABASE_NOT_CONFIGURED"] },
        sources: [],
        error: "OMI_BACKEND_NOT_CONFIGURED",
      }, 500);
    }

    const { data, error } = await supabase.rpc("get_omi_zones_in_radius", {
      center_lat: input.lat,
      center_lng: input.lng,
      radius_km: input.radiusKm,
      target_year: input.year ?? null,
      target_semester: input.semester ?? null,
    });

    if (error) {
      return json({
        zones: [],
        values: {},
        metadata: { isEstimated: false, warnings: [`OMI_RPC_UNAVAILABLE:${error.message}`] },
        sources: [],
        error: "OMI_DATA_NOT_AVAILABLE",
      }, 502);
    }

    const zones = Array.isArray(data) ? data as OmiZoneRow[] : [];
    if (zones.length === 0) {
      return json({
        zones: [],
        values: {},
        metadata: {
          isEstimated: false,
          available: false,
          message: "Dato OMI non disponibile",
          request: input,
        },
        sources: [],
      });
    }

    const summary = summarize(zones);
    return json({
      zones,
      values: {
        omi_rows_count: summary.rows_count,
        omi_zone_count: summary.zone_count,
        omi_municipality_count: summary.municipality_count,
        omi_typology_count: summary.typology_count,
        omi_min_value: summary.min_value,
        omi_max_value: summary.max_value,
      },
      metadata: {
        isEstimated: false,
        available: true,
        label: "Valori immobiliari OMI",
        source: "Agenzia Entrate - OMI",
        request: input,
        summary,
      },
      sources: [sourceLabel("omi")],
    });
  } catch (error) {
    return json({
      zones: [],
      values: {},
      metadata: {
        isEstimated: false,
        warnings: [error instanceof Error ? error.message : "UNKNOWN_ERROR"],
      },
      sources: [],
      error: "OMI_DATA_NOT_AVAILABLE",
    }, 500);
  }
});
