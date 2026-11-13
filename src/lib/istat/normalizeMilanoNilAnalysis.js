// Milano: famiglie e abitanti dei NIL allineati al dato ISTAT del comune.
//
// analysis-istat (RPC get_nil_breakdown_in_radius) ripartisce il totale ISTAT
// di Milano sui NIL in base alla superficie, ma i confini NIL superano il
// confine ISTAT di circa lo 0,3%: la somma degli 88 NIL fa 744.299 invece di
// 741.887. Questa funzione sostituisce il totale di ogni NIL con la quota
// riproporzionata (src/lib/istat/milanoNilIstatShares.json, somma esatta
// 741.887 famiglie / 1.365.698 abitanti, resto maggiore) e conserva la quota
// del NIL dentro il raggio calcolata dal backend.
//
// - Idempotente: applicata due volte da' lo stesso risultato; dopo la
//   migration SQL (stessa ripartizione nel database) non cambia nulla.
// - Volantini: la quantita' dei NIL della risposta e' round(famiglie x 1,1) sul
//   loro totale, ripartita sui NIL con il resto maggiore, quindi "tutto
//   Milano" = round(741.887 x 1,1) = 816.076 e ogni NIL ~ famiglie x 1,1.
// - Le righe non-NIL (altri comuni) restano identiche.
// - Pura: restituisce un nuovo oggetto, non modifica l'input.
import SHARES from './milanoNilIstatShares.json' with { type: 'json' };
import { largestRemainder } from './largestRemainder.js';
import { FLYERS_PER_HOUSEHOLD } from './milanoIstatTotals.js';

export const MILANO_NIL_NORMALIZATION_VERSION = SHARES.version;

const finite = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
// Tolleranza (unita') per riconoscere un valore NIL atteso: il valore del
// database da cui e' nata la tabella (scarto misurato <= 0,6) oppure il valore
// gia' normalizzato (dopo la migration SQL). Qualunque altro valore (es. un
// nuovo anno ISTAT importato nel database) NON viene sovrascritto: la riga resta
// com'e' e metadata.milano_nil_istat_mismatch lo segnala (tabella da rigenerare).
const MATCH_TOLERANCE = 2;
const DB_FACTOR_H = SHARES.databaseNilSum.households / SHARES.totals.households;
const DB_FACTOR_P = SHARES.databaseNilSum.population / SHARES.totals.population;
function matchesShare(row, share) {
  const h = Number(row.households_total);
  const p = Number(row.population_total);
  const near = (v, target) => Number.isFinite(v) && Math.abs(v - target) <= MATCH_TOLERANCE;
  return (near(h, share.households) && near(p, share.population))
    || (near(h, share.households * DB_FACTOR_H) && near(p, share.population * DB_FACTOR_P));
}

const isNilRow = (row) => row && (row.territory_level === 'nil' || (row.territory_level == null && row.nil_code != null));
const nilKey = (row) => String(row?.nil_code ?? '').trim();

function normalizeRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return { rows, changed: false, deltaFamilies: 0, deltaPopulation: 0 };
  let changed = false;
  let deltaFamilies = 0;
  let deltaPopulation = 0;
  let mismatches = 0;
  const normalized = new Set();
  const next = rows.map((row) => {
    const share = isNilRow(row) ? SHARES.nils[nilKey(row)] : null;
    if (!share) return row;
    if (!matchesShare(row, share)) {
      mismatches += 1;
      return row;
    }
    normalized.add(nilKey(row));
    const oldTotal = finite(row.households_total);
    const oldIn = finite(row.households_in_radius);
    const oldPopTotal = finite(row.population_total);
    const oldPopIn = finite(row.population_in_radius);
    // Quota del NIL nel raggio decisa dal backend (1 = NIL intero).
    const ratio = oldTotal > 0 && oldIn != null ? Math.min(1, Math.max(0, oldIn / oldTotal)) : Math.min(1, Math.max(0, (finite(row.pct_copertura) ?? 100) / 100));
    const popRatio = oldPopTotal > 0 && oldPopIn != null ? Math.min(1, Math.max(0, oldPopIn / oldPopTotal)) : ratio;
    const householdsIn = ratio >= 1 ? share.households : Math.round(share.households * ratio);
    const populationIn = popRatio >= 1 ? share.population : Math.round(share.population * popRatio);
    const area = finite(row.area_km2);
    const out = {
      ...row,
      households_total: share.households,
      households_in_radius: householdsIn,
      population_total: share.population,
      population_in_radius: populationIn,
      ...(area > 0 ? { density_per_km2: Math.round((share.population / area) * 100) / 100 } : {}),
    };
    deltaFamilies += householdsIn - (oldIn ?? 0);
    deltaPopulation += populationIn - (oldPopIn ?? 0);
    if (out.households_total !== row.households_total || out.households_in_radius !== row.households_in_radius
      || out.population_total !== row.population_total || out.population_in_radius !== row.population_in_radius) changed = true;
    return out;
  });
  // Volantini dei NIL: round(somma famiglie x 1,1) ripartito con il resto maggiore.
  const nilRows = next.filter((row) => isNilRow(row) && normalized.has(nilKey(row)));
  if (nilRows.length > 0) {
    const familiesSum = nilRows.reduce((s, r) => s + r.households_in_radius, 0);
    const flyers = largestRemainder(Math.round(familiesSum * FLYERS_PER_HOUSEHOLD), nilRows.map((r) => ({ key: nilKey(r), weight: r.households_in_radius })));
    for (let i = 0; i < next.length; i += 1) {
      const row = next[i];
      if (!isNilRow(row) || !normalized.has(nilKey(row))) continue;
      const v = flyers.get(nilKey(row));
      if (row.volantini_nel_raggio !== v) changed = true;
      next[i] = { ...row, volantini_nel_raggio: v };
    }
  }
  return { rows: next, changed, deltaFamilies, deltaPopulation, mismatches };
}

/** Risposta di analysis-istat con i NIL di Milano allineati al dato ISTAT del comune. */
export function normalizeMilanoNilAnalysis(data) {
  if (!data || typeof data !== 'object' || data.error) return data;
  const main = normalizeRows(data.comuni_breakdown);
  const nil = normalizeRows(data.nil_breakdown);
  const mismatches = (main.mismatches || 0) + (nil.mismatches || 0);
  if (!main.changed && !nil.changed) {
    return mismatches > 0 ? { ...data, metadata: { ...(data.metadata || {}), milano_nil_istat_mismatch: mismatches } } : data;
  }
  const values = data.values && typeof data.values === 'object' ? { ...data.values } : data.values;
  // I totali seguono comuni_breakdown (come in analysis-istat): solo la parte NIL cambia.
  if (values && main.changed) {
    const fam = finite(values.famiglie_stimate);
    const pop = finite(values.popolazione_stimata);
    if (fam != null) {
      values.famiglie_stimate = Math.max(0, Math.round(fam + main.deltaFamilies));
      values.volantini_consigliati = Math.round(values.famiglie_stimate * FLYERS_PER_HOUSEHOLD);
    }
    if (pop != null) values.popolazione_stimata = Math.max(0, Math.round(pop + main.deltaPopulation));
  }
  return {
    ...data,
    ...(values !== undefined ? { values } : {}),
    ...(Array.isArray(data.comuni_breakdown) ? { comuni_breakdown: main.rows } : {}),
    ...(Array.isArray(data.nil_breakdown) ? { nil_breakdown: nil.rows } : {}),
    metadata: { ...(data.metadata || {}), milano_nil_istat_normalized: MILANO_NIL_NORMALIZATION_VERSION, ...(mismatches > 0 ? { milano_nil_istat_mismatch: mismatches } : {}) },
  };
}
