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

  // BUGFIX (dati territoriali errati per comuni confinanti con Milano, es.
  // Cormano): selectionScope "municipality" (intero comune, singolo
  // comune, MAI Milano) cadeva nel ramo "mixed" sotto — pensato per
  // Raggio/Address, che unisce indiscriminatamente tutte le NIL di Milano
  // + ogni comune intercettato dallo sweep RPC lat/lng/raggio interno,
  // senza filtrare per il comune realmente richiesto. Lo sweep tecnico usa
  // un raggio (3-8km, vedi Step2.jsx effectiveRadiusKm) che puo' toccare
  // Milano da un comune confinante come Cormano anche in modalita' "intero
  // comune" — risultato: famiglie/popolazione sommate su Milano intera (88
  // NIL, centinaia di migliaia di abitanti) invece che sul solo comune
  // selezionato (~7-8x di inflazione, coerente col bug osservato: 73.272
  // vs 9.297 famiglie reali). Fix: quando lo scope e' "municipality" e NON
  // e' Milano stessa, filtrare SEMPRE comuni al solo comune richiesto,
  // ignorando qualunque NIL/comune esterno intercettato incidentalmente
  // dallo sweep — mai propagarlo nel risultato.
  const isSingleNonMilanoMunicipalityScope =
    selectionScope === "municipality" && !isMilanoCompleteComuneScope;

  if (isMilanoCompleteComuneScope) {
    // Workaround temporaneo: verifica che le NIL recuperate siano esattamente 88 uniche
    if (deduplicatedMilanoNils.length !== 88) {
      warnings.push(`MILANO_NIL_COMPLETE_INCOMPLETE_OR_DUPLICATED: expected 88 unique NILs, found ${deduplicatedMilanoNils.length}. Note: radius=15 is a temporary technical workaround.`);
    }
    territorialRows = deduplicatedMilanoNils;
    analysisLevel = "nil";
  } else if (isSingleNonMilanoMunicipalityScope) {
    const normalizeName = (name?: string | null) =>
      name ? String(name).normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim() : "";
    const requestedName = normalizeName(input.specificMunicipality);
    const requestedIsCode = /^\d+$/.test(String(input.specificMunicipality || "").trim());
    const requestedCode = requestedIsCode ? String(input.specificMunicipality).trim() : null;

    const matched = comuni.filter((c) => {
      const rowCode = String(c.municipality_code ?? c.comune_code ?? c.istat_code ?? "").trim();
      if (requestedCode) return rowCode === requestedCode;
      const rowName = normalizeName(String(c.comune_name || c.municipality_name || ""));
      return rowName === requestedName;
    });

    if (matched.length === 0) {
      // Il comune richiesto non e' tra i risultati dello sweep RPC (nome/
      // codice non combaciano) — mai propagare al suo posto Milano o altri
      // comuni intercettati incidentalmente dallo sweep.
      warnings.push(`MUNICIPALITY_SCOPE_REQUESTED_COMUNE_NOT_IN_SWEEP: "${input.specificMunicipality}" not found among ${comuni.length} comuni returned by the radius sweep; any Milano NILs/external comuni picked up incidentally were discarded, not merged in.`);
    }

    territorialRows = matched;
    analysisLevel = "comune";
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
