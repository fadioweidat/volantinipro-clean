// K6-PRODUCTION-SMOKE-1 — non-destructive production performance smoke test.
//
// Targets ONLY safe, read-only surfaces of https://www.volantinipro.it:
//   - the homepage (and by extension the SPA shell served for every route,
//     since this is a client-rendered app with a catch-all rewrite to
//     index.html — k6 does not execute JS, so it cannot exercise anything
//     beyond static asset delivery for "different pages")
//   - the built JS/CSS assets (static, CDN-cacheable)
//   - a single, minimal, RLS-safe read-only REST call against a public
//     table (geo_nil_milano), using the same publishable key already
//     shipped to every real visitor's browser (not a secret)
//
// Deliberately excluded, per the ticket's explicit safety rules:
//   - any write RPC (admin_create_operator_assignment, gps_start_session, ...)
//   - login / magic-link flows
//   - any POST/PATCH/DELETE request of any kind
//   - Edge Functions (they call paid third-party APIs — OpenAI, Google
//     Places, Foursquare — load-testing them would burn real quota/money)
//
// Usage:
//   k6 run tests/k6/production-smoke.js                  # full staged profile
//   K6_MINIMAL=1 k6 run tests/k6/production-smoke.js      # Fase 5 minimal check (1 VU, 10s)

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

const BASE_URL = __ENV.TARGET_URL || 'https://www.volantinipro.it';
const SUPABASE_URL = __ENV.SUPABASE_URL || 'https://mqkelrsvksrzrpmbstvd.supabase.co';
// Publishable key: by design public, already embedded in every visitor's
// browser bundle (same env var name the app itself reads, see
// src/supabaseClient.js). Not a secret — read from env with the known
// public value as fallback so the script stays runnable standalone.
const SUPABASE_PUBLISHABLE_KEY = __ENV.VITE_SUPABASE_ANON_KEY || 'sb_publishable_9krINxuQ6h2bd4hChnHIpA_aQZtMpl9';

const homepageDuration = new Trend('homepage_duration', true);
const assetDuration = new Trend('asset_duration', true);
const restDuration = new Trend('rest_readonly_duration', true);
const errorRate = new Rate('errors');
const status5xx = new Counter('status_5xx');
const status4xx = new Counter('status_4xx');

const MINIMAL = __ENV.K6_MINIMAL === '1';

// NOTE on thresholds: the ticket's p(95)<1500ms threshold is scoped to
// "pagine/API normali" (normal pages/API). We apply it to the homepage HTML
// (409 bytes) and the read-only REST call, both of which are cheap,
// server/API-bound requests. The static JS bundle (~1.8MB) is excluded from
// this gate: its latency is dominated by payload size and the test runner's
// network path to the CDN edge, not by server load — confirmed via serial
// curl probes at zero concurrency showing the same 3-6s download time before
// any k6 load was applied. Its timing is still measured and reported
// (asset_duration trend) but does not gate the pass/fail verdict.
const commonThresholds = {
  http_req_failed: ['rate<0.01'],
  'http_req_duration{name:homepage}': ['p(95)<1500'],
  'http_req_duration{name:rest_readonly_geo_nil_milano}': ['p(95)<1500'],
};

export const options = MINIMAL
  ? {
      vus: 1,
      duration: '10s',
      thresholds: commonThresholds,
    }
  : {
      stages: [
        { duration: '30s', target: 5 },
        { duration: '1m', target: 20 },
        { duration: '1m', target: 50 },
        { duration: '30s', target: 0 },
      ],
      thresholds: commonThresholds,
    };

// Cache the discovered JS/CSS asset URLs across the whole run (fetched once
// per VU on first iteration) instead of re-parsing the homepage HTML every
// single iteration — keeps load concentrated on the actual pages under
// test rather than on repeated homepage parsing overhead.
let cachedAssetUrls = null;

function discoverAssetUrls(homepageBody) {
  const matches = homepageBody.match(/\/assets\/[A-Za-z0-9_.-]+\.(js|css)/g) || [];
  // De-dupe, cap to a handful to keep the asset check lightweight.
  return [...new Set(matches)].slice(0, 3);
}

export default function () {
  // 1) Homepage — majority of load, mirrors real visitor traffic to a
  //    client-rendered SPA (every route ultimately serves this same shell).
  const homeRes = http.get(`${BASE_URL}/`, { tags: { name: 'homepage' } });
  homepageDuration.add(homeRes.timings.duration);
  const homeOk = check(homeRes, {
    'homepage status is 200': (r) => r.status === 200,
    'homepage not 5xx': (r) => r.status < 500,
    // Production shell is a minimal SPA entry point (~409 bytes): just the
    // HTML skeleton with <div id="root"> and asset <script>/<link> tags.
    'homepage has content': (r) => r.body && r.body.length > 200 && r.body.includes('id="root"'),
  });
  errorRate.add(!homeOk);
  if (homeRes.status >= 500) status5xx.add(1);
  else if (homeRes.status >= 400) status4xx.add(1);

  if (!cachedAssetUrls) {
    cachedAssetUrls = discoverAssetUrls(homeRes.body || '');
  }

  // 2) Static assets (JS/CSS) — CDN-served, cheap, exercises real asset
  //    delivery path a browser would use to load the app shell.
  for (const assetPath of cachedAssetUrls) {
    const assetRes = http.get(`${BASE_URL}${assetPath}`, { tags: { name: 'static_asset' } });
    assetDuration.add(assetRes.timings.duration);
    const assetOk = check(assetRes, {
      'asset status is 200': (r) => r.status === 200,
      'asset not 5xx': (r) => r.status < 500,
    });
    errorRate.add(!assetOk);
    if (assetRes.status >= 500) status5xx.add(1);
    else if (assetRes.status >= 400) status4xx.add(1);
  }

  // 3) One light, read-only REST call against a public table — exercises
  //    the Supabase REST layer without any write, RPC, or auth. Only fired
  //    roughly every 3rd iteration per VU to avoid hammering the database
  //    ("non stressare Supabase in modo aggressivo").
  if (Math.random() < 0.33) {
    const restRes = http.get(
      `${SUPABASE_URL}/rest/v1/geo_nil_milano?select=id&limit=1`,
      {
        headers: { apikey: SUPABASE_PUBLISHABLE_KEY },
        tags: { name: 'rest_readonly_geo_nil_milano' },
      }
    );
    restDuration.add(restRes.timings.duration);
    const restOk = check(restRes, {
      'rest status is 200': (r) => r.status === 200,
      'rest not 5xx': (r) => r.status < 500,
    });
    errorRate.add(!restOk);
    if (restRes.status >= 500) status5xx.add(1);
    else if (restRes.status >= 400) status4xx.add(1);
  }

  sleep(1);
}
