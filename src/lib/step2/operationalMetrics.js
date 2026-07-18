export const D2D_DAILY_CAPACITY = 4000;

export const OPERATIONAL_SCORE_THRESHOLDS = Object.freeze({ high: 78, medium: 58 });

const SCORE_DEFINITIONS = Object.freeze([
  {
    key: "families",
    name: "Famiglie raggiungibili",
    max: 34,
    calculate: value => Math.min(34, value / 900),
    formatInput: value => `${Math.round(value).toLocaleString("it-IT")} famiglie`,
    description: "Premia una base familiare sufficiente per una distribuzione capillare.",
  },
  {
    key: "density",
    name: "Densità abitativa",
    max: 26,
    calculate: value => Math.min(26, value / 180),
    formatInput: value => `${Math.round(value).toLocaleString("it-IT")} ab./km²`,
    description: "Stima l'efficienza di percorrenza nel territorio.",
  },
  {
    key: "coverage",
    name: "Copertura",
    max: 24,
    calculate: value => Math.min(24, value / 4),
    formatInput: value => `${value.toLocaleString("it-IT", { maximumFractionDigits: 1 })}%`,
    description: "Misura la quota di fabbisogno coperta dalla configurazione.",
  },
  {
    key: "comuniCount",
    name: "Territori coinvolti",
    max: 16,
    calculate: value => Math.min(16, value * 4),
    formatInput: value => `${Math.round(value)} ${Math.round(value) === 1 ? "territorio" : "territori"}`,
    description: "Considera l'ampiezza territoriale della selezione.",
  },
]);

function safeNonNegative(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

export function classifyOperationalScore(score) {
  const safeScore = Math.max(0, Math.min(100, Math.round(Number(score) || 0)));
  if (safeScore >= OPERATIONAL_SCORE_THRESHOLDS.high) return "high";
  if (safeScore >= OPERATIONAL_SCORE_THRESHOLDS.medium) return "medium";
  return "low";
}

export function calculateOperationalScore(input = {}) {
  const rawComponents = SCORE_DEFINITIONS.map(definition => {
    const inputValue = safeNonNegative(input[definition.key]);
    return {
      key: definition.key,
      name: definition.name,
      inputValue,
      inputLabel: definition.formatInput(inputValue),
      contribution: Math.max(0, Math.min(definition.max, definition.calculate(inputValue))),
      max: definition.max,
      description: definition.description,
    };
  });
  const score = Math.max(0, Math.min(100, Math.round(rawComponents.reduce((sum, item) => sum + item.contribution, 0))));
  const roundedDownTotal = rawComponents.reduce((sum, item) => sum + Math.floor(item.contribution), 0);
  const bonuses = new Set(rawComponents
    .map((item, index) => ({ index, fraction: item.contribution - Math.floor(item.contribution) }))
    .sort((a, b) => b.fraction - a.fraction)
    .slice(0, Math.max(0, score - roundedDownTotal))
    .map(item => item.index));
  const components = rawComponents.map((item, index) => ({
    ...item,
    contribution: Math.floor(item.contribution) + (bonuses.has(index) ? 1 : 0),
  }));
  return { score, classification: classifyOperationalScore(score), components };
}

export function estimateOperationalDays(quantity, dailyCapacity = D2D_DAILY_CAPACITY, operatorCount = null) {
  const safeQuantity = safeNonNegative(quantity);
  const safeCapacity = safeNonNegative(dailyCapacity);
  const safeOperators = Number.isFinite(Number(operatorCount)) && Number(operatorCount) > 0
    ? Math.max(1, Math.floor(Number(operatorCount)))
    : null;
  const totalDailyCapacity = safeCapacity > 0 && safeOperators ? safeCapacity * safeOperators : 0;
  return {
    quantity: Math.round(safeQuantity),
    dailyCapacity: safeCapacity,
    operatorCount: safeOperators,
    totalDailyCapacity,
    operatorDays: safeCapacity > 0 && safeQuantity > 0 ? safeQuantity / safeCapacity : null,
    quotient: totalDailyCapacity > 0 ? safeQuantity / totalDailyCapacity : null,
    days: safeQuantity > 0 && totalDailyCapacity > 0 ? Math.ceil(safeQuantity / totalDailyCapacity) : null,
  };
}

export function resolveAssignedQuantity({ insertedQuantity = 0, recommendedQuantity = 0, manualQuantity = 0, decision = "keepCurrent" } = {}) {
  const inserted = Math.round(safeNonNegative(insertedQuantity));
  const recommended = Math.round(safeNonNegative(recommendedQuantity));
  const manual = Math.round(safeNonNegative(manualQuantity));
  if (decision === "useRecommended" && recommended > 0) return recommended;
  if (decision === "manual" && manual > 0) return manual;
  return inserted;
}

export function buildOperationalAdvice({
  score = 0,
  coverage = 0,
  assignedQuantity = 0,
  recommendedQuantity = 0,
  density = null,
  territoryCount = 0,
  hasPartialTerritorialData = false,
} = {}) {
  const classification = classifyOperationalScore(score);
  const safeCoverage = safeNonNegative(coverage);
  const assigned = safeNonNegative(assignedQuantity);
  const recommended = safeNonNegative(recommendedQuantity);
  const shortage = Math.max(0, recommended - assigned);
  const surplus = Math.max(0, assigned - recommended);
  const quantitySufficient = recommended > 0 && shortage === 0;
  const coverageComplete = safeCoverage >= 99.5 && quantitySufficient;
  const densityValue = Number(density);
  const lowDensity = Number.isFinite(densityValue) && densityValue > 0 && densityValue < 3000;
  const complexTerritory = safeNonNegative(territoryCount) > 2;

  let summary;
  if (!quantitySufficient || safeCoverage < 99.5) {
    summary = shortage > 0
      ? `La configurazione non copre interamente il fabbisogno: mancano ${Math.round(shortage).toLocaleString("it-IT")} volantini.`
      : "La configurazione presenta una copertura territoriale parziale.";
  } else if (classification === "low") {
    summary = "La configurazione copre interamente il territorio, ma l'efficienza operativa è bassa. Puoi procedere considerando tempi o costi operativi superiori.";
  } else if (classification === "medium") {
    summary = "La configurazione è adeguata. Sono presenti alcuni fattori operativi da monitorare.";
  } else {
    summary = "La configurazione presenta una buona compatibilità operativa e copre interamente il territorio.";
  }

  const factors = [];
  if (lowDensity) factors.push("densità contenuta e maggiori tempi di percorrenza");
  if (complexTerritory) factors.push("più territori da coordinare");
  if (surplus > 0) factors.push(`${Math.round(surplus).toLocaleString("it-IT")} volantini oltre il fabbisogno stimato`);
  if (shortage > 0) factors.push(`${Math.round(shortage).toLocaleString("it-IT")} volantini mancanti`);
  if (hasPartialTerritorialData) factors.push("alcuni dati territoriali non disponibili");
  if (factors.length === 0 && coverageComplete) factors.push("copertura e quantità coerenti con il fabbisogno stimato");

  return { classification, coverageComplete, quantitySufficient, shortage, surplus, factors, summary };
}
