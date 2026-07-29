// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.4";
import { sourceLabel } from "../_shared/dataSources.ts";
import { runTerritorialPipeline } from "./resolveTerritorialRpcPlan.ts";

declare const Deno: any;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {...corsHeaders, "Content-Type": "application/json" },
  });

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, Math.round(value || 0)));
const normalizeText = (value: string | null) =>
  String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

const isMilanoName = (value: string | null) => /\bmilano\b/.test(normalizeText(value));
const isMilanoCoordinates = (lat: number, lng: number) =>
  Number.isFinite(lat) &&
  Number.isFinite(lng) &&
  lat >= 45.38 &&
  lat <= 45.56 &&
  lng >= 9.04 &&
  lng <= 9.31;

function rowFamiliesInRadius(row: Record<string, unknown>) {
  const explicit = Number(row.households_in_radius || row.famiglie_nel_raggio || 0);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const pct = Number(row.pct_copertura || 100) / 100;
  return Number(row.households_total || row.famiglie_stimate || 0) * (Number.isFinite(pct) ? pct : 1);
}

function rowPopulationInRadius(row: Record<string, unknown>) {
  const explicit = Number(row.population_in_radius || row.popolazione_nel_raggio || 0);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const pct = Number(row.pct_copertura || 100) / 100;
  return Number(row.population_total || row.popolazione_stimata || 0) * (Number.isFinite(pct) ? pct : 1);
}

type OmiZone = {
  source?: string;
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

function supabaseAdmin() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function useMapbox(lat: number, lng: number, warnings: string[]) {
  const token = Deno.env.get("MAPBOX_TOKEN") || Deno.env.get("VITE_MAPBOX_TOKEN");
  if (!token) return null;
  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?types=place,locality,neighborhood&limit=1&access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`MAPBOX_${res.status}`);
    const data = await res.json();
    return data?.features?.[0]?.place_name || null;
  } catch (error) {
    warnings.push(`MAPBOX_UNAVAILABLE:${error instanceof Error ? error.message : "unknown"}`);
    return null;
  }
}

function dedupeByTypology(zones: OmiZone[]) {
  const byTypology = new Map<string, OmiZone>();
  for (const z of zones) {
    if (!z.typology) continue;
    const existing = byTypology.get(z.typology);
    const zScore = (z.year || 0) * 10 + (z.semester || 0);
    const exScore = existing ? (existing.year || 0) * 10 + (existing.semester || 0) : -1;
    if (!existing || zScore > exScore) byTypology.set(z.typology, z);
  }
  return [...byTypology.values()]
    .filter((z) => z.min_value != null || z.max_value != null)
    .map((z) => ({
      typology: z.typology!,
      min_value: z.min_value ?? null,
      max_value: z.max_value ?? null,
      unit: "€/mq",
      year: z.year ?? null,
      semester: z.semester ?? null,
    }));
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function buildOmiResult(zones: OmiZone[]) {
  if (zones.length === 0) return { available: false as const, message: "Dato OMI non disponibile" };
  const primary = zones[0];
  const primaryMunicipality = primary.municipality_name;
  const primaryZoneCode = primary.zone_code;
  // Tutte le zone OMI del comune (NON filtrate a una sola zone_code): servono per
  // esporre quante zone OMI reali compongono il range mostrato, invece di
  // collassarle silenziosamente su una sola (bug segnalato: range presentato
  // come se rappresentasse l'intero comune senza dichiarare quante zone OMI
  // sono realmente aggregate).
  const municipalityZones = zones.filter((z) => (primaryMunicipality ? z.municipality_name === primaryMunicipality : true));
  const byZoneCode = new Map<string, OmiZone[]>();
  for (const z of municipalityZones) {
    const key = z.zone_code || "unknown";
    if (!byZoneCode.has(key)) byZoneCode.set(key, []);
    byZoneCode.get(key)!.push(z);
  }
  const zoneEntries = [...byZoneCode.entries()].map(([zoneCode, rows]) => ({
    zone_code: zoneCode !== "unknown" ? zoneCode : null,
    zone_name: rows[0]?.zone_name || null,
    values: dedupeByTypology(rows),
  }));

  // Aggregato cross-zona per tipologia (solo quando ci sono piu' zone OMI reali):
  // min assoluto, mediana dei valori medi di zona, max assoluto. Dichiarato
  // esplicitamente come aggregazione, non come valore di una singola zona.
  const byTypologyAcrossZones = new Map<string, { mins: number[]; maxs: number[]; mids: number[]; zoneCount: number }>();
  for (const entry of zoneEntries) {
    for (const v of entry.values) {
      if (!byTypologyAcrossZones.has(v.typology)) byTypologyAcrossZones.set(v.typology, { mins: [], maxs: [], mids: [], zoneCount: 0 });
      const bucket = byTypologyAcrossZones.get(v.typology)!;
      bucket.zoneCount += 1;
      if (v.min_value != null) bucket.mins.push(v.min_value);
      if (v.max_value != null) bucket.maxs.push(v.max_value);
      if (v.min_value != null && v.max_value != null) bucket.mids.push((v.min_value + v.max_value) / 2);
    }
  }
  const aggregateValues = [...byTypologyAcrossZones.entries()].map(([typology, bucket]) => ({
    typology,
    min_value: bucket.mins.length ? Math.min(...bucket.mins) : null,
    median_value: median(bucket.mids),
    max_value: bucket.maxs.length ? Math.max(...bucket.maxs) : null,
    unit: "€/mq",
    zone_count: bucket.zoneCount,
  }));

  // `values`/`zone_code`/`zone_name` restano la singola zona primaria (comportamento
  // invariato per compatibilita' con il codice esistente); `zones`/`zone_count`/
  // `aggregate` sono i nuovi campi con il dettaglio multi-zona reale.
  const primaryZones = municipalityZones.filter((z) => (primaryZoneCode ? z.zone_code === primaryZoneCode : true));
  const typologyValues = dedupeByTypology(primaryZones);

  return {
    available: true as const,
    source: "Agenzia Entrate - OMI",
    municipality: primary.municipality_name || null,
    zone_code: primary.zone_code || null,
    zone_name: primary.zone_name || null,
    values: typologyValues,
    zone_count: zoneEntries.length,
    zones: zoneEntries,
    aggregate: zoneEntries.length > 1 ? { method: "min assoluto / mediana dei valori medi di zona / max assoluto su tutte le zone OMI del comune", values: aggregateValues } : null,
  };
}

function omiIdentity(row: OmiZone) {
  return [
    row.year || "",
    row.semester || "",
    row.municipality_code || row.municipality_name || "",
    row.zone_code || "",
    row.typology || "",
    row.min_value || "",
    row.max_value || "",
  ].join("|").toLowerCase();
}

async function loadOmiZones(
  supabase: ReturnType<typeof supabaseAdmin>,
  lat: number,
  lng: number,
  radiusKm: number,
  comuni: Array<Record<string, unknown>>,
  warnings: string[],
  specificMunicipality: string | null = null,
): Promise<OmiZone[]> {
  if (!supabase) return [];

  const zones = new Map<string, OmiZone>();
  const addRows = (rows: unknown) => {
    if (!Array.isArray(rows)) return;
    for (const row of rows as OmiZone[]) zones.set(omiIdentity(row), row);
  };

  // When a specific municipality is requested (areaMode = "comune"), only query that one.
  // No radius lookup, no fallback to other comuni.
  if (specificMunicipality) {
    const result = await supabase.rpc("get_omi_zones_by_municipality", {
      p_municipality_name: specificMunicipality,
      p_municipality_code: null,
    });
    if (result.error) {
      warnings.push(`OMI_SPECIFIC_LOOKUP_UNAVAILABLE:${result.error.message}`);
    } else {
      addRows(result.data);
    }
    return [...zones.values()];
  }

  const radiusResult = await supabase.rpc("get_omi_zones_in_radius", {
    p_lat: lat,
    p_lng: lng,
    p_radius_km: radiusKm,
  });

  if (radiusResult.error) {
    warnings.push(`OMI_RADIUS_LOOKUP_UNAVAILABLE:${radiusResult.error.message}`);
  } else {
    addRows(radiusResult.data);
  }

  if (zones.size === 0) {
    for (const row of comuni.slice(0, 8)) {
      const municipalityName = String(row.comune_name || row.municipality_name || "");
      const municipalityCode = String(row.municipality_code || "");
      if (!municipalityName && !municipalityCode) continue;
      const municipalityResult = await supabase.rpc("get_omi_zones_by_municipality", {
        p_municipality_name: municipalityName || null,
        p_municipality_code: municipalityCode || null,
      });
      if (municipalityResult.error) {
        warnings.push(`OMI_MUNICIPALITY_LOOKUP_UNAVAILABLE:${municipalityResult.error.message}`);
        break;
      }
      addRows(municipalityResult.data);
      if (zones.size > 0) break;
    }
  }

  return [...zones.values()];
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const lat = Number(url.searchParams.get("lat"));
    const lng = Number(url.searchParams.get("lng"));
    const radiusKm = Number(url.searchParams.get("radius") || "3");
    const service = url.searchParams.get("service") || "d2d";
    const requestedAnalysisLevel = url.searchParams.get("analysisLevel") || url.searchParams.get("analysis_level") || null;
    const selectionScope = url.searchParams.get("selectionScope") || null;
    const selectedMunicipalityCodes = url.searchParams.get("selectedMunicipalityCodes") || null;
    const specificMunicipality = url.searchParams.get("municipality") || null;
    const warnings: string[] = [];
    const sources = new Set<string>();

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return json({ values: {}, comuni_breakdown: [], metadata: { isEstimated: false }, error: "INVALID_COORDINATES", sources: [] }, 400);
    }

    const mapboxPlace = await useMapbox(lat, lng, warnings);
    if (mapboxPlace) sources.add(sourceLabel("mapbox"));

    const supabase = supabaseAdmin();
    if (!supabase) {
      return json({
        values: {},
        comuni_breakdown: [],
        metadata: { isEstimated: false, warnings: ["SUPABASE_NOT_CONFIGURED",...warnings] },
        error: "TERRITORIAL_DATA_NOT_AVAILABLE",
        sources: [...sources],
        confidenceReduced: true,
      });
    }

    const pipelineResult = await runTerritorialPipeline({
      params: {
        lat,
        lng,
        radiusKm,
        service,
        selectionScope,
        selectedMunicipalityCodes,
        specificMunicipality,
        requestedAnalysisLevel,
        warnings,
        sources,
        sourceLabel
      },
      queryComuni: async (pLat: number, pLng: number, pRadius: number) => {
        const res = await supabase.rpc("get_comuni_breakdown_in_radius", {
          p_lat: pLat,
          p_lng: pLng,
          p_radius_km: pRadius,
        });
        return { data: res.data, error: res.error };
      },
      queryNils: async (pLat: number, pLng: number, pRadius: number) => {
        const res = await supabase.rpc("get_nil_breakdown_in_radius", {
          center_lat: pLat,
          center_lng: pLng,
          radius_km: pRadius,
        });
        return { data: res.data, error: res.error };
      }
    });

    const comuni = pipelineResult.comuni;
    const nilRows = pipelineResult.nilRows;
    const territorialRows = pipelineResult.territorialRows;
    let analysisLevel = pipelineResult.analysisLevel;
    const nilUnavailable = pipelineResult.nilUnavailable;

    console.log("TERRITORY_LEVEL", analysisLevel);
    console.log("NIL_ROWS", nilRows?.length);

    if (!territorialRows || territorialRows.length === 0) {
      return json({
        values: {},
        comuni_breakdown: [],
        nil_breakdown: [],
        metadata: { isEstimated: false, warnings, mapboxPlace, analysis_level: analysisLevel, nil_unavailable: nilUnavailable },
        error: "TERRITORIAL_DATA_NOT_AVAILABLE",
        sources: [...sources],
        confidenceReduced: true,
      });
    }

    const hasDemographicData = territorialRows.some((row: Record<string, unknown>) => Number(row.households_total || row.famiglie_stimate || 0) > 0 || Number(row.population_total || row.popolazione_stimata || 0) > 0);
    if (!hasDemographicData) {
      warnings.push("DEMOGRAPHIC_INDICATORS_EMPTY");
    }

    sources.add(sourceLabel("istat"));

    const totalFamilies = territorialRows.reduce((acc: number, row: Record<string, unknown>) => acc + rowFamiliesInRadius(row), 0);
    const totalPopulation = territorialRows.reduce((acc: number, row: Record<string, unknown>) => acc + rowPopulationInRadius(row), 0);
    const totalArea = territorialRows.reduce((acc: number, row: Record<string, unknown>) => acc + Number(row.area_km2 || 0), 0);
    const omiMunicipality = specificMunicipality || (analysisLevel === "nil" ? "Milano" : null);
    const omiLookupRows = analysisLevel === "nil" ? [{ comune_name: "Milano", municipality_name: "Milano", municipality_code: "015146" }] : territorialRows;
    const omiZones = await loadOmiZones(supabase, lat, lng, radiusKm, omiLookupRows, warnings, omiMunicipality);
    if (omiZones.length > 0) sources.add(sourceLabel("omi"));
    const omiMinValues = omiZones.map((row: OmiZone) => Number(row.min_value)).filter(Number.isFinite);
    const omiMaxValues = omiZones.map((row: OmiZone) => Number(row.max_value)).filter(Number.isFinite);
    const avgDensity = totalArea > 0 ? totalPopulation / totalArea : territorialRows.reduce((acc: number, row: Record<string, unknown>) => acc + Number(row.density_per_km2 || 0), 0) / territorialRows.length;
    const recommendedFlyers = Math.round(totalFamilies * 1.1);
    const avgCoverage = Math.round(territorialRows.reduce((acc: number, row: Record<string, unknown>) => acc + Number(row.pct_copertura || 100), 0) / territorialRows.length);
    const familyIndex = clamp((avgDensity / 65) + (totalFamilies / 900));
    const reachScore = clamp(avgCoverage * 0.74 + Math.min(26, territorialRows.length * 5));
    const roiScore = clamp(55 + Math.min(30, totalFamilies / 900) + Math.min(12, avgCoverage / 12));
    const confidenceScore = clamp(72 + Math.min(18, territorialRows.length * 2) - (warnings.length * 5));
    sources.add(sourceLabel("internal_scoring"));

    const normalizedBreakdown = territorialRows.map((row: Record<string, unknown>) => ({
      territory_level: row.territory_level || (row.nil_code ? "nil" : analysisLevel),
      nil_code: row.nil_code ? String(row.nil_code).trim() : null,
      nil_name: row.nil_name || null,
      comune_name: row.nil_name || row.comune_name || row.municipality_name,
      municipality_code: row.municipality_code ? String(row.municipality_code).trim() : null,
      pct_copertura: Math.round(Number(row.pct_copertura || 100)),
      volantini_nel_raggio: Math.round(Number(row.volantini_nel_raggio || rowFamiliesInRadius(row) * 1.1 || 0)),
      households_total: Number(row.households_total || 0),
      population_total: Number(row.population_total || 0),
      households_in_radius: Math.round(rowFamiliesInRadius(row)),
      population_in_radius: Math.round(rowPopulationInRadius(row)),
      area_km2: Number(row.area_km2 || 0),
      density_per_km2: Number(row.density_per_km2 || 0),
      age_0_14_pct: row.age_0_14_pct ?? null,
      age_15_34_pct: row.age_15_34_pct ?? null,
      age_35_64_pct: row.age_35_64_pct ?? null,
      age_65_plus_pct: row.age_65_plus_pct ?? null,
      average_income: row.average_income ?? null,
      old_age_index: row.old_age_index ?? null,
      businesses_total: row.businesses_total ?? null,
      geometry_geojson: row.geometry_geojson || null,
    }));

    const normalizedNilBreakdown = nilRows.map((row: Record<string, unknown>) => ({
      territory_level: "nil",
      nil_code: row.nil_code ? String(row.nil_code).trim() : null,
      nil_name: row.nil_name || null,
      comune_name: row.nil_name || row.name || "Milano (NIL)",
      municipality_code: "015146",
      pct_copertura: Math.round(Number(row.pct_copertura || 100)),
      volantini_nel_raggio: Math.round(Number(row.volantini_nel_raggio || rowFamiliesInRadius(row) * 1.1 || 0)),
      households_total: Number(row.households_total || 0),
      population_total: Number(row.population_total || 0),
      households_in_radius: Math.round(rowFamiliesInRadius(row)),
      population_in_radius: Math.round(rowPopulationInRadius(row)),
      area_km2: Number(row.area_km2 || 0),
      density_per_km2: Number(row.density_per_km2 || 0),
      geometry_geojson: row.geometry_geojson || null,
    }));

    return json({
      values: {
        famiglie_stimate: Math.round(totalFamilies),
        popolazione_stimata: Math.round(totalPopulation),
        area_km2: Math.round(totalArea * 10) / 10,
        copertura_stimata: avgCoverage,
        volantini_consigliati: recommendedFlyers,
        family_index: familyIndex,
        reach_score: reachScore,
        roi_score: roiScore,
        confidence_score: confidenceScore,
        densita_media: Math.round(avgDensity || 0),
        comuni_coinvolti: territorialRows.length,
        analysis_level: analysisLevel,
        ...(omiZones.length > 0 ? {
          omi_min_value: omiMinValues.length ? Math.min(...omiMinValues) : null,
          omi_max_value: omiMaxValues.length ? Math.max(...omiMaxValues) : null,
          omi_zone_count: omiZones.length,
          omi_typologies: [...new Set(omiZones.map((row: OmiZone) => row.typology).filter(Boolean))],
        } : {}),
      },
      comuni_breakdown: normalizedBreakdown,
      nil_breakdown: nilRows.length > 0 ? normalizedNilBreakdown : (analysisLevel === "nil" ? normalizedBreakdown : []),
      metadata: {
        isEstimated: false,
        warnings,
        mapboxPlace,
        analysis_level: analysisLevel,
        nil_unavailable: nilUnavailable,
        omi: buildOmiResult(omiZones),
      },
      confidenceReduced: warnings.length > 0,
      sources: [...sources],
    });
  } catch (error) {
    return json({
      values: {},
      comuni_breakdown: [],
      metadata: { isEstimated: false, warnings: [error instanceof Error ? error.message : "UNKNOWN_ERROR"] },
      error: "TERRITORIAL_DATA_NOT_AVAILABLE",
      confidenceReduced: true,
      sources: [],
    }, 500);
  }
});
