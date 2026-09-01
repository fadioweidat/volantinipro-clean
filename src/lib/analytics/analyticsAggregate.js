// Analytics Visitatori — aggregazione PURA di public.site_events per la
// dashboard Admin. Nessuna chiamata di rete: fetch grezzo altrove
// (admin-api.js), aggregazione qui, così è testabile senza DB.
//
// Un "visitatore" = anonymous_session_id (id con TTL 90gg). Una "sessione" =
// session_id (per-tab) con fallback ad anonymous_session_id per le righe
// vecchie senza session_id.

import { resolveTrafficSource } from './utm.js';

function localDateKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 10);
}

const SOURCE_LABELS = {
  google: 'Google', bing: 'Bing', duckduckgo: 'DuckDuckGo', ecosia: 'Ecosia',
  yahoo: 'Yahoo', yandex: 'Yandex', baidu: 'Baidu',
  instagram: 'Instagram', facebook: 'Facebook', whatsapp: 'WhatsApp',
  twitter: 'X / Twitter', linkedin: 'LinkedIn', youtube: 'YouTube',
  telegram: 'Telegram', tiktok: 'TikTok', reddit: 'Reddit', pinterest: 'Pinterest',
  direct: 'Diretto', internal: 'Interno',
};

function pct(part, total) {
  return total > 0 ? Number(((part / total) * 100).toFixed(1)) : 0;
}

function topList(counter, { limit = 20, labelFn = (k) => k } = {}) {
  const entries = Object.entries(counter).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  return entries.slice(0, limit).map(([key, count]) => ({
    key, label: labelFn(key), count, pct: pct(count, total),
  }));
}

// group: mappa "dimensione" → Set di id distinti
function distinctCounter(rows, keyFn, idFn) {
  const groups = new Map();
  for (const row of rows) {
    const k = keyFn(row);
    if (k == null || k === '') continue;
    const id = idFn(row);
    if (!id) continue;
    let set = groups.get(k);
    if (!set) { set = new Set(); groups.set(k, set); }
    set.add(id);
  }
  const out = {};
  for (const [k, set] of groups) out[k] = set.size;
  return out;
}

const visitorOf = (r) => r.anonymous_session_id || null;
const sessionOf = (r) => r.session_id || r.anonymous_session_id || null;
const meta = (r) => (r && r.metadata && typeof r.metadata === 'object' ? r.metadata : {});

export const FUNNEL_STAGES = Object.freeze([
  { key: 'homepage', label: 'Homepage' },
  { key: 'quote', label: 'Preventivo' },
  { key: 'municipality', label: 'Comune' },
  { key: 'quantity', label: 'Quantità' },
  { key: 'step3', label: 'Step 3' },
  { key: 'step4', label: 'Step 4' },
  { key: 'completed', label: 'Completato' },
]);

function buildFunnel(rows) {
  const stageSessions = FUNNEL_STAGES.reduce((acc, s) => { acc[s.key] = new Set(); return acc; }, {});
  for (const r of rows) {
    const sid = sessionOf(r);
    if (!sid) continue;
    const m = meta(r);
    const path = (r.path || '').toLowerCase();
    if (r.event_name === 'page_view' && (path === '/' || path === '' || path === '/index.html' || path === '/home')) stageSessions.homepage.add(sid);
    if (r.event_name === 'quote_started' || (r.event_name === 'page_view' && (path.startsWith('/preventivo') || path.startsWith('/configuratore'))) || (r.event_name === 'quote_step_reached' && m.step === 1)) stageSessions.quote.add(sid);
    if (r.event_name === 'municipality_selected') stageSessions.municipality.add(sid);
    if (r.event_name === 'quantity_selected') stageSessions.quantity.add(sid);
    if (r.event_name === 'quote_step_reached' && m.step === 3) stageSessions.step3.add(sid);
    if (r.event_name === 'quote_step_reached' && m.step === 4) stageSessions.step4.add(sid);
    if (r.event_name === 'quote_completed') stageSessions.completed.add(sid);
  }
  const counts = FUNNEL_STAGES.map((s) => ({ ...s, sessions: stageSessions[s.key].size }));
  const top = counts[0].sessions || 0;
  return counts.map((c, i) => {
    const prev = i === 0 ? c.sessions : counts[i - 1].sessions;
    return {
      ...c,
      ofTotalPct: pct(c.sessions, top),
      dropoffPct: prev > 0 ? Number((((prev - c.sessions) / prev) * 100).toFixed(1)) : 0,
    };
  });
}

function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const BUCKET_ORDER = ['<5k', '5-10k', '10-20k', '20-50k', '50-100k', '100k+'];
const BUCKET_INDEX = Object.fromEntries(BUCKET_ORDER.map((b, i) => [b, i]));

function buildCommercial(rows) {
  const muniCount = {};
  const provCount = {};
  const bucketCount = {};
  const serviceCount = {};
  const extrasCount = {};
  const startedByMuni = {};
  const completedByMuni = {};

  const seenMuniVisitor = new Set();
  for (const r of rows) {
    const m = meta(r);
    const vid = visitorOf(r);
    if (r.event_name === 'municipality_selected' && m.municipality) {
      const kv = `${vid}|${m.municipality}`;
      if (!seenMuniVisitor.has(kv)) {
        seenMuniVisitor.add(kv);
        muniCount[m.municipality] = (muniCount[m.municipality] || 0) + 1;
        if (m.province) provCount[m.province] = (provCount[m.province] || 0) + 1;
        startedByMuni[m.municipality] = (startedByMuni[m.municipality] || 0) + 1;
      }
    }
    if (r.event_name === 'quantity_selected' && m.quantity_bucket) bucketCount[m.quantity_bucket] = (bucketCount[m.quantity_bucket] || 0) + 1;
    if (r.event_name === 'service_selected' && m.service) serviceCount[m.service] = (serviceCount[m.service] || 0) + 1;
    if (r.event_name === 'extras_selected' && Array.isArray(m.extras)) for (const e of m.extras) extrasCount[e] = (extrasCount[e] || 0) + 1;
    if (r.event_name === 'quote_completed') {
      if (m.municipality) completedByMuni[m.municipality] = (completedByMuni[m.municipality] || 0) + 1;
      if (m.quantity_bucket) bucketCount[m.quantity_bucket] = (bucketCount[m.quantity_bucket] || 0) + 1;
      if (m.service) serviceCount[m.service] = (serviceCount[m.service] || 0) + 1;
    }
  }

  const bucketNums = [];
  for (const [b, c] of Object.entries(bucketCount)) {
    if (b in BUCKET_INDEX) for (let i = 0; i < c; i += 1) bucketNums.push(BUCKET_INDEX[b]);
  }
  const medIdx = median(bucketNums);
  const quantityMedianBucket = medIdx == null ? null : BUCKET_ORDER[Math.round(medIdx)] || null;

  const conversionByMunicipality = Object.keys(startedByMuni)
    .map((name) => {
      const started = startedByMuni[name] || 0;
      const completed = completedByMuni[name] || 0;
      return { name, started, completed, rate: started > 0 ? Number(((completed / started) * 100).toFixed(1)) : 0 };
    })
    .sort((a, b) => b.started - a.started)
    .slice(0, 20);

  return {
    municipalities: topList(muniCount, { limit: 20 }),
    provinces: topList(provCount, { limit: 20 }),
    quantityBuckets: BUCKET_ORDER
      .filter((b) => bucketCount[b])
      .map((b) => ({ key: b, label: b, count: bucketCount[b], pct: pct(bucketCount[b], Object.values(bucketCount).reduce((s, v) => s + v, 0)) })),
    services: topList(serviceCount, { limit: 20 }),
    extras: topList(extrasCount, { limit: 20 }),
    conversionByMunicipality,
    quantityMedianBucket,
  };
}

// rows: array di righe site_events (event_name, created_at, anonymous_session_id,
// session_id, path, referrer_host, referrer_type, utm_*, country, region, city,
// device_type, browser, os, metadata).
export function computeAnalytics(rows, { now = new Date(), rangeDays = 7 } = {}) {
  const all = Array.isArray(rows) ? rows : [];
  const nowD = now instanceof Date ? now : new Date(now);
  const fromMs = nowD.getTime() - rangeDays * 24 * 60 * 60 * 1000;
  const inRange = all.filter((r) => {
    const t = r?.created_at ? new Date(r.created_at).getTime() : NaN;
    return Number.isFinite(t) && t >= fromMs && t <= nowD.getTime();
  });

  const todayKey = localDateKey(nowD);
  const todayRows = inRange.filter((r) => localDateKey(r.created_at) === todayKey);

  const countEvent = (list, name) => list.filter((r) => r.event_name === name).length;
  const distinctVisitors = (list) => new Set(list.map(visitorOf).filter(Boolean)).size;
  // Sessioni = session_id distinti, con fallback ad anonymous_session_id per le
  // righe storiche senza session_id (sessionOf). Stessa definizione del rollup
  // SQL (session_uid). session_started resta evento utile ma NON e piu la
  // source of truth del KPI Sessioni.
  const distinctSessions = (list) => new Set(list.map(sessionOf).filter(Boolean)).size;

  const quotesStarted = countEvent(inRange, 'quote_started');
  const quotesCompleted = countEvent(inRange, 'quote_completed');

  const overview = {
    visitorsToday: distinctVisitors(todayRows),
    uniqueVisitors: distinctVisitors(inRange),
    sessionsToday: distinctSessions(todayRows),
    sessions: distinctSessions(inRange),
    pageViewsToday: countEvent(todayRows, 'page_view'),
    pageViews: countEvent(inRange, 'page_view'),
    quotesStartedToday: countEvent(todayRows, 'quote_started'),
    quotesStarted,
    quotesCompletedToday: countEvent(todayRows, 'quote_completed'),
    quotesCompleted,
    consultationRequests: countEvent(inRange, 'consultation_requested'),
    conversionRate: quotesStarted > 0 ? Number(((quotesCompleted / quotesStarted) * 100).toFixed(1)) : null,
  };

  // serie giornaliera
  const byDay = {};
  for (let d = 0; d < rangeDays; d += 1) {
    const key = localDateKey(new Date(nowD.getTime() - d * 86400000));
    byDay[key] = { day: key, visitors: new Set(), sessions: new Set(), pageViews: 0, quotesStarted: 0, quotesCompleted: 0 };
  }
  for (const r of inRange) {
    const key = localDateKey(r.created_at);
    const b = byDay[key];
    if (!b) continue;
    const v = visitorOf(r);
    if (v) b.visitors.add(v);
    const sid = sessionOf(r);
    if (sid) b.sessions.add(sid);
    if (r.event_name === 'page_view') b.pageViews += 1;
    if (r.event_name === 'quote_started') b.quotesStarted += 1;
    if (r.event_name === 'quote_completed') b.quotesCompleted += 1;
  }
  const daily = Object.values(byDay)
    .map((b) => ({ ...b, visitors: b.visitors.size, sessions: b.sessions.size }))
    .sort((a, b) => a.day.localeCompare(b.day));

  // geografia (conteggio visitatori distinti per dimensione)
  const geography = {
    countries: topList(distinctCounter(inRange, (r) => r.country, visitorOf), { limit: 30 }),
    regions: topList(distinctCounter(inRange, (r) => r.region, visitorOf), { limit: 30 }),
    cities: topList(distinctCounter(inRange, (r) => r.city, visitorOf), { limit: 30 }),
  };

  // sorgenti: UTM prevale, poi referrer, poi direct — per visitatore distinto
  const sourceGroups = new Map();
  for (const r of inRange) {
    const src = resolveTrafficSource({
      utm: { utm_source: r.utm_source, utm_medium: r.utm_medium },
      referrerHost: r.referrer_host,
      referrerType: r.referrer_type,
    });
    const v = visitorOf(r);
    if (!v) continue;
    let g = sourceGroups.get(src.source);
    if (!g) { g = { source: src.source, type: src.type, visitors: new Set() }; sourceGroups.set(src.source, g); }
    g.visitors.add(v);
  }
  const srcArr = [...sourceGroups.values()].map((g) => ({ source: g.source, label: SOURCE_LABELS[g.source] || g.source, type: g.type, visitors: g.visitors.size }));
  const srcTotal = srcArr.reduce((s, g) => s + g.visitors, 0);
  const sources = srcArr.sort((a, b) => b.visitors - a.visitors).map((g) => ({ ...g, pct: pct(g.visitors, srcTotal) }));

  // pagine (solo page_view, per path)
  const pageCounter = {};
  for (const r of inRange) if (r.event_name === 'page_view' && r.path) pageCounter[r.path] = (pageCounter[r.path] || 0) + 1;
  const pages = topList(pageCounter, { limit: 30 });

  // device
  const device = {
    types: topList(distinctCounter(inRange, (r) => r.device_type, visitorOf), { limit: 5 }),
    browsers: topList(distinctCounter(inRange, (r) => r.browser, visitorOf), { limit: 10 }),
    os: topList(distinctCounter(inRange, (r) => r.os, visitorOf), { limit: 10 }),
  };

  return {
    hasAnyData: all.length > 0,
    range: { days: rangeDays, fromISO: new Date(fromMs).toISOString(), toISO: nowD.toISOString() },
    overview,
    daily,
    geography,
    sources,
    pages,
    device,
    funnel: buildFunnel(inRange),
    commercial: buildCommercial(inRange),
  };
}
