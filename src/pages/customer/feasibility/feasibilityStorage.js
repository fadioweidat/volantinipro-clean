import { feasibilityContext } from '../../../lib/feasibility/entryPoint.js';
import { FIELDS, SOURCES, initialInputs } from './feasibilitySchemas.js';
import { initialBusinessInputs } from './business/feasibilityBusinessSchemas.js';

export const STORAGE_KEY = 'vp_feasibility_session_v2';

// feasibilityMode: null (scelta non ancora fatta) | 'business' | 'campaign'.
// Additivo: nessun campo esistente rimosso, mai inferito da campi mancanti
// (§1) — resta null finché l'utente non sceglie esplicitamente.
export function readFeasibility(browser) {
  const context = browser?.history?.state?.feasibility ? feasibilityContext(browser.history.state.feasibility) : null;
  // FAST PATH (ticket "CAMPAIGN FEASIBILITY PREFILL" §5/§6): un contesto
  // collegato (preventivo/campagna) salta la conversazione a fasi (phase 0)
  // e apre direttamente il riepilogo prefillato (phase 1) — i campi noti
  // sono già in sola lettura lì, restano da compilare solo quelli economici
  // mancanti. SENZA contesto (homepage standalone, §6) il flusso resta quello
  // storico a partire da phase 0: nessuna regressione.
  const initial = { context, inputs: initialInputs(context), unusualMargin: false, phase: context ? 1 : 0, mode: 'campaign', contextSource: null, businessInputs: initialBusinessInputs() };
  // Scelta esplicita da un CTA (homepage §1/§6): history.state.feasibilityMode
  // vince sempre su una sessione salvata precedente — e' il segnale piu'
  // fresco dell'intento dell'utente in questa navigazione, evita di dover
  // rimostrare la schermata di scelta dopo un click mirato. Applicato PRIMA
  // di ogni return (anche quello anticipato sotto) cosi' vince sempre.
  const requestedMode = browser?.history?.state?.feasibilityMode;
  if (requestedMode === 'business' || requestedMode === 'campaign') initial.mode = requestedMode;
  // Sorgente esplicita dell'apertura (ticket §1): MAI inferita da quali campi
  // sono presenti nel context, dichiarata dal chiamante (openFeasibility) e
  // letta qui allo stesso modo di feasibilityMode.
  const requestedSource = browser?.history?.state?.contextSource;
  if (['quote', 'campaign', 'dashboard', 'order'].includes(requestedSource)) initial.contextSource = requestedSource;
  try {
    const saved = JSON.parse(browser?.sessionStorage?.getItem(STORAGE_KEY) || 'null');
    if (saved?.version !== 2 || saved.contextKey !== JSON.stringify(context) || Date.now() - saved.savedAt > 86400000) return initial;
    for (const key of Object.keys(FIELDS)) {
      const item = saved.inputs?.[key];
      if (initial.inputs[key].source === 'campaign_existing') continue;
      if (item && ['user_provided', 'model_assumption', 'unavailable'].includes(item.source) && (item.value === null || (FIELDS[key].text ? typeof item.value === 'string' && item.value.length <= 600 : typeof item.value === 'number' && Number.isFinite(item.value)))) initial.inputs[key] = { value: item.value, source: item.source };
    }
    initial.unusualMargin = saved.unusualMargin === true;
    // Re-open review after refresh; no automatic AI calls or stale reports.
    // Rispetta sempre la fase salvata esplicitamente: se l'utente e' tornato
    // volutamente alla conversazione (phase 0, es. "Torna alla conversazione"
    // dal riepilogo) un refresh non deve rimandarlo forzatamente al riepilogo
    // solo perche' esiste un contesto collegato.
    initial.phase = saved.phase > 0 ? 1 : 0;
    if (saved.mode === 'business' || saved.mode === 'campaign') initial.mode = saved.mode;
    if (['quote', 'campaign', 'dashboard', 'order'].includes(saved.contextSource)) initial.contextSource = saved.contextSource;
    if (saved.businessInputs && typeof saved.businessInputs === 'object') {
      const restored = initialBusinessInputs();
      for (const key of Object.keys(restored)) {
        const value = saved.businessInputs[key];
        if (typeof value === 'string' && value.length <= 600) restored[key] = value;
      }
      initial.businessInputs = restored;
    }
  } catch { /* Storage unavailable/corrupt: use current campaign snapshot. */ }
  // Ri-applicato: il ramo sopra (riga ~34, saved.mode) puo' aver sovrascritto
  // initial.mode con la preferenza SALVATA — la richiesta esplicita corrente
  // deve comunque vincere anche in quel caso.
  if (requestedMode === 'business' || requestedMode === 'campaign') initial.mode = requestedMode;
  if (['quote', 'campaign', 'dashboard', 'order'].includes(requestedSource)) initial.contextSource = requestedSource;
  return initial;
}
export function saveFeasibility(browser, state) {
  try {
    const inputs = Object.fromEntries(Object.entries(state.inputs).filter(([key, item]) => FIELDS[key] && SOURCES.includes(item.source)).map(([key, item]) => [key, { value: item.value, source: item.source }]));
    browser.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, contextKey: JSON.stringify(state.context), inputs, unusualMargin: state.unusualMargin, phase: state.phase, mode: state.mode ?? null, contextSource: state.contextSource ?? null, businessInputs: state.businessInputs ?? initialBusinessInputs(), savedAt: Date.now() }));
    return true;
  } catch { return false; }
}
