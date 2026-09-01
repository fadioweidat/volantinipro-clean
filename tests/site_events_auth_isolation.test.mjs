// Regressione: il tracking pubblico site_events deve restare del tutto
// indipendente dalla sessione Auth Cliente/Admin.
//
// Root cause del bug "POST /rest/v1/site_events 401 Unauthorized dalla
// homepage" (gia' confermata): src/lib/analytics/siteEvents.js inviava gli
// INSERT tramite il client @supabase/supabase-js principale
// (src/supabaseClient.js), che ha persistSession/autoRefreshToken attivi ed
// eredita la sessione di login via il bridge setSession. Con un JWT utente
// scaduto la SDK allega comunque `Authorization: Bearer <JWT scaduto>` e
// PostgREST risponde 401 (PGRST301). Prove live:
//   publishable + Authorization publishable  => 201
//   publishable senza Authorization          => 201
//   publishable + stale JWT                  => 401 PGRST301
//
// Questi test bloccano ogni regressione futura verso quel percorso:
// nessun token di sessione deve mai finire nella richiesta analytics, il
// client deve basarsi solo su VITE_SUPABASE_URL + chiave pubblica, e il
// tracking resta fire-and-forget.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const MODULE_URL = new URL("../src/lib/analytics/siteEvents.js", import.meta.url);
const SOURCE = readFileSync(MODULE_URL, "utf8");

const PUBLIC_URL = "https://project-under-test.supabase.co";
const PUBLIC_ANON_KEY = "sb_publishable_TESTKEY_not_a_real_secret_000000";

// Un JWT utente plausibile e "scaduto": se anche solo un frammento di questo
// valore comparisse nella richiesta analytics, il test fallisce.
const STALE_USER_JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
  "eyJyb2xlIjoiYXV0aGVudGljYXRlZCIsInN1YiI6InVzZXItMTIzIiwiZXhwIjoxNTAwMDAwMDAwfQ." +
  "c3RhbGVfc2lnbmF0dXJlX2RvX25vdF9wcm9wYWdhdGU";
const STALE_REFRESH_TOKEN = "stale-refresh-token-do-not-propagate";

function makeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
    _dump: () => Object.fromEntries(map),
  };
}

// Installa un ambiente browser fittizio + fetch spia. Ritorna { calls, restore }.
function installBrowserEnv({ localStorage = makeStorage(), sessionStorage = makeStorage(), fetchImpl } = {}) {
  const saved = {
    window: global.window,
    fetch: global.fetch,
    url: process.env.VITE_SUPABASE_URL,
    key: process.env.VITE_SUPABASE_ANON_KEY,
  };
  const calls = [];
  global.window = {
    localStorage,
    sessionStorage,
    location: { pathname: "/" },
  };
  global.fetch = fetchImpl || (async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 204, text: async () => "" };
  });
  // global.crypto (con randomUUID) e' gia' fornito da Node >= 19 ed e'
  // read-only: lo usa direttamente safeRandomUuid() nel modulo.
  process.env.VITE_SUPABASE_URL = PUBLIC_URL;
  process.env.VITE_SUPABASE_ANON_KEY = PUBLIC_ANON_KEY;

  return {
    calls,
    restore() {
      global.window = saved.window;
      global.fetch = saved.fetch;
      if (saved.url === undefined) delete process.env.VITE_SUPABASE_URL;
      else process.env.VITE_SUPABASE_URL = saved.url;
      if (saved.key === undefined) delete process.env.VITE_SUPABASE_ANON_KEY;
      else process.env.VITE_SUPABASE_ANON_KEY = saved.key;
    },
  };
}

// Import fresco del modulo a ogni test: lo stato di modulo (nessuno qui) e la
// cache d'import restano prevedibili.
async function freshModule() {
  return import(`${MODULE_URL.href}?t=${Date.now()}-${Math.random()}`);
}

function bodyOf(call) {
  return JSON.parse(call.options.body);
}
function headersOf(call) {
  return call.options.headers;
}

test("nessuna sessione presente: l'insert analytics parte comunque verso /rest/v1/site_events", async () => {
  const env = installBrowserEnv();
  try {
    const { trackPageView } = await freshModule();
    trackPageView("/");
    await new Promise((r) => setImmediate(r));

    assert.ok(env.calls.length >= 1, "atteso almeno un POST site_events");
    const pageView = env.calls.find((c) => bodyOf(c).event_name === "page_view");
    assert.ok(pageView, "atteso un evento page_view");
    assert.equal(pageView.url, `${PUBLIC_URL}/rest/v1/site_events`);
    assert.equal(pageView.options.method, "POST");
  } finally {
    env.restore();
  }
});

test("la richiesta porta SOLO header pubblici: apikey + Authorization = chiave pubblica, mai un JWT utente", async () => {
  const env = installBrowserEnv({
    // Sessioni tipiche del client principale, entrambe con token utente.
    localStorage: makeStorage({
      vp_supabase_session: JSON.stringify({
        accessToken: STALE_USER_JWT,
        access_token: STALE_USER_JWT,
        refreshToken: STALE_REFRESH_TOKEN,
        refresh_token: STALE_REFRESH_TOKEN,
      }),
      "sb-project-under-test-auth-token": JSON.stringify({ access_token: STALE_USER_JWT, refresh_token: STALE_REFRESH_TOKEN }),
    }),
  });
  try {
    const { trackPageView } = await freshModule();
    trackPageView("/listino");
    await new Promise((r) => setImmediate(r));

    assert.ok(env.calls.length >= 1);
    for (const call of env.calls) {
      const h = headersOf(call);
      assert.equal(h.apikey, PUBLIC_ANON_KEY, "apikey deve essere la chiave pubblica");
      assert.equal(h.Authorization, `Bearer ${PUBLIC_ANON_KEY}`, "Authorization deve portare la chiave pubblica, non un JWT utente");
      // Nessun header residuo che possa trasportare identita' utente.
      const headerNames = Object.keys(h).map((n) => n.toLowerCase());
      assert.deepEqual(
        headerNames.sort(),
        ["apikey", "authorization", "content-type", "prefer"].sort(),
        "set di header inatteso",
      );
    }
  } finally {
    env.restore();
  }
});

test("JWT principale scaduto in localStorage: nessun frammento del token viene propagato nella richiesta analytics", async () => {
  const env = installBrowserEnv({
    localStorage: makeStorage({
      vp_supabase_session: JSON.stringify({
        access_token: STALE_USER_JWT,
        refresh_token: STALE_REFRESH_TOKEN,
        expires_at: 1500000000,
      }),
    }),
  });
  try {
    const { trackPageView, trackConsultationRequested } = await freshModule();
    trackPageView("/");
    trackConsultationRequested();
    await new Promise((r) => setImmediate(r));

    assert.ok(env.calls.length >= 1);
    for (const call of env.calls) {
      const serialized = JSON.stringify({ url: call.url, options: call.options });
      assert.ok(!serialized.includes(STALE_USER_JWT), "il JWT utente non deve comparire nella richiesta");
      assert.ok(!serialized.includes(STALE_REFRESH_TOKEN), "il refresh token non deve comparire nella richiesta");
      assert.ok(!/eyJ[A-Za-z0-9_-]+\.eyJ/.test(serialized), "nessun JWT a tre segmenti nella richiesta");
    }
  } finally {
    env.restore();
  }
});

test("sessione VALIDA nel client principale: il tracking resta indipendente (stesso percorso anon, nessun token letto)", async () => {
  const validJwt =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
    "eyJyb2xlIjoiYXV0aGVudGljYXRlZCIsImV4cCI6NDEwMjQ0NDgwMH0." +
    "dmFsaWRfbG9va2luZ19zaWduYXR1cmU";
  const env = installBrowserEnv({
    localStorage: makeStorage({
      vp_supabase_session: JSON.stringify({ access_token: validJwt, refresh_token: "valid-refresh", expires_at: 4102444800 }),
    }),
  });
  try {
    const { trackPageView } = await freshModule();
    trackPageView("/dashboard");
    await new Promise((r) => setImmediate(r));

    assert.ok(env.calls.length >= 1);
    for (const call of env.calls) {
      assert.equal(headersOf(call).Authorization, `Bearer ${PUBLIC_ANON_KEY}`);
      assert.ok(!JSON.stringify(call.options).includes(validJwt), "anche un JWT valido non deve essere usato dal tracking");
    }
  } finally {
    env.restore();
  }
});

test("event allowlist (FASE 2): 11 nomi consentiti, i tracker pubblici usano solo quelli", async () => {
  const env = installBrowserEnv();
  try {
    const mod = await freshModule();
    assert.deepEqual(
      Object.values(mod.SITE_EVENT_NAMES).sort(),
      [
        "consultation_requested", "page_view", "quote_completed", "quote_started", "session_started",
        "municipality_selected", "quantity_selected", "service_selected", "extras_selected",
        "quote_step_reached", "quote_abandoned",
      ].sort(),
    );
    mod.trackQuoteCompleted({ campaignId: "11111111-1111-4111-8111-111111111111" });
    await new Promise((r) => setImmediate(r));
    for (const call of env.calls) {
      assert.ok(Object.values(mod.SITE_EVENT_NAMES).includes(bodyOf(call).event_name));
    }
  } finally {
    env.restore();
  }
});

test("nessuna PII: il body contiene solo colonne dello schema site_events (FASE 2), mai email/nome/telefono/IP", async () => {
  const env = installBrowserEnv();
  try {
    const { trackPageView } = await freshModule();
    trackPageView("/preventivo?utm_source=google&email=test@x.it");
    await new Promise((r) => setImmediate(r));

    const ALLOWED = new Set([
      "event_name", "anonymous_session_id", "session_id", "path",
      "referrer_host", "referrer_type",
      "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
      "device_type", "browser", "os", "campaign_id", "quote_id", "metadata",
    ]);
    assert.ok(env.calls.length >= 1);
    for (const call of env.calls) {
      const body = bodyOf(call);
      for (const k of Object.keys(body)) assert.ok(ALLOWED.has(k), `colonna inattesa nel body: ${k}`);
      // path privo di query string, nessuna PII propagata
      assert.equal(body.path, "/preventivo");
      const serialized = JSON.stringify(body);
      assert.doesNotMatch(serialized, /@[a-z0-9.-]+\.[a-z]{2,}/i, "nessuna email nel body");
      assert.doesNotMatch(serialized, /\b(?:\d{1,3}\.){3}\d{1,3}\b/, "nessun IP nel body");
      // il client non deve MAI settare la geo
      assert.equal(body.country, undefined);
      assert.equal(body.city, undefined);
    }
  } finally {
    env.restore();
  }
});

test("fire-and-forget: un errore di rete su fetch non propaga eccezioni ai chiamanti", async () => {
  const env = installBrowserEnv({
    fetchImpl: async () => {
      throw new Error("network down");
    },
  });
  try {
    const { trackPageView, trackQuoteStarted, trackConsultationRequested } = await freshModule();
    assert.doesNotThrow(() => trackPageView("/"));
    assert.doesNotThrow(() => trackQuoteStarted());
    assert.doesNotThrow(() => trackConsultationRequested());
    await new Promise((r) => setImmediate(r));
  } finally {
    env.restore();
  }
});

// Codice del modulo con i commenti rimossi: le assertion sul contratto
// devono guardare cosa il modulo FA, non la prosa esplicativa (che cita di
// proposito i termini del bug storico, es. "setSession bridge").
const CODE_ONLY = SOURCE
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .map((line) => line.replace(/\/\/.*$/, ""))
  .join("\n");

test("contratto sorgente: siteEvents.js non tocca il client SDK principale ne' alcuna sessione auth", () => {
  // Nessun import del client principale (che eredita la sessione persistita).
  assert.doesNotMatch(CODE_ONLY, /from\s+["']\.\.\/\.\.\/supabaseClient(\.js)?["']/, "non deve importare src/supabaseClient.js");
  assert.doesNotMatch(CODE_ONLY, /createClient\s*\(/, "non deve istanziare un client @supabase/supabase-js");

  // Nessuna lettura/scrittura di sessione, nessun refresh di login.
  for (const forbidden of [
    "access_token", "accessToken", "refresh_token", "refreshToken",
    "setSession", "getSession", "onAuthStateChange",
    "persistSession", "autoRefreshToken", "detectSessionInUrl",
    "vp_supabase_session", "ensureSupabaseSessionBridge",
  ]) {
    assert.ok(!CODE_ONLY.includes(forbidden), `siteEvents.js non deve riferirsi a "${forbidden}" nel codice`);
  }

  // Nessun service_role nel frontend.
  assert.doesNotMatch(CODE_ONLY, /service_role|SERVICE_ROLE|sb_secret_/, "nessun riferimento a service_role");

  // Nessuna chiave hardcoded: la config arriva solo dalle env pubbliche.
  assert.doesNotMatch(CODE_ONLY, /sb_publishable_[A-Za-z0-9]/, "nessuna publishable key hardcoded");
  assert.doesNotMatch(CODE_ONLY, /eyJ[A-Za-z0-9_-]{10,}\.eyJ/, "nessun JWT hardcoded");
  assert.match(CODE_ONLY, /VITE_SUPABASE_URL/, "deve leggere VITE_SUPABASE_URL");
  assert.match(CODE_ONLY, /VITE_SUPABASE_ANON_KEY/, "deve leggere VITE_SUPABASE_ANON_KEY");

  // L'unico endpoint contattato e' la tabella site_events via REST.
  assert.match(CODE_ONLY, /\/rest\/v1\/site_events/, "deve inserire in /rest/v1/site_events");

  // Header della richiesta: solo apikey + Authorization con la chiave anon.
  assert.match(CODE_ONLY, /Authorization:\s*`Bearer \$\{anonKey\}`/, "Authorization deve usare anonKey, non un JWT utente");
});
