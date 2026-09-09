import { feasibilityContext } from '../../../lib/feasibility/entryPoint.js';
import { FIELDS, SOURCES, initialInputs } from './feasibilitySchemas.js';

export const STORAGE_KEY = 'vp_feasibility_session_v2';
export function readFeasibility(browser) {
  const context = browser?.history?.state?.feasibility ? feasibilityContext(browser.history.state.feasibility) : null;
  const initial = { context, inputs: initialInputs(context), unusualMargin: false, phase: 0 };
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
  } catch { /* Storage unavailable/corrupt: use current campaign snapshot. */ }
  return initial;
}
export function saveFeasibility(browser, state) {
  try {
    const inputs = Object.fromEntries(Object.entries(state.inputs).filter(([key, item]) => FIELDS[key] && SOURCES.includes(item.source)).map(([key, item]) => [key, { value: item.value, source: item.source }]));
    browser.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, contextKey: JSON.stringify(state.context), inputs, unusualMargin: state.unusualMargin, phase: state.phase, savedAt: Date.now() }));
    return true;
  } catch { return false; }
}
