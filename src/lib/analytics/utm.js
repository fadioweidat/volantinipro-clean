// Analytics Visitatori — parsing UTM + classificazione referrer. PURO.
// Il referrer viene ridotto a SOLO host + classe (mai URL completo/query).

const UTM_FIELDS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];

export function parseUtm(search) {
  const out = {};
  if (!search || typeof search !== 'string') return out;
  let params;
  try {
    params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
  } catch {
    return out;
  }
  for (const f of UTM_FIELDS) {
    const v = params.get(f);
    if (v) out[f] = String(v).trim().slice(0, 120).toLowerCase();
  }
  // gclid/fbclid ⇒ inferisci la sorgente se manca utm_source
  if (!out.utm_source) {
    if (params.get('gclid')) { out.utm_source = 'google'; out.utm_medium = out.utm_medium || 'cpc'; }
    else if (params.get('fbclid')) { out.utm_source = 'facebook'; out.utm_medium = out.utm_medium || 'social'; }
    else if (params.get('ttclid')) { out.utm_source = 'tiktok'; out.utm_medium = out.utm_medium || 'social'; }
  }
  return out;
}

// host → { source, type }. type ∈ direct|organic|social|referral|internal
const SEARCH_ENGINES = [
  [/(^|\.)google\./, 'google'],
  [/(^|\.)bing\.com$/, 'bing'],
  [/(^|\.)duckduckgo\.com$/, 'duckduckgo'],
  [/(^|\.)ecosia\.org$/, 'ecosia'],
  [/(^|\.)yahoo\./, 'yahoo'],
  [/(^|\.)yandex\./, 'yandex'],
  [/(^|\.)baidu\.com$/, 'baidu'],
];
const SOCIAL = [
  [/(^|\.)instagram\.com$/, 'instagram'],
  [/(^|\.)l\.instagram\.com$/, 'instagram'],
  [/(^|\.)facebook\.com$/, 'facebook'],
  [/(^|\.)m\.facebook\.com$/, 'facebook'],
  [/(^|\.)l\.facebook\.com$/, 'facebook'],
  [/(^|\.)fb\.me$/, 'facebook'],
  [/(^|\.)lm\.facebook\.com$/, 'facebook'],
  [/(^|\.)whatsapp\.com$/, 'whatsapp'],
  [/(^|\.)wa\.me$/, 'whatsapp'],
  [/(^|\.)t\.co$/, 'twitter'],
  [/(^|\.)twitter\.com$/, 'twitter'],
  [/(^|\.)x\.com$/, 'twitter'],
  [/(^|\.)linkedin\.com$/, 'linkedin'],
  [/(^|\.)lnkd\.in$/, 'linkedin'],
  [/(^|\.)youtube\.com$/, 'youtube'],
  [/(^|\.)t\.me$/, 'telegram'],
  [/(^|\.)tiktok\.com$/, 'tiktok'],
  [/(^|\.)reddit\.com$/, 'reddit'],
  [/(^|\.)pinterest\./, 'pinterest'],
];

function hostFromReferrer(referrer) {
  if (!referrer || typeof referrer !== 'string') return null;
  try {
    return new URL(referrer).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    // può essere già solo un host
    const h = referrer.trim().toLowerCase().replace(/^www\./, '');
    return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(h) ? h : null;
  }
}

export function classifyReferrer(referrer, currentHost = null) {
  const host = hostFromReferrer(referrer);
  if (!host) return { host: null, type: 'direct', source: 'direct' };

  const cur = String(currentHost || '').toLowerCase().replace(/^www\./, '');
  if (cur && (host === cur || host.endsWith(`.${cur}`))) {
    return { host, type: 'internal', source: 'internal' };
  }
  for (const [re, name] of SEARCH_ENGINES) if (re.test(host)) return { host, type: 'organic', source: name };
  for (const [re, name] of SOCIAL) if (re.test(host)) return { host, type: 'social', source: name };
  return { host, type: 'referral', source: host };
}

// Sorgente finale mostrata in dashboard: UTM prevale, poi referrer, poi direct.
export function resolveTrafficSource({ utm = {}, referrerHost = null, referrerType = null } = {}) {
  if (utm.utm_source) {
    return { source: utm.utm_source, medium: utm.utm_medium || 'referral', type: utm.utm_medium || 'campaign' };
  }
  if (referrerType && referrerType !== 'direct' && referrerType !== 'internal') {
    const cls = classifyReferrer(referrerHost);
    return { source: cls.source, medium: cls.type, type: cls.type };
  }
  return { source: 'direct', medium: 'none', type: 'direct' };
}
