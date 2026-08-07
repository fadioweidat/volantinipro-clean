// K6-PRODUCTION-CONFIRM-2 — TTFB / API confirmation test.
//
// Purpose: isolate server/CDN-side latency (time to first byte, response
// headers, cache status) from full-body download time, to determine
// whether the ~45.6s p95 seen for the 1.8MB JS bundle in the first test
// (tests/k6/production-smoke.js, see K6_PRODUCTION_PERFORMANCE_REPORT.md)
// reflects a server/CDN problem or a test-client bandwidth artifact.
//
// Key technique: static assets are probed with HEAD requests. HEAD never
// transfers a response body, so `http_req_waiting` (== TTFB) and response
// headers are captured without downloading the 1.8MB payload at all —
// completely removing the client-bandwidth confound from this run.
//
// Scope, same safety rules as production-smoke.js:
//   - read-only only: GET/HEAD, no writes, no RPC, no login, no data
//   - homepage, one public SPA route (/configuratore — same client-rendered
//     shell, confirmed via curl to return identical 409-byte HTML), and the
//     one already-verified read-only REST call against geo_nil_milano
//   - does NOT modify or replace production-smoke.js

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

const BASE_URL = __ENV.TARGET_URL || 'https://www.volantinipro.it';
const SUPABASE_URL = __ENV.SUPABASE_URL || 'https://mqkelrsvksrzrpmbstvd.supabase.co';
// Same env var name the app itself reads (src/supabaseClient.js). Public
// publishable key, not a secret — fallback kept so the script runs standalone.
const SUPABASE_PUBLISHABLE_KEY = __ENV.VITE_SUPABASE_ANON_KEY || 'sb_publishable_9krINxuQ6h2bd4hChnHIpA_aQZtMpl9';
const STATIC_ASSET_PATH = __ENV.STATIC_ASSET_PATH || '/assets/index-BVPFcCYW.js';

const ttfbHomepage = new Trend('ttfb_homepage', true);
const ttfbConfigurator = new Trend('ttfb_configurator', true);
const ttfbRest = new Trend('ttfb_rest_readonly', true);
const ttfbStatic = new Trend('ttfb_static_head', true);
const receivingStatic = new Trend('receiving_static_head', true);

const errorRate = new Rate('errors');
const status5xx = new Counter('status_5xx');
const status4xx = new Counter('status_4xx');
const cacheHit = new Counter('cdn_cache_hit');
const cacheMiss = new Counter('cdn_cache_miss');
const cacheUnknown = new Counter('cdn_cache_unknown');

export const options = {
  stages: [
    { duration: '15s', target: 1 },
    { duration: '30s', target: 5 },
    { duration: '60s', target: 20 },
    { duration: '60s', target: 50 },
  ],
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    // Homepage / public SPA route ("pagine/API normali"): TTFB, not full duration.
    'http_req_waiting{name:homepage}': ['p(95)<750', 'p(99)<1500'],
    'http_req_waiting{name:configurator}': ['p(95)<750', 'p(99)<1500'],
    // REST read-only.
    'http_req_duration{name:rest_readonly}': ['p(95)<1000'],
    // Static/CDN: TTFB only — HEAD requests never download the body, so
    // this is never confounded by the 1.8MB payload transfer time.
    'http_req_waiting{name:static_head}': ['p(95)<750'],
  },
};

function recordCacheHeader(res) {
  const h = res.headers['X-Vercel-Cache'] || res.headers['x-vercel-cache'];
  if (!h) {
    cacheUnknown.add(1);
    return;
  }
  if (h.toUpperCase() === 'HIT') cacheHit.add(1);
  else if (h.toUpperCase() === 'MISS') cacheMiss.add(1);
  else cacheUnknown.add(1);
}

function trackStatus(res) {
  if (res.status >= 500) status5xx.add(1);
  else if (res.status >= 400) status4xx.add(1);
}

export default function () {
  // 1) Homepage — GET (tiny 409-byte shell, body needed for content check).
  const homeRes = http.get(`${BASE_URL}/`, { tags: { name: 'homepage' } });
  ttfbHomepage.add(homeRes.timings.waiting);
  trackStatus(homeRes);
  recordCacheHeader(homeRes);
  const homeOk = check(homeRes, {
    'homepage status 200': (r) => r.status === 200,
    'homepage not 5xx': (r) => r.status < 500,
    'homepage has root div': (r) => r.body && r.body.includes('id="root"'),
  });
  errorRate.add(!homeOk);

  // 2) Public configurator route — same client-rendered shell (confirmed:
  //    identical 409-byte body via curl), included to satisfy "route
  //    pubblica configuratore" while being honest that it is not a
  //    distinct server-rendered response.
  const configRes = http.get(`${BASE_URL}/configuratore`, { tags: { name: 'configurator' } });
  ttfbConfigurator.add(configRes.timings.waiting);
  trackStatus(configRes);
  const configOk = check(configRes, {
    'configurator status 200': (r) => r.status === 200,
    'configurator not 5xx': (r) => r.status < 500,
  });
  errorRate.add(!configOk);

  // 3) REST read-only — same endpoint verified safe in the first test.
  const restRes = http.get(
    `${SUPABASE_URL}/rest/v1/geo_nil_milano?select=id&limit=1`,
    {
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY },
      tags: { name: 'rest_readonly' },
    }
  );
  ttfbRest.add(restRes.timings.waiting);
  trackStatus(restRes);
  const restOk = check(restRes, {
    'rest status 200': (r) => r.status === 200,
    'rest not 5xx': (r) => r.status < 500,
  });
  errorRate.add(!restOk);

  // 4) Static JS bundle — HEAD only. No body transfer, ever. Measures pure
  //    server/CDN response latency and cache headers.
  const staticRes = http.head(`${BASE_URL}${STATIC_ASSET_PATH}`, { tags: { name: 'static_head' } });
  ttfbStatic.add(staticRes.timings.waiting);
  receivingStatic.add(staticRes.timings.receiving);
  trackStatus(staticRes);
  recordCacheHeader(staticRes);
  const staticOk = check(staticRes, {
    'static HEAD status 200': (r) => r.status === 200,
    'static HEAD not 5xx': (r) => r.status < 500,
    'static HEAD has content-length': (r) => !!(r.headers['Content-Length'] || r.headers['content-length']),
  });
  errorRate.add(!staticOk);

  sleep(1);
}
