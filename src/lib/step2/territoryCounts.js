// CONTEGGI TERRITORIALI (2026-11-05). Modulo puro.
//
// Tre unita' diverse, da non sommare tra loro:
//  - comuni coinvolti: comuni distinti. I NIL appartengono tutti a Milano e
//    contano come UN comune (stessa definizione di Step 2,
//    radiusMunicipalityRows: "milano-nil-total" + ogni riga comune);
//  - NIL di Milano: quartieri ufficiali del Comune di Milano nel territorio;
//  - territori (righe): righe di allocazione = NIL + comuni non Milano.
// Esempio reale (via Oroboni, 3 km): 12 NIL + 7 comuni = 19 righe,
// 8 comuni coinvolti (Milano + 7).

const MILANO = "Milano";

function normalizeName(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s*\([A-Z]{2}\)\s*$/i, "")
    .trim()
    .toLowerCase();
}

function rowName(row) {
  const n = row?.name;
  if (typeof n === "string") return n.trim();
  return String(n?.label || n?.name || row?.label || "").trim();
}

/** Riga NIL di Milano (righe di analysis-istat / zonesAllocation di Step 2). */
export function isNilTerritoryRow(row) {
  if (!row || typeof row !== "object") return false;
  const code = row.nilCode ?? row.nil_code ?? null;
  return Boolean(row.isNil || row.territoryLevel === "nil" || row.territory_level === "nil" || row.territory_type === "nil" || (code !== null && code !== undefined && code !== ""));
}

/** Etichetta del tipo di territorio per tabelle e PDF. */
export function territoryTypeLabel(row) {
  return isNilTerritoryRow(row) ? "NIL Milano" : "Comune";
}

/**
 * Conteggi da righe territoriali. Restituisce:
 *  municipalityNames: comuni distinti in ordine di apparizione (Milano una volta)
 *  municipalityCount, nilCount, otherMunicipalityCount (comuni diversi da Milano),
 *  territoryCount (righe), summary (testo leggibile).
 */
export function countTerritories(rows = []) {
  const list = Array.isArray(rows) ? rows.filter(r => r && rowName(r)) : [];
  const municipalities = new Map();
  let nilCount = 0;
  for (const row of list) {
    if (isNilTerritoryRow(row)) {
      nilCount += 1;
      if (!municipalities.has("milano")) municipalities.set("milano", MILANO);
      continue;
    }
    const name = rowName(row).replace(/\s*\([A-Z]{2}\)\s*$/i, "").trim();
    const key = normalizeName(name);
    if (key && !municipalities.has(key)) municipalities.set(key, name);
  }
  const municipalityNames = [...municipalities.values()];
  const hasMilano = municipalities.has("milano");
  const otherMunicipalityCount = municipalityNames.length - (hasMilano ? 1 : 0);
  return {
    municipalityNames,
    municipalityCount: municipalityNames.length,
    nilCount,
    otherMunicipalityCount,
    territoryCount: list.length,
    summary: describeTerritoryCounts({ municipalityCount: municipalityNames.length, nilCount, otherMunicipalityCount, hasMilano }),
  };
}

/** "8 comuni: Milano (12 NIL) + 7 comuni" | "3 comuni" | "Milano (4 NIL)". */
export function describeTerritoryCounts({ municipalityCount, nilCount, otherMunicipalityCount, hasMilano = nilCount > 0 }) {
  if (!municipalityCount) return "";
  const comuni = n => `${n} ${n === 1 ? "comune" : "comuni"}`;
  if (nilCount > 0) {
    const milano = `Milano (${nilCount} NIL)`;
    if (!otherMunicipalityCount) return `${comuni(municipalityCount)}: ${milano}`;
    return `${comuni(municipalityCount)}: ${milano} + ${comuni(otherMunicipalityCount)}`;
  }
  return comuni(municipalityCount);
}
