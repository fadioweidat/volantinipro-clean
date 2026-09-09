import { FIELDS, normalizeField, validationErrors } from './feasibilitySchemas.js';
import { validateNarrative } from './feasibilityPrompt.js';

export function applyEvidence(inputs, updates, message) {
  const next = { ...inputs };
  if (!Array.isArray(updates)) return next;
  for (const update of updates.slice(0, 12)) {
    const key = update?.field, evidence = update?.evidence;
    if (!Object.hasOwn(FIELDS, key) || inputs[key]?.source === 'campaign_existing' || typeof evidence !== 'string' || !evidence.trim() || !message.includes(evidence)) continue;
    if (!FIELDS[key].rate && !FIELDS[key].text && evidence.includes('%')) continue;
    const item = normalizeField(key, evidence);
    if (!item || item.value == null || item.value === '') continue;
    const candidate = { ...next, [key]: item };
    if (!validationErrors(candidate, true)[key]) next[key] = item;
  }
  return next;
}
export async function requestFeasibilityAi(payload, { fetcher = globalThis.fetch, signal, env = import.meta.env } = {}) {
  if (!env?.VITE_SUPABASE_URL || !env?.VITE_SUPABASE_ANON_KEY) throw new Error('AI_UNAVAILABLE');
  const response = await fetcher(`${env.VITE_SUPABASE_URL}/functions/v1/feasibility-ai`, {
    method: 'POST', signal: signal || AbortSignal.timeout(20000),
    headers: { 'Content-Type': 'application/json', apikey: env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}` },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error('AI_UNAVAILABLE');
  const result = await response.json();
  if (payload.mode === 'narrative') {
    const narrative = validateNarrative(result);
    if (!narrative) throw new Error('AI_INVALID_NARRATIVE');
    return narrative;
  }
  if (!Array.isArray(result.updates)) throw new Error('AI_INVALID_COLLECTION');
  return result;
}
