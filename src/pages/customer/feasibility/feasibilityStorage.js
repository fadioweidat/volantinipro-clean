import { feasibilityContext } from '../../../lib/feasibility/entryPoint.js';
import { FIELDS, SOURCES, initialInputs } from './feasibilitySchemas.js';
import { initialBusinessInputs } from './business/feasibilityBusinessSchemas.js';

export const STORAGE_KEY = 'vp_feasibility_session_v2';

// feasibilityMode: null (scelta non ancora fatta) | 'business' | 'campaign'.
// Additivo: nessun campo esistente rimosso, mai inferito da campi mancanti
// (§1) — resta null finché l'utente non sceglie esplicitamente.
export function readFeasibility(browser) {
  const context = browser?.history?.state?.feasibility ? feasibilityContext(browser.history.state.feasibility) : null;
  // Default 'campaign' preserva l'esperienza esistente su questa rotta
  // (entry point storici: home CTA, Step4 card) — la scelta esplicita (§1)
  // resta comunque raggiungibile via link nell'header o "Cambia tipo di analisi".
  const initial = { context, inputs: initialInputs(context), unusualMargin: false, phase: 0, mode: 'campaign', businessInputs: initialBusinessInputs() };
  // Scelta esplicita da un CTA (homepage §1/§6): history.state.feasibilityMode
  // vince sempre su una sessione salvata precedente — e' il segnale piu'
  // fresco dell'intento dell'utente in questa navigazione, evita di dover
  // rimostrare la schermata di scelta dopo un click mirato. Applicato PRIMA
  // di ogni return (anche quello anticipato sotto) cosi' vince sempre.
  const requestedMode = browser?.history?.state?.feasibilityMode;
  if (requestedMode === 'business' || requestedMode === 'campaign') initial.mode = requestedMode;
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
    initial.phase = saved.phase > 0 ? 1 : 0;
    if (saved.mode === 'business' || saved.mode === 'campaign') initial.mode = saved.mode;
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
  return initial;
}
export function saveFeasibility(browser, state) {
  try {
    const inputs = Object.fromEntries(Object.entries(state.inputs).filter(([key, item]) => FIELDS[key] && SOURCES.includes(item.source)).map(([key, item]) => [key, { value: item.value, source: item.source }]));
    browser.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, contextKey: JSON.stringify(state.context), inputs, unusualMargin: state.unusualMargin, phase: state.phase, mode: state.mode ?? null, businessInputs: state.businessInputs ?? initialBusinessInputs(), savedAt: Date.now() }));
    return true;
  } catch { return false; }
}
