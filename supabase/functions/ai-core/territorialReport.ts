export type TerritorialReportResult = {
  summary: string;
  strengths: string[];
  risks: string[];
  recommendations: string[];
  warnings: string[];
  sources: string[];
};

const FORBIDDEN_KEYS = /(^|_)(lat|lng|latitude|longitude|coordinates?|geometry|geom|raw|email|phone|telephone|mobile|token|secret|user_id|customer_id|operator_id|driver_id)$/i;
// Le chiavi dello snapshot bloccano gia' telefono/coordinate. Nell'output i
// numeri sono ammessi solo se grounded nello snapshot: una regex telefonica
// generica scambierebbe popolazioni it-IT come "1.365.698" per PII.
const PII_PATTERN = /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i;

function keysAreSafe(value: unknown): boolean {
  if (Array.isArray(value)) return value.every(keysAreSafe);
  if (typeof value === "number") return Number.isFinite(value);
  if (!value || typeof value !== "object") return true;
  return Object.entries(value as Record<string, unknown>).every(([key, child]) => !FORBIDDEN_KEYS.test(key) && keysAreSafe(child));
}

export function validateTerritorialReportSnapshot(snapshot: any): boolean {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot) || !keysAreSafe(snapshot)) return false;
  if (snapshot.schemaVersion !== 1 || typeof snapshot.generatedAt !== "string") return false;
  if (!snapshot.territory || !snapshot.demographics || !snapshot.campaign || !snapshot.poi || !snapshot.mobility) return false;
  if (!Array.isArray(snapshot.warnings) || !Array.isArray(snapshot.sources)) return false;
  if (snapshot.sources.length > 30 || !snapshot.sources.every((source: unknown) => typeof source === "string" && source.length <= 160)) return false;
  if (!Array.isArray(snapshot.territory.selectedNames) || snapshot.territory.selectedNames.length > 50) return false;
  if (snapshot.poi.available === false && (snapshot.poi.total !== null || snapshot.poi.sectors !== null)) return false;
  if (snapshot.poi.sectors !== null && (!Array.isArray(snapshot.poi.sectors) || snapshot.poi.sectors.length > 50)) return false;
  return true;
}

const emptyResult = (summary: string, warnings: string[] = [], sources: string[] = []): TerritorialReportResult => ({
  summary,
  strengths: [],
  risks: [],
  recommendations: [],
  warnings,
  sources,
});

export function deterministicTerritorialReportResponse(snapshot: any, question: string): TerritorialReportResult | null {
  const sourceList = Array.isArray(snapshot?.sources) ? snapshot.sources : [];
  if (!snapshot?.territory?.name || !snapshot?.campaign?.service) {
    return emptyResult("Dati insufficienti per generare un'analisi affidabile.", ["TERRITORIAL_DATA_INSUFFICIENT"]);
  }

  const populationClaim = question.match(/(?:ci sono|sono|ha)\s+([\d.,]+)\s*(milion[ei])?\s*(?:di\s+)?abitanti/i);
  if (populationClaim) {
    const rawClaim = populationClaim[1].replace(/\./g, "").replace(",", ".");
    const claimed = Number(rawClaim) * (populationClaim[2] ? 1_000_000 : 1);
    const actual = snapshot?.demographics?.population;
    if (typeof actual !== "number") return emptyResult("Dato non disponibile: la popolazione non è presente nello snapshot.", ["POPULATION_NOT_AVAILABLE"]);
    return emptyResult(
      claimed === actual ? `Sì. La popolazione disponibile nello snapshot è ${actual}.` : `No. La popolazione disponibile nello snapshot è ${actual}.`,
      [],
      snapshot?.demographics?.provenance || [],
    );
  }

  if (/farmaci|settori commerciali|attivit[aà]|\bpoi\b/i.test(question) && snapshot?.poi?.available !== true) {
    return emptyResult("Dati POI non disponibili.", ["POI_DATA_NOT_AVAILABLE"]);
  }
  if (/reddito/i.test(question)) {
    return emptyResult("Dato non disponibile: il reddito medio non è presente nello snapshot.", ["INCOME_NOT_AVAILABLE"]);
  }
  if (/quantit[aà].*(sufficient|necessar|required|serve)|quanto.*serve/i.test(question) && snapshot?.campaign?.requiredQuantity == null) {
    return emptyResult("Dato non disponibile: il fabbisogno operativo non è presente nello snapshot.", ["REQUIRED_QUANTITY_NOT_AVAILABLE"]);
  }
  return null;
}

export function buildTerritorialReportSystemPrompt(allowedSources: string[]) {
  return [
    "Sei l'analista del Report Territoriale VolantiniPro. Produci un'analisi esclusivamente read-only.",
    "Usa esclusivamente i dati nello snapshot. Non inventare numeri, attività commerciali, densità, popolazione, POI, quartieri o fonti.",
    "Se un dato manca dichiaralo. Evita falsa precisione e non presentare una stima o un calcolo interno come dato ufficiale.",
    "Distingui fatti da raccomandazioni. currentQuantity/currentCoverage descrivono lo scenario attuale; recommendedQuantity/recommendedCoverage descrivono lo scenario consigliato. Gli alias quantityAssigned, requiredQuantity ed estimatedCoverage non devono essere scambiati.",
    "Se poi.available è false, scrivi 'Dati POI non disponibili': non affermare che i POI sono zero o che non esistono attività.",
    "Preserva territory.analysisLevel; per Milano non inventare NIL o quartieri non presenti in territory.selectedNames.",
    `Nel campo sources usa soltanto queste fonti effettivamente presenti nello snapshot: ${JSON.stringify(allowedSources)}. Se la lista è vuota, sources deve essere vuoto.`,
    "Non usare numeri come marcatori di elenco.",
    'Restituisci solo JSON valido: {"summary":string,"strengths":string[],"risks":string[],"recommendations":string[],"warnings":string[],"sources":string[]}.',
  ].join(" ");
}

export function buildTerritorialReportUserPrompt(snapshot: Record<string, unknown>, question: string) {
  return `Snapshot territoriale con provenienza interna:\n${JSON.stringify(snapshot)}\n\nRichiesta: ${JSON.stringify(question)}`;
}

export function validateTerritorialReportAiResult(value: any, snapshot: any): value is TerritorialReportResult {
  if (!value || typeof value !== "object" || typeof value.summary !== "string" || !value.summary.trim()) return false;
  const arrays = [value.strengths, value.risks, value.recommendations, value.warnings, value.sources];
  if (!arrays.every(Array.isArray)) return false;
  if ([value.strengths, value.risks, value.recommendations, value.warnings].some((items: unknown[]) => items.length > 12)) return false;
  if (![...value.strengths, ...value.risks, ...value.recommendations, ...value.warnings, ...value.sources].every((item) => typeof item === "string" && item.length <= 400)) return false;
  const allowedSources = new Set(Array.isArray(snapshot?.sources) ? snapshot.sources : []);
  if (!value.sources.every((source: string) => allowedSources.has(source))) return false;
  return !PII_PATTERN.test([value.summary, ...value.strengths, ...value.risks, ...value.recommendations, ...value.warnings].join(" "));
}

export function territorialReportNumbersAreGrounded(value: TerritorialReportResult, snapshot: unknown): boolean {
  const normalizeNumber = (token: string) => {
    const raw = token.trim();
    if (/^-?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(raw)) return raw.replace(/\./g, "").replace(",", ".");
    return raw.replace(",", ".");
  };
  const snapshotNumbers = new Set((JSON.stringify(snapshot).match(/-?\d+(?:[.,]\d+)?/g) || []).map(normalizeNumber));
  const output = [value.summary, ...value.strengths, ...value.risks, ...value.recommendations, ...value.warnings].join(" ");
  const outputNumbers = output.match(/-?\d{1,3}(?:\.\d{3})+(?:,\d+)?|-?\d+(?:[.,]\d+)?/g) || [];
  return outputNumbers.every((item) => snapshotNumbers.has(normalizeNumber(item)));
}
