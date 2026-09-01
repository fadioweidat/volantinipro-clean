// Analytics Visitatori — endpoint di ingest (Vercel serverless function).
//
// Riceve un evento anonimo dal client, aggiunge la GEO APPROSSIMATIVA
// (country / region / city) dagli header Vercel — MAI l'IP, MAI coordinate,
// MAI CAP/indirizzo — valida contro l'allowlist, e inserisce in
// public.site_events con service role (mai esposto al browser).
//
// Se non configurato (nessun service role): risponde 503, così il client
// esegue il suo fallback anon diretto (senza geo). Fire-and-forget: qualunque
// esito non deve rompere la UX del sito.
//
// Nessuna dipendenza NPM: solo fetch nativo.

import { validateAnalyticsEvent, ANALYTICS_LIMITS } from '../src/lib/analytics/eventSchema.js';
import { readVercelGeo, prettyRegion } from '../src/lib/analytics/geo.js';

const RATE_MAX = 60; // eventi/minuto per client
const RATE_WINDOW_MS = 60 * 1000;
const buckets = new Map();

function rateKey(headers) {
  // SOLO per il conteggio in memoria: mai salvato, mai restituito.
  const ip = (headers['x-forwarded-for'] || headers['x-real-ip'] || headers['x-vercel-forwarded-for'] || 'unknown')
    .split(',')[0].trim();
  const ua = (headers['user-agent'] || '').slice(0, 40);
  return `${ip}|${ua}`;
}

function consumeRate(headers) {
  const key = rateKey(headers);
  const now = Date.now();
  const cur = buckets.get(key);
  if (!cur || now - cur.start >= RATE_WINDOW_MS) {
    buckets.set(key, { start: now, count: 1 });
    if (buckets.size > 5000) { // evita crescita illimitata su istanza warm
      for (const [k, v] of buckets) if (now - v.start >= RATE_WINDOW_MS) buckets.delete(k);
    }
    return true;
  }
  if (cur.count >= RATE_MAX) return false;
  cur.count += 1;
  return true;
}

function supabaseConfig() {
  return {
    url: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || null,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || null,
  };
}

export default async function handler(req, res) {
  // Fire-and-forget: risposte minime, nessun corpo.
  const end = (status) => { res.status(status).setHeader('Cache-Control', 'no-store'); res.end(); };

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return end(204);
  }
  if (req.method !== 'POST') return end(405);

  const headers = req.headers || {};
  if (!consumeRate(headers)) return end(429);

  // payload
  let payload = req.body;
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload); } catch { return end(400); }
  }
  if (!payload || typeof payload !== 'object') return end(400);
  try {
    if (JSON.stringify(payload).length > ANALYTICS_LIMITS.MAX_PAYLOAD_BYTES) return end(413);
  } catch {
    return end(400);
  }

  // geo dagli header Vercel (mai l'IP)
  const rawGeo = readVercelGeo(headers);
  const geo = rawGeo
    ? { country: rawGeo.country, region: prettyRegion(rawGeo.country, rawGeo.region), city: rawGeo.city }
    : null;

  const result = validateAnalyticsEvent({ ...payload, geo }, { allowGeo: true });
  if (!result.ok) return end(422);

  const { url, serviceKey } = supabaseConfig();
  if (!url || !serviceKey) {
    // non configurato: lascia che il client faccia il fallback anon
    return end(503);
  }

  try {
    const r = await fetch(`${url}/rest/v1/site_events`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(result.event),
    });
    return end(r.ok ? 204 : 502);
  } catch {
    return end(502);
  }
}
