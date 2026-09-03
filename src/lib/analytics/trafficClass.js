// Analytics Visitatori — classificazione del traffico. PURO: nessuna rete,
// nessun DOM, nessun import di ambiente. Usato da:
//   - api/track.js (ingestion): deriva `origin_kind` dall'header Origin/Referer
//     e ri-valuta il bot dallo User-Agent reale della request.
//   - analyticsAggregate.js (dashboard): classifica ogni riga site_events e
//     filtra PRIMA dell'aggregazione (default: solo `public`).
//
// NON raccoglie e NON persiste: IP, coordinate, User-Agent raw, host string.
// `origin_kind` è un enum di 4 valori; la classe di una riga è un enum di 7.

// Ordine di precedenza (prima corrispondenza vince):
//   1) bot  2) test  3) preview  4) admin  5) internal  6) public  7) unknown
export const TRAFFIC_CLASSES = Object.freeze({
  BOT: 'bot',
  TEST: 'test',
  PREVIEW: 'preview',
  ADMIN: 'admin',
  INTERNAL: 'internal',
  PUBLIC: 'public',
  UNKNOWN: 'unknown',
});

export const TRAFFIC_CLASS_ORDER = Object.freeze([
  'bot', 'test', 'preview', 'admin', 'internal', 'public', 'unknown',
]);

// Valori ammessi per metadata.origin_kind (scritto SOLO da /api/track).
export const ORIGIN_KINDS = Object.freeze(['public', 'test', 'preview', 'unknown']);

// Host di produzione: tutto ciò che non è questi, non è *.vercel.app e non è
// localhost/127.0.0.1 resta `unknown` (mai declassato a public per sbaglio).
export const PRODUCTION_HOSTS = Object.freeze(['www.volantinipro.it', 'volantinipro.it']);

const ADMIN_PATH_RE = /^\/admin(?:\/|$)/i;
const INTERNAL_PATH_RE = /^\/(?:driver|office)(?:\/|$)/i;

function normalizePath(p) {
  if (typeof p !== 'string' || p === '') return null;
  const clean = p.split('?')[0].split('#')[0];
  return clean === '' ? '/' : clean;
}

// Estrae l'host (lowercase, senza porta, senza www.) da un valore che può
// essere un URL completo (header Origin/Referer) o già un host.
export function hostFromOrigin(value) {
  if (!value || typeof value !== 'string') return null;
  let s = value.trim().toLowerCase();
  if (s.includes('://')) {
    try { s = new URL(s).hostname; } catch { s = s.split('://')[1] || s; }
  }
  s = s.split('/')[0].split('?')[0].split('#')[0];
  // IPv6 letterale tra parentesi: [::1]
  if (s.startsWith('[')) {
    const end = s.indexOf(']');
    return end > 0 ? s.slice(0, end + 1) : null;
  }
  s = s.split(':')[0].replace(/^www\./, '');
  return /^[a-z0-9.\-]+$/.test(s) && s.length > 0 ? s : null;
}

// Deriva `origin_kind` dall'host della richiesta (lato /api/track).
//   production host        -> 'public'
//   localhost/127.0.0.1/*.local/[::1] -> 'test'
//   *.vercel.app (non prod) -> 'preview'
//   tutto il resto / assente -> 'unknown'
export function originKindFromHost(hostOrOrigin) {
  const host = hostFromOrigin(hostOrOrigin);
  if (!host) return 'unknown';
  const bare = host.replace(/^www\./, '');
  if (PRODUCTION_HOSTS.includes(bare) || PRODUCTION_HOSTS.includes(host)) return 'public';
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host === '[::1]' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local')
  ) return 'test';
  if (host.endsWith('.vercel.app')) return 'preview';
  return 'unknown';
}

// User-Agent -> è un bot? (headless/automation/crawler/tool). Riusa la stessa
// regex di src/lib/analytics/device.js senza dipendere dal DOM.
const BOT_UA_RE = /(bot|crawler|spider|crawl|slurp|mediapartners|facebookexternalhit|embedly|quora link|pinterest|redditbot|whatsapp|telegrambot|preview|lighthouse|headlesschrome|puppeteer|playwright|python-requests|curl|wget|axios|node-fetch|go-http|semrush|ahrefs|dotbot|bingpreview)/i;

export function isBotUserAgent(ua) {
  return BOT_UA_RE.test(String(ua || ''));
}

// row: una riga site_events (event_name, path, device_type, metadata, ...).
// metadata.origin_kind, se presente, è la fonte di verità per test/preview/
// public. Compatibilità legacy: righe senza origin_kind vengono classificate
// solo da device_type + path (mai test/preview: non ricostruibili a posteriori).
export function classifyTrafficRow(row) {
  if (!row || typeof row !== 'object') return TRAFFIC_CLASSES.UNKNOWN;

  const meta = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? row.metadata : {};
  const originKind = typeof meta.origin_kind === 'string' ? meta.origin_kind.toLowerCase() : null;
  const path = normalizePath(row.path);

  // 1) bot — device_type risolto (client o /api/track server-side)
  if (row.device_type === 'bot') return TRAFFIC_CLASSES.BOT;

  // 2) test / 3) preview — SOLO da origin_kind esplicito
  if (originKind === 'test') return TRAFFIC_CLASSES.TEST;
  if (originKind === 'preview') return TRAFFIC_CLASSES.PREVIEW;

  // 4) admin — path /admin/*
  if (path && ADMIN_PATH_RE.test(path)) return TRAFFIC_CLASSES.ADMIN;

  // 5) internal — path /driver/* o /office/*
  if (path && INTERNAL_PATH_RE.test(path)) return TRAFFIC_CLASSES.INTERNAL;

  // 6) public — origin_kind di produzione OPPURE legacy (nessun origin_kind):
  //    non-bot, path non admin/internal -> public.
  if (originKind === 'public') return TRAFFIC_CLASSES.PUBLIC;

  // 7) unknown — SOLO se l'ingestion ha marcato origin_kind='unknown' (nessun
  //    header host determinabile), oppure riga malformata (gestita in cima).
  //    NB: una riga LEGACY con path NULL (tipico degli eventi di funnel storici
  //    quote_started/completed, municipality_selected, quote_step_*) resta
  //    PUBLIC: è traffico reale, non "rumore". Declassarla a unknown farebbe
  //    sparire lo storico del funnel dai KPI commerciali (decisione operativa).
  if (originKind === 'unknown') return TRAFFIC_CLASSES.UNKNOWN;

  return TRAFFIC_CLASSES.PUBLIC; // legacy public
}

// Filtri della dashboard -> insieme di classi incluse. `null` = nessun filtro.
export const TRAFFIC_FILTERS = Object.freeze({
  PUBLIC: 'public',           // default dashboard
  ALL: 'all',
  BOT_TEST: 'bot_test',
  ADMIN_INTERNAL: 'admin_internal',
});

export function classesForFilter(filter) {
  switch (filter) {
    case TRAFFIC_FILTERS.ALL:
      return null;
    case TRAFFIC_FILTERS.BOT_TEST:
      return new Set([TRAFFIC_CLASSES.BOT, TRAFFIC_CLASSES.TEST, TRAFFIC_CLASSES.PREVIEW]);
    case TRAFFIC_FILTERS.ADMIN_INTERNAL:
      return new Set([TRAFFIC_CLASSES.ADMIN, TRAFFIC_CLASSES.INTERNAL]);
    case TRAFFIC_FILTERS.PUBLIC:
    default:
      return new Set([TRAFFIC_CLASSES.PUBLIC]);
  }
}

// Bucket per l'indicatore "Traffico escluso": bot/test (+preview),
// admin/internal, non classificati (unknown).
export function excludedBucketOf(cls) {
  if (cls === TRAFFIC_CLASSES.BOT || cls === TRAFFIC_CLASSES.TEST || cls === TRAFFIC_CLASSES.PREVIEW) return 'botTest';
  if (cls === TRAFFIC_CLASSES.ADMIN || cls === TRAFFIC_CLASSES.INTERNAL) return 'adminInternal';
  if (cls === TRAFFIC_CLASSES.UNKNOWN) return 'unclassified';
  return null; // public: non escluso
}
