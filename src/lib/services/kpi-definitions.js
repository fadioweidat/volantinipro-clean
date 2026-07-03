// Human-readable Italian labels for the AI/analysis KPI keys (reachScore,
// roiScore, confidence) used across Step2/Step4 score cards. Kept consistent
// with the equivalent inline labels used elsewhere in the app (e.g. d2dScores).
const KPI_LABELS = {
  reachScore: "Potenziale copertura",
  roiScore: "Efficienza campagna",
  confidence: "Affidabilità stima",
};

export function kpiLabel(key) {
  return KPI_LABELS[key] || key;
}
