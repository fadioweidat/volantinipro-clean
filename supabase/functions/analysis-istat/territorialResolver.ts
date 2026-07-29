import { normalizeMunicipalityCodes } from "../_shared/normalizeMunicipalityCodes.ts";

export type SelectionScope = "municipality" | "radius" | "address" | "cap" | "multi";

export interface TerritorialResolverInput {
  rawSelectionScope?: string | null;
  requestedAnalysisLevel?: string | null;
  specificMunicipality?: string | null;
  nilRows?: Array<Record<string, unknown>>;
  comuni?: Array<Record<string, unknown>>;
  selectedMunicipalityCodes?: string | null;
  warnings?: string[];
}

export interface TerritorialResolverOutput {
  territorialRows: Array<Record<string, unknown>>;
  analysisLevel: string;
  selectionScope: SelectionScope;
  milanoNilsCount: number;
  externalComuniCount: number;
}

const VALID_SCOPES: Set<string> = new Set(["municipality", "radius", "address", "cap", "multi"]);

export function resolveTerritorialBreakdown(input: TerritorialResolverInput): TerritorialResolverOutput {
  const warnings = input.warnings || [];
  const isMilanoName = (name?: string | null) => {
    if (!name) return false;
    const clean = String(name).normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
    return clean === "milano" || /\bmilano\b/.test(clean);
  };

  // 1. Validazione e normalizzazione di selectionScope
  let selectionScope: SelectionScope = "radius";
  if (input.rawSelectionScope && VALID_SCOPES.has(input.rawSelectionScope)) {
    selectionScope = input.rawSelectionScope as SelectionScope;
  } else if (input.rawSelectionScope) {
    warnings.push(`INVALID_SELECTION_SCOPE:${input.rawSelectionScope}_FALLBACK_TO_RADIUS`);
    selectionScope = "radius";
  } else {
    // Default se omesso
    if (input.specificMunicipality && !input.requestedAnalysisLevel) {
      selectionScope = "municipality";
    } else {
      selectionScope = "radius";
    }
  }

  // 2. Deduplicazione Comuni via municipality_code
  let comuni: Array<Record<string, unknown>> = Array.isArray(input.comuni) ? [...input.comuni] : [];
  if (comuni.length > 0) {
    const comuniMap = new Map<string, Record<string, unknown>>();
    for (const row of comuni) {
      const code = row.municipality_code ?? row.comune_code ?? row.istat_code ?? null;
      const key = code !== null && code !== undefined ? `comune_${String(code).trim()}` : `idx_${comuniMap.size}`;
      if (!comuniMap.has(key)) {
        comuniMap.set(key, row);
      }
    }
    comuni = Array.from(comuniMap.values());
  }

  // 3. Deduplicazione NIL via nil_code
  let nilRows: Array<Record<string, unknown>> = Array.isArray(input.nilRows) ? [...input.nilRows] : [];
  if (nilRows.length > 0) {
    const nilMap = new Map<string, Record<string, unknown>>();
    for (const row of nilRows) {
      const code = row.nil_code ?? row.NIL_CODE ?? row.id_nil ?? row.ID_NIL ?? null;
      const key = code !== null && code !== undefined ? `nil_${String(code).trim()}` : `idx_${nilMap.size}`;
      if (!nilMap.has(key)) {
        nilMap.set(key, row);
      }
    }
    nilRows = Array.from(nilMap.values());
  }

  const deduplicatedMilanoNils = nilRows;
  const deduplicatedExternalMunicipalities = comuni.filter((c) =>
    !isMilanoName(String(c.comune_name || c.municipality_name || "")) &&
    String(c.municipality_code || "") !== "015146" &&
    String(c.comune_code || "") !== "015146"
  );

  let territorialRows: Array<Record<string, unknown>> = [];
  let analysisLevel = input.requestedAnalysisLevel || "comune";

  // 4. Logica Decisionale per selectionScope
  if (selectionScope === "multi") {
    // Multi-comune: mantenere solo i codici selezionati, sostituire 015146 con NIL Milano
    const normalized = normalizeMunicipalityCodes(input.selectedMunicipalityCodes);
    const selectedCodesSet = normalized.codesSet;

    if (selectedCodesSet.size > 0) {
      if (isMilanoName(input.specificMunicipality) && !selectedCodesSet.has("015146")) {
        warnings.push(`MULTI_SCOPE_INCONSISTENCY: specificMunicipality is ${input.specificMunicipality} but selectedMunicipalityCodes (${input.selectedMunicipalityCodes}) does not include 015146. Milano NILs excluded.`);
      }

      const includeMilanoNils = selectedCodesSet.has("015146");
      const filteredNils = includeMilanoNils ? deduplicatedMilanoNils : [];
      const filteredExternal = deduplicatedExternalMunicipalities.filter(c => {
        const code = String(c.municipality_code ?? c.comune_code ?? c.istat_code ?? "").trim();
        return selectedCodesSet.has(code);
      });

      territorialRows = [...filteredNils, ...filteredExternal];
      if (filteredNils.length > 0 && filteredExternal.length > 0) {
        analysisLevel = "mixed";
      } else if (filteredNils.length > 0) {
        analysisLevel = "nil";
      } else {
        analysisLevel = "comune";
      }
      return {
        territorialRows,
        analysisLevel,
        selectionScope,
        milanoNilsCount: filteredNils.length,
        externalComuniCount: filteredExternal.length
      };
    } else {
      warnings.push("MULTI_SCOPE_MISSING_SELECTED_CODES_FALLBACK_TO_INTERSECTED");
      // Fallback in assenza dei codici
      if (deduplicatedMilanoNils.length > 0 && deduplicatedExternalMunicipalities.length > 0) {
        territorialRows = [...deduplicatedMilanoNils, ...deduplicatedExternalMunicipalities];
        analysisLevel = "mixed";
      } else if (deduplicatedMilanoNils.length > 0) {
        territorialRows = deduplicatedMilanoNils;
        analysisLevel = "nil";
      } else {
        territorialRows = comuni;
        analysisLevel = "comune";
      }
      return {
        territorialRows,
        analysisLevel,
        selectionScope,
        milanoNilsCount: deduplicatedMilanoNils.length,
        externalComuniCount: deduplicatedExternalMunicipalities.length
      };
    }
  }

  const isMilanoCompleteComuneScope =
    selectionScope === "municipality" &&
    (isMilanoName(input.specificMunicipality) || input.specificMunicipality === "015146" || (deduplicatedMilanoNils.length > 0 && input.requestedAnalysisLevel === "nil"));

  if (isMilanoCompleteComuneScope) {
    // Workaround temporaneo: verifica che le NIL recuperate siano esattamente 88 uniche
    if (deduplicatedMilanoNils.length !== 88) {
      warnings.push(`MILANO_NIL_COMPLETE_INCOMPLETE_OR_DUPLICATED: expected 88 unique NILs, found ${deduplicatedMilanoNils.length}. Note: radius=15 is a temporary technical workaround.`);
    }
    territorialRows = deduplicatedMilanoNils;
    analysisLevel = "nil";
  } else if (deduplicatedMilanoNils.length > 0 && deduplicatedExternalMunicipalities.length > 0) {
    // Raggio o Address che interseca sia NIL di Milano che comuni esterni
    territorialRows = [...deduplicatedMilanoNils, ...deduplicatedExternalMunicipalities];
    analysisLevel = "mixed";
  } else if (deduplicatedMilanoNils.length > 0) {
    territorialRows = deduplicatedMilanoNils;
    analysisLevel = "nil";
  } else if (comuni.length > 0) {
    if (input.requestedAnalysisLevel === "nil") {
      warnings.push("NIL_LEVEL_REQUESTED_BUT_NO_NILS_FOUND_FALLBACK_TO_COMUNI");
    }
    territorialRows = comuni;
    analysisLevel = "comune";
  } else {
    warnings.push("NO_TERRITORIAL_DATA_IN_RADIUS");
    territorialRows = [];
    analysisLevel = input.requestedAnalysisLevel || "comune";
  }

  return {
    territorialRows,
    analysisLevel,
    selectionScope,
    milanoNilsCount: deduplicatedMilanoNils.length,
    externalComuniCount: deduplicatedExternalMunicipalities.length
  };
}
