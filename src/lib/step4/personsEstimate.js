// "Persone stimate" (Step 4, 2026-11-23). Prima: famiglie x 2,4 (coefficiente
// fisso). Ora solo dati ISTAT reali:
//  - un PV: la popolazione ISTAT dell'area (dato del backend);
//  - piu' PV: per ogni PV il rapporto popolazione/famiglie ISTAT della sua
//    area, applicato alle sue famiglie UNICHE assegnate dal piano territoriale.
// Se manca anche un solo dato (o il rapporto non e' plausibile) -> null e la
// card non si mostra. Mai un coefficiente fisso.
const MIN_PERSONS_PER_FAMILY = 1;
const MAX_PERSONS_PER_FAMILY = 4;

const positive = v => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export function personsPerFamily(population, families) {
  const p = positive(population);
  const f = positive(families);
  if (p === null || f === null) return null;
  const ratio = p / f;
  return ratio >= MIN_PERSONS_PER_FAMILY && ratio <= MAX_PERSONS_PER_FAMILY ? ratio : null;
}

/**
 * @param {object} args
 * @param {number|null} args.singlePopulation  popolazione ISTAT dell'area (un PV)
 * @param {object|null} args.plan              piano multi-PV (buildMultiPvTerritoryPlan)
 * @param {Array}       args.zones             zone del riepilogo multi-PV (id, families, population)
 * @returns {{ value: number, method: "istat_area"|"istat_ratio_per_pv" } | null}
 */
export function estimateCampaignPersons({ singlePopulation = null, plan = null, zones = [] } = {}) {
  if (!plan) {
    const p = positive(singlePopulation);
    return p === null ? null : { value: Math.round(p), method: "istat_area" };
  }
  if (!plan.ready || !Array.isArray(plan.rows) || plan.rows.length === 0) return null;
  const byId = new Map((zones || []).map(z => [z?.id, z]));
  let total = 0;
  for (const row of plan.rows) {
    const zone = byId.get(row.id);
    const ratio = personsPerFamily(zone?.population, zone?.families);
    const families = Number(row.families);
    if (ratio === null || !Number.isFinite(families) || families < 0) return null;
    total += families * ratio;
  }
  return total > 0 ? { value: Math.round(total), method: "istat_ratio_per_pv" } : null;
}
