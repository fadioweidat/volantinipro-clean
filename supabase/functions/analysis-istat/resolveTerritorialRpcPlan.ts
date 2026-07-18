import { normalizeMunicipalityCodes } from "../_shared/normalizeMunicipalityCodes.ts";
import { resolveTerritorialBreakdown } from "./territorialResolver.ts";

export interface TerritorialRpcPlanInput {
  service: string | null;
  lat: number;
  lng: number;
  selectionScope?: string | null;
  selectedMunicipalityCodes?: string | string[] | null;
  specificMunicipality?: string | null;
  requestedAnalysisLevel?: string | null;
  comuni?: Array<Record<string, unknown>> | null;
  rpcComuniError?: boolean;
  warnings?: string[];
}

export interface TerritorialRpcPlanOutput {
  shouldQueryComuni: boolean;
  shouldQueryNil: boolean;
  hasMilanoInRadius: boolean;
}

export function isMilanoName(name: string | null | undefined): boolean {
  if (!name) return false;
  const clean = String(name).normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
  return clean === "milano" || /\bmilano\b/.test(clean);
}

export function resolveTerritorialRpcPlan(input: TerritorialRpcPlanInput): TerritorialRpcPlanOutput {
  const service = input.service || "d2d";
  const shouldQueryComuni = service === "d2d";
  const warnings = input.warnings || [];

  const comuni = Array.isArray(input.comuni) ? input.comuni : [];
  const hasMilanoInRadius = comuni.some((c) =>
    isMilanoName(String(c.comune_name || c.municipality_name || "")) ||
    String(c.municipality_code || "") === "015146" ||
    String(c.comune_code || "") === "015146"
  );

  const normalizedCodes = normalizeMunicipalityCodes(input.selectedMunicipalityCodes);

  let shouldQueryNil = false;
  if (service === "d2d") {
    if (input.rpcComuniError) {
      warnings.push("RPC_COMUNI_FAILED_CANNOT_DERIVE_MILANO_INTERSECTION");
    }

    if (input.selectionScope === "multi") {
      shouldQueryNil = normalizedCodes.codesSet.has("015146");
    } else {
      // Source of truth: codice selezionato/comunale 015146, specificMunicipality Milano, o hasMilanoInRadius derivato da RPC
      shouldQueryNil =
        input.requestedAnalysisLevel === "nil" ||
        isMilanoName(input.specificMunicipality) ||
        input.specificMunicipality === "015146" ||
        normalizedCodes.codesSet.has("015146") ||
        hasMilanoInRadius;
    }
  }

  return {
    shouldQueryComuni,
    shouldQueryNil,
    hasMilanoInRadius
  };
}

export interface TerritorialPipelineParams {
  lat: number;
  lng: number;
  radiusKm: number;
  service: string | null;
  selectionScope?: string | null;
  selectedMunicipalityCodes?: string | null;
  specificMunicipality?: string | null;
  requestedAnalysisLevel?: string | null;
  warnings?: string[];
  sources?: Set<string>;
  sourceLabel?: (key: string) => string;
}

export interface TerritorialPipelineResult {
  comuni: Array<Record<string, unknown>>;
  nilRows: Array<Record<string, unknown>>;
  territorialRows: Array<Record<string, unknown>>;
  analysisLevel: string;
  nilUnavailable: boolean;
  rpcPlan: TerritorialRpcPlanOutput;
}

/**
 * Funzione d'orchestrazione territoriale iniettabile per Edge Function e Test.
 */
export async function runTerritorialPipeline({
  params,
  queryComuni,
  queryNils
}: {
  params: TerritorialPipelineParams;
  queryComuni: (lat: number, lng: number, radiusKm: number) => Promise<{ data: unknown; error: { message?: string } | null }>;
  queryNils: (lat: number, lng: number, radiusKm: number) => Promise<{ data: unknown; error: { message?: string } | null }>;
}): Promise<TerritorialPipelineResult> {
  const warnings = params.warnings || [];
  const sources = params.sources || new Set<string>();
  const sourceLabelFn = params.sourceLabel || ((k: string) => k);

  let comuni: Array<Record<string, unknown>> = [];
  let rpcComuniError = false;

  if (params.service === "d2d") {
    const comuniResult = await queryComuni(params.lat, params.lng, params.radiusKm);
    if (comuniResult.error) {
      rpcComuniError = true;
      warnings.push(`POSTGIS_RPC_UNAVAILABLE:${comuniResult.error.message || "get_comuni_breakdown_in_radius"}`);
    } else {
      const rawData = Array.isArray(comuniResult.data) ? comuniResult.data as Array<Record<string, unknown>> : [];
      if (rawData.length > 0) {
        const comuniMap = new Map<string, Record<string, unknown>>();
        for (const row of rawData) {
          const code = row.municipality_code ?? row.comune_code ?? row.istat_code ?? null;
          const key = code !== null && code !== undefined ? `comune_${String(code).trim()}` : `idx_${comuniMap.size}`;
          if (!comuniMap.has(key)) {
            comuniMap.set(key, row);
          }
        }
        comuni = Array.from(comuniMap.values());
        if (comuni.length > 0) sources.add(sourceLabelFn("postgis"));
      }
    }
  }

  const rpcPlan = resolveTerritorialRpcPlan({
    service: params.service,
    lat: params.lat,
    lng: params.lng,
    selectionScope: params.selectionScope,
    selectedMunicipalityCodes: params.selectedMunicipalityCodes,
    specificMunicipality: params.specificMunicipality,
    requestedAnalysisLevel: params.requestedAnalysisLevel,
    comuni,
    rpcComuniError,
    warnings
  });

  let nilRows: Array<Record<string, unknown>> = [];
  let nilUnavailable = false;

  if (rpcPlan.shouldQueryNil) {
    const nilResult = await queryNils(params.lat, params.lng, params.radiusKm);
    if (nilResult.error) {
      nilUnavailable = true;
      warnings.push(`NIL_RPC_UNAVAILABLE:${nilResult.error.message || "get_nil_breakdown_in_radius"}`);
    } else {
      const rawNilData = Array.isArray(nilResult.data) ? nilResult.data as Array<Record<string, unknown>> : [];
      if (rawNilData.length > 0) {
        const nilMap = new Map<string, Record<string, unknown>>();
        for (const row of rawNilData) {
          const code = row.nil_code ?? row.NIL_CODE ?? row.id_nil ?? row.ID_NIL ?? null;
          const key = code !== null && code !== undefined ? `nil_${String(code).trim()}` : `idx_${nilMap.size}`;
          if (!nilMap.has(key)) {
            nilMap.set(key, row);
          }
        }
        nilRows = Array.from(nilMap.values());
        sources.add(sourceLabelFn("postgis"));
      } else {
        nilUnavailable = true;
        warnings.push("NIL_DATA_NOT_AVAILABLE");
      }
    }
  }

  const resolved = resolveTerritorialBreakdown({
    rawSelectionScope: params.selectionScope,
    requestedAnalysisLevel: params.requestedAnalysisLevel,
    specificMunicipality: params.specificMunicipality,
    nilRows,
    comuni,
    selectedMunicipalityCodes: params.selectedMunicipalityCodes,
    warnings
  });

  return {
    comuni,
    nilRows,
    territorialRows: resolved.territorialRows,
    analysisLevel: resolved.analysisLevel,
    nilUnavailable,
    rpcPlan
  };
}
