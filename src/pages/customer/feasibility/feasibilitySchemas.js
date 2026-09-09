export const SOURCES = ['campaign_existing', 'user_provided', 'model_assumption', 'benchmark', 'unavailable'];
export const SOURCE_LABELS = { campaign_existing: 'Preventivo VolantiniPro', user_provided: 'Dato fornito da te', model_assumption: 'Ipotesi di scenario', benchmark: 'Benchmark documentato', unavailable: 'Non disponibile' };
export const FIELDS = {
  businessType: { label: 'Tipo di attività', question: 'Parlaci della tua attività: di cosa ti occupi?', text: true, required: true },
  city: { label: 'Città / zona operativa', question: 'In quale città o zona opera la tua attività?', text: true, required: true },
  businessDescription: { label: 'Descrizione attività', text: true },
  averageCustomerRevenue: { label: 'Ricavo medio per nuovo cliente (€)', question: 'Qual è circa il ricavo medio di un nuovo cliente, in euro?', required: true },
  averageCustomerMargin: { label: 'Margine medio per nuovo cliente (€)', question: 'Quanto ti rimane per nuovo cliente dopo i costi variabili, in euro?', required: true },
  customerLifetimeValue: { label: 'Ricavo totale per cliente nel tempo — LTV (€)' },
  currentMonthlyCustomers: { label: 'Clienti mensili attuali', integer: true },
  campaignCost: { label: 'Costo campagna (€)', question: 'Qual è il costo complessivo della campagna, in euro?', required: true },
  flyerQuantity: { label: 'Quantità volantini', question: 'Quanti volantini prevedi di distribuire?', integer: true, positive: true, required: true },
  campaignArea: { label: 'Aree campagna', text: true },
  serviceType: { label: 'Servizio', text: true },
  targetNewCustomers: { label: 'Obiettivo nuovi clienti', question: 'Quanti nuovi clienti vorresti acquisire?', integer: true, required: true },
  marketingBudget: { label: 'Budget marketing (€)' },
  targetRevenue: { label: 'Obiettivo ricavi (€)' },
  knownConversionRate: { label: 'Conversione storica (%)', rate: true },
  knownCAC: { label: 'CAC storico (€)' },
  repeatPurchaseRate: { label: 'Ri-acquisto (%)', rate: true },
  scenarioConversionConservative: { label: 'Conversione prudente (%)', rate: true, required: true },
  scenarioConversionRealistic: { label: 'Conversione realistica (%)', rate: true, required: true },
  scenarioConversionGrowth: { label: 'Conversione crescita (%)', rate: true, required: true },
};
export const SCENARIO_KEYS = ['scenarioConversionConservative', 'scenarioConversionRealistic', 'scenarioConversionGrowth'];
export const cell = (value = null, source = 'unavailable') => ({ value, source });

// Italian input: grouping dots, decimal comma; decimal dot also accepted.
// Refuse multiple amounts, scientific notation and ambiguous mixed messages.
export function parseNumber(raw) {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const text = String(raw ?? '').trim();
  if (/\d\s*[eE][+-]?\d|Infinity|NaN|\bmila\b|\bmilion|\bmiliard|\d\s*[kK]\b/i.test(text)) return null;
  const tokens = text.match(/[-+]?\d+(?:[.,]\d+)*/g);
  if (!tokens || tokens.length !== 1) return null;
  let value = tokens[0];
  if (value.includes(',')) value = value.replace(/\./g, '').replace(',', '.');
  else if (/^[+-]?\d{1,3}(\.\d{3})+$/.test(value)) value = value.replace(/\./g, '');
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
export function normalizeField(key, raw, source = 'user_provided') {
  const spec = FIELDS[key];
  if (!spec || !SOURCES.includes(source)) return null;
  if (raw === '' || raw == null) return cell();
  let value = spec.text ? String(raw).trim().slice(0, 600) : parseNumber(raw);
  if (!spec.text && spec.rate && value !== null) value /= 100;
  return cell(value, value === '' ? 'unavailable' : source);
}
export function initialInputs(context) {
  const inputs = Object.fromEntries(Object.keys(FIELDS).map(key => [key, cell()]));
  [0.0003, 0.0005, 0.001].forEach((value, i) => { inputs[SCENARIO_KEYS[i]] = cell(value, 'model_assumption'); });
  if (context) {
    const values = { campaignCost: context.total, flyerQuantity: context.quantity, city: context.municipalities?.join(', '), campaignArea: context.areas?.join(', '), serviceType: context.service };
    for (const [key, value] of Object.entries(values)) if (value !== null && value !== undefined && value !== '') inputs[key] = cell(value, 'campaign_existing');
  }
  return inputs;
}
export function validationErrors(inputs, unusualMargin = false) {
  const errors = {};
  for (const [key, spec] of Object.entries(FIELDS)) {
    const value = inputs[key]?.value;
    if (value == null || value === '') { if (spec.required || (!spec.text && inputs[key]?.source !== 'unavailable')) errors[key] = 'Inserisci un dato numerico valido.'; continue; }
    if (spec.text) { if (typeof value !== 'string' || value.length > 600) errors[key] = 'Testo non valido.'; continue; }
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > (spec.rate ? 1 : 1e9) || (spec.positive && value <= 0) || (spec.integer && !Number.isInteger(value))) errors[key] = spec.rate ? 'Inserisci una percentuale tra 0 e 100.' : 'Inserisci un numero valido tra 0 e 1 miliardo' + (spec.integer ? ', intero.' : '.');
    if (!spec.rate && !spec.integer && Number.isFinite(value) && (Math.abs(value * 100 - Math.round(value * 100)) > 0.00001 || (value > 0 && value < 0.01))) errors[key] = 'Gli importi in euro possono avere al massimo due decimali.';
  }
  if (!unusualMargin && inputs.averageCustomerMargin?.value > inputs.averageCustomerRevenue?.value) errors.averageCustomerMargin = 'Il margine supera il ricavo. Correggi il dato o conferma esplicitamente il caso insolito.';
  const rates = SCENARIO_KEYS.map(key => inputs[key]?.value);
  if (rates[0] > rates[1] || rates[1] > rates[2]) errors.scenarioConversionRealistic = 'Mantieni prudente ≤ realistico ≤ crescita.';
  return errors;
}
export function nextMissing(inputs) {
  const errors = validationErrors(inputs, true);
  return Object.keys(FIELDS).find(key => FIELDS[key].question && errors[key]) || null;
}
export function scenariosFromHistory(inputs) {
  const rate = inputs.knownConversionRate?.value;
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) return inputs;
  const next = { ...inputs };
  [0.6, 1, 2].forEach((factor, i) => { next[SCENARIO_KEYS[i]] = cell(Math.min(1, rate * factor), 'model_assumption'); });
  return next;
}
