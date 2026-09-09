import { FIELDS, SOURCES, validationErrors } from '../../../src/pages/customer/feasibility/feasibilitySchemas.js';
import { calculateFeasibility } from '../../../src/pages/customer/feasibility/feasibilityEngine.js';
import { COLLECTION_PROMPT, NARRATIVE_PROMPT, NARRATIVE_OPTIONS, validateNarrative } from '../../../src/pages/customer/feasibility/feasibilityPrompt.js';

const ALLOWED_ORIGINS = ['https://volantinipro-clean.vercel.app', 'https://volantinipro.it', 'https://www.volantinipro.it', 'http://localhost:5173'];
export function createHandler({ apiKey, anonKey, fetcher = fetch, now = Date.now, model = 'gpt-4o-mini' }) {
  // Bounded, best-effort per-isolate abuse control; no database or chat logging.
  const buckets = new Map();
  let globalStart = now(), globalCalls = 0;
  return async request => {
    const origin = request.headers.get('origin');
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin', 'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : 'https://volantinipro-clean.vercel.app', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
    const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
    if (!ALLOWED_ORIGINS.includes(origin)) return reply({ error: 'ORIGIN' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return reply({ error: 'METHOD' }, 405);
    // Public customer feature: valid project's public key; gateway JWT verification also enabled.
    if (!anonKey || request.headers.get('apikey') !== anonKey || request.headers.get('authorization') !== `Bearer ${anonKey}`) return reply({ error: 'AUTH' }, 401);
    if (!apiKey) return reply({ error: 'AI_UNAVAILABLE' }, 503);
    const timestamp = now();
    if (timestamp - globalStart >= 60000) { globalStart = timestamp; globalCalls = 0; buckets.clear(); }
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const used = buckets.get(ip) || 0;
    if (used >= 15 || globalCalls >= 120) return reply({ error: 'RATE_LIMIT' }, 429);
    buckets.set(ip, used + 1); globalCalls += 1;
    try {
      if (Number(request.headers.get('content-length')) > 20000) return reply({ error: 'SIZE' }, 413);
      const raw = await request.text();
      if (raw.length > 20000) return reply({ error: 'SIZE' }, 413);
      const body = JSON.parse(raw);
      if (!['collect', 'narrative'].includes(body.mode)) return reply({ error: 'MODE' }, 400);
      const inputs = {};
      for (const key of Object.keys(FIELDS)) {
        const item = body.inputs?.[key];
        if (!item || !SOURCES.includes(item.source) || (item.value !== null && (FIELDS[key].text ? typeof item.value !== 'string' || item.value.length > 600 : typeof item.value !== 'number' || !Number.isFinite(item.value)))) return reply({ error: 'INPUT' }, 400);
        inputs[key] = { value: item.value, source: item.source };
      }
      let system, content;
      if (body.mode === 'collect') {
        if (typeof body.message !== 'string' || body.message.length > 1500 || !body.message.trim()) return reply({ error: 'MESSAGE' }, 400);
        system = COLLECTION_PROMPT;
        content = { message: body.message, currentField: Object.hasOwn(FIELDS, body.currentField) ? body.currentField : null, inputs, allowedFields: Object.keys(FIELDS).filter(key => inputs[key].source !== 'campaign_existing') };
      } else {
        if (Object.keys(validationErrors(inputs, body.unusualMargin === true)).length) return reply({ error: 'VALIDATION' }, 400);
        system = NARRATIVE_PROMPT;
        // Calculate afresh; never trust caller-supplied KPI or classification.
        content = { inputs, calculations: calculateFeasibility(inputs, { unusualMargin: body.unusualMargin === true }), options: NARRATIVE_OPTIONS };
      }
      const response = await fetcher('https://api.openai.com/v1/chat/completions', { method: 'POST', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model, temperature: 0, max_tokens: 1000, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: system }, { role: 'user', content: JSON.stringify(content) }] }) });
      if (!response.ok) return reply({ error: 'AI_UNAVAILABLE' }, 503);
      const data = await response.json();
      const result = JSON.parse(data?.choices?.[0]?.message?.content || 'null');
      if (body.mode === 'narrative') return validateNarrative(result) ? reply({ sections: result.sections }) : reply({ error: 'AI_INVALID' }, 502);
      if (!Array.isArray(result?.updates)) return reply({ error: 'AI_INVALID' }, 502);
      return reply({ updates: result.updates.slice(0, 12).filter(item => item && Object.hasOwn(FIELDS, item.field) && inputs[item.field].source !== 'campaign_existing' && typeof item.evidence === 'string' && item.evidence.trim() && body.message.includes(item.evidence)).map(({ field, evidence }) => ({ field, evidence })) });
    } catch { return reply({ error: 'AI_UNAVAILABLE' }, 503); }
  };
}
