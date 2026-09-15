// Modello dati "Dati economici" (Business Mode) — ticket "UPGRADE FATTIBILITÀ
// DELLA MIA ATTIVITÀ: FULL TERRITORIAL + ECONOMIC FEASIBILITY STUDY".
// Additivo: non modifica i campi/formule del motore territoriale esistente
// (feasibilityBusinessSchemas.js, feasibilityBusinessEngine.js) — questo
// modello alimenta SOLO il nuovo motore economico
// (feasibilityBusinessFinancialEngine.js).

// ── Tipi di attività supportati (§3) — solo per etichette/unità di misura.
// Le formule economiche restano generiche (ricavo medio per cliente ×
// clienti − costi): qui si sceglie SOLO il vocabolario più naturale per il
// tipo di attività dichiarato, mai una formula diversa e nascosta.
export const BUSINESS_UNIT_PROFILES = {
  gym: {
    match: /palestr|fitness|gym|centro sportivo|centro sport/i,
    customerLabel: 'iscritti/membri',
    priceLabel: 'Abbonamento mensile medio (€)',
    launchLabel: 'Iscritti attesi al lancio',
    target12moLabel: 'Iscritti attesi dopo 12 mesi',
  },
  restaurant: {
    match: /ristorant|pizzeria|trattoria|osteria|bar\b|caff|pub|food/i,
    customerLabel: 'clienti/coperti',
    priceLabel: 'Scontrino medio (€)',
    launchLabel: 'Coperti/giorno attesi al lancio',
    target12moLabel: 'Coperti/giorno attesi dopo 12 mesi',
  },
  retail: {
    match: /negozio|abbigliamento|retail|boutique|supermercat|alimentar/i,
    customerLabel: 'clienti',
    priceLabel: 'Scontrino medio (€)',
    launchLabel: 'Clienti/mese attesi al lancio',
    target12moLabel: 'Clienti/mese attesi dopo 12 mesi',
  },
  professional: {
    match: /studio professionale|commercialista|avvocato|legale|consulen|studio medic|dentist/i,
    customerLabel: 'clienti',
    priceLabel: 'Onorario medio per pratica (€)',
    launchLabel: 'Clienti/mese attesi al lancio',
    target12moLabel: 'Clienti/mese attesi dopo 12 mesi',
  },
  beauty: {
    match: /centro estetic|parrucchier|beauty|estetista|wellness|spa/i,
    customerLabel: 'clienti',
    priceLabel: 'Trattamento medio (€)',
    launchLabel: 'Clienti/mese attesi al lancio',
    target12moLabel: 'Clienti/mese attesi dopo 12 mesi',
  },
  ecommerce: {
    match: /ecommerce|e-commerce|negozio online|shop online/i,
    customerLabel: 'ordini',
    priceLabel: 'Valore medio ordine (€)',
    launchLabel: 'Ordini/mese attesi al lancio',
    target12moLabel: 'Ordini/mese attesi dopo 12 mesi',
  },
  marketplace: {
    match: /marketplace|piattaforma|platform/i,
    customerLabel: 'transazioni',
    priceLabel: 'Valore medio transazione (€)',
    launchLabel: 'Transazioni/mese attese al lancio',
    target12moLabel: 'Transazioni/mese attese dopo 12 mesi',
  },
  service: {
    match: /servizio|manutenzione|riparazion|pulizie|lavanderia/i,
    customerLabel: 'clienti',
    priceLabel: 'Prezzo medio per intervento (€)',
    launchLabel: 'Clienti/mese attesi al lancio',
    target12moLabel: 'Clienti/mese attesi dopo 12 mesi',
  },
};

const DEFAULT_UNIT_PROFILE = {
  customerLabel: 'clienti',
  priceLabel: 'Prezzo medio prodotto/servizio (€)',
  launchLabel: 'Clienti attesi al lancio',
  target12moLabel: 'Clienti attesi dopo 12 mesi',
};

export function businessUnitProfile(businessType) {
  const text = String(businessType || '').trim();
  if (!text) return DEFAULT_UNIT_PROFILE;
  for (const key of Object.keys(BUSINESS_UNIT_PROFILES)) {
    const profile = BUSINESS_UNIT_PROFILES[key];
    if (profile.match.test(text)) return { ...DEFAULT_UNIT_PROFILE, ...profile };
  }
  return DEFAULT_UNIT_PROFILE;
}

// ── Campi economici (§2) ────────────────────────────────────────────────────
// `required: true` = necessario per il calcolo di pareggio/ROI. Gli altri
// sono facoltativi: se assenti, il motore economico usa una stima
// conservativa esplicitamente etichettata "Stima del modello" (mai "Dato
// fornito da te"), oppure lascia il relativo output "Dato non disponibile"
// quando non esiste una base minima per stimare (mai un numero inventato
// senza etichetta).
export const FINANCIAL_FIELDS = {
  initialInvestment: { label: 'Investimento iniziale (€)', required: true },
  monthlyRent: { label: 'Affitto mensile (€)', required: true },
  staffCount: { label: 'Personale / numero addetti', required: true },
  monthlyStaffCost: { label: 'Costo mensile personale (€)', required: false, estimableFrom: 'staffCount' },
  otherFixedCostsMonthly: { label: 'Altri costi fissi mensili (€)', required: false },
  variableCostPct: { label: 'Costi variabili medi (% del ricavo)', required: false },
  averagePrice: { label: 'Prezzo medio prodotto/servizio (€)', required: true },
  averageCustomerRevenue: { label: 'Ricavo medio mensile per cliente (€)', required: false, estimableFrom: 'averagePrice' },
  grossMarginPct: { label: 'Margine lordo medio per cliente (%)', required: false, estimableFrom: 'variableCostPct' },
  launchCustomers: { label: 'Clienti attesi al lancio', required: true },
  targetCustomers12mo: { label: 'Clienti attesi dopo 12 mesi', required: true },
  monthlyGrowthPct: { label: 'Crescita mensile prevista (%)', required: false },
  otherMonthlyRevenue: { label: 'Altri ricavi mensili', required: false },
  availableCapital: { label: 'Capitale disponibile (€)', required: false },
};

// Il set di default vive in feasibilityBusinessSchemas.js#initialBusinessInputs
// (stesso oggetto piatto `businessInputs`, cosi' il restore da sessionStorage
// in feasibilityStorage.js copre anche questi campi senza modifiche allo storage).

function toNum(value) {
  if (value === '' || value == null) return null;
  const n = Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

// Solo i 4 campi realmente indispensabili per un pareggio minimamente
// significativo: investimento, affitto, prezzo medio, clienti al lancio+12mesi.
// Tutto il resto è stimabile/opzionale (§2 del ticket: "Non lo so" -> stima).
export function financialValidationErrors(inputs) {
  const errors = {};
  if (toNum(inputs.initialInvestment) == null || toNum(inputs.initialInvestment) < 0) errors.initialInvestment = 'Inserisci un investimento iniziale valido (0 se nessuno).';
  if (toNum(inputs.monthlyRent) == null || toNum(inputs.monthlyRent) < 0) errors.monthlyRent = 'Inserisci un affitto mensile valido (0 se nessuno).';
  if (toNum(inputs.averagePrice) == null || toNum(inputs.averagePrice) <= 0) errors.averagePrice = 'Inserisci un prezzo medio valido (numero > 0).';
  if (toNum(inputs.launchCustomers) == null || toNum(inputs.launchCustomers) < 0) errors.launchCustomers = `Indica ${inputs.launchCustomers === '' ? 'una stima' : 'un numero valido'} di clienti attesi al lancio.`;
  if (toNum(inputs.targetCustomers12mo) == null || toNum(inputs.targetCustomers12mo) < 0) errors.targetCustomers12mo = 'Indica una stima di clienti attesi dopo 12 mesi.';
  return errors;
}

export function isFinancialInputsComplete(inputs) {
  return Object.keys(financialValidationErrors(inputs)).length === 0;
}

export const FINANCIAL_DISCLAIMER = 'Le proiezioni economiche sono stime basate sui dati forniti e sulle ipotesi indicate. Non costituiscono consulenza finanziaria, fiscale o garanzia di risultati.';
