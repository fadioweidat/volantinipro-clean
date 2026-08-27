// Pre-go-live: contratti che bloccano regressioni sulla configurazione
// necessaria a far girare VolantiniPro su dominio produzione
// (https://www.volantinipro.it) senza dipendere da localhost/ngrok.
//
// Nessun deploy, nessuna modifica a DB/RLS: solo verifiche statiche su
// .env.example, vercel.json, publicAppUrl e assenza di URL locali hardcoded.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

const ENV_EXAMPLE = read(".env.example");
const VERCEL_JSON = read("vercel.json");
const PUBLIC_APP_URL_SRC = read("src/lib/publicAppUrl.js");

// Codice (commenti // e /* */ rimossi) di un file sorgente.
function codeOnly(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

// --- .env.example: copertura variabili production-required ------------------

// Elenco CURATO (non derivato da grep, per non includere flag dev-only):
// variabili frontend che devono essere impostate su Vercel in Production.
const FRONTEND_REQUIRED = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "VITE_PUBLIC_APP_URL",
  "VITE_MAPBOX_TOKEN",
  "VITE_IBAN",
  "VITE_INTESTATARIO",
  "VITE_BANCA",
];

// Variabili server-side (Supabase Secrets) senza le quali una feature core
// non parte in Production.
const SERVER_REQUIRED = [
  "SITE_URL",
  "FADI_ALLOWED_ORIGINS",
  "FADI_ONE_SECRET",
  "PLATFORM_HEALTH_COLLECTOR_SECRET",
  "SUPABASE_SERVICE_ROLE_KEY",
];

test(".env.example documenta ogni variabile frontend production-required", () => {
  for (const name of FRONTEND_REQUIRED) {
    assert.match(ENV_EXAMPLE, new RegExp(`^${name}=`, "m"), `${name} mancante da .env.example`);
  }
});

test(".env.example documenta ogni variabile server production-required", () => {
  for (const name of SERVER_REQUIRED) {
    assert.match(ENV_EXAMPLE, new RegExp(`^${name}=`, "m"), `${name} mancante da .env.example`);
  }
});

test(".env.example marca esplicitamente le classi REQUIRED / OPTIONAL / DEV", () => {
  assert.match(ENV_EXAMPLE, /REQUIRED in Production/i);
  assert.match(ENV_EXAMPLE, /OPTIONAL/);
  assert.match(ENV_EXAMPLE, /DEV|Dev \/ test only/i);
});

// --- .env.example: nessun secret / nessun valore reale --------------------

test(".env.example: nessuna variabile secret usa il prefisso VITE_", () => {
  const viteLines = ENV_EXAMPLE.split("\n").filter((l) => /^VITE_[A-Z0-9_]+=/.test(l));
  for (const line of viteLines) {
    const name = line.split("=")[0];
    assert.ok(!/SERVICE_ROLE|SECRET|PRIVATE_KEY/.test(name), `${name}: un secret non deve avere prefisso VITE_`);
  }
  assert.ok(!/^VITE_SERVICE_ROLE/m.test(ENV_EXAMPLE), "VITE_SERVICE_ROLE non deve esistere");
  assert.ok(!/VITE_SUPABASE_SERVICE_ROLE/.test(ENV_EXAMPLE), "service_role non deve mai essere VITE_");
});

test(".env.example: solo placeholder, nessun valore reale/secret", () => {
  // Nessun JWT a tre segmenti.
  assert.doesNotMatch(ENV_EXAMPLE, /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\./, "JWT reale in .env.example");
  // Nessuna service-role / secret key Supabase in formato reale.
  assert.doesNotMatch(ENV_EXAMPLE, /sb_secret_[A-Za-z0-9]{10,}/, "secret key reale in .env.example");
  // OpenAI: 'sk-your-...' ok; 'sk-' + >=20 char alfanumerici plausibili no.
  assert.doesNotMatch(ENV_EXAMPLE, /sk-[A-Za-z0-9]{20,}/, "OpenAI key reale in .env.example");
  // Mapbox: 'pk.your_...' ok; un pk. con base64/JWT lungo no.
  assert.doesNotMatch(ENV_EXAMPLE, /pk\.eyJ[A-Za-z0-9]/, "Mapbox token reale in .env.example");
  // Nessun host localhost/ngrok imposto come default di produzione.
  assert.doesNotMatch(ENV_EXAMPLE, /^VITE_PUBLIC_APP_URL=https?:\/\/(localhost|127\.0\.0\.1|[a-z0-9-]+\.ngrok)/m);
});

test(".env.example: VITE_PUBLIC_APP_URL punta al dominio di produzione", () => {
  assert.match(ENV_EXAMPLE, /^VITE_PUBLIC_APP_URL=https:\/\/www\.volantinipro\.it\s*$/m);
});

// --- vercel.json: SPA rewrite copre i deep link ------------------------

test("vercel.json: rewrite SPA catch-all verso /index.html (deep link Admin/Driver/Cliente)", () => {
  const cfg = JSON.parse(VERCEL_JSON);
  assert.ok(Array.isArray(cfg.rewrites) && cfg.rewrites.length >= 1, "manca 'rewrites'");
  const catchAll = cfg.rewrites.find(
    (r) => /^\/\(\.\*\)$|^\/:path\*$|^\/\(\.\+\)$/.test(r.source) && /\/index\.html$/.test(r.destination),
  );
  assert.ok(catchAll, "manca un rewrite catch-all verso /index.html");

  // I path SPA reali devono combaciare con la source del catch-all.
  const re = new RegExp(catchAll.source.replace(/^\//, "^/").replace("(.*)", ".*") + "$");
  for (const deep of [
    "/admin",
    "/admin/live",
    "/driver/assignment/abc-123",
    "/driver/assignment/abc-123/map",
    "/driver/tracking/xyz",
    "/customer/campaigns/9/tracking",
    "/dashboard",
  ]) {
    assert.ok(re.test(deep), `il rewrite non copre ${deep}`);
  }
});

// --- publicAppUrl: VITE_PUBLIC_APP_URL preferita, poi window.location ----

test("publicAppUrl: usa VITE_PUBLIC_APP_URL quando presente, altrimenti window.location.origin", () => {
  const code = codeOnly(PUBLIC_APP_URL_SRC);
  assert.match(code, /import\.meta\.env\.VITE_PUBLIC_APP_URL/, "deve leggere VITE_PUBLIC_APP_URL");
  assert.match(code, /window\.location\.origin/, "deve avere il fallback window.location.origin");
  // La configurata ha la precedenza: compare prima del fallback nel sorgente.
  const idxConfigured = code.indexOf("VITE_PUBLIC_APP_URL");
  const idxFallback = code.indexOf("window.location.origin");
  assert.ok(idxConfigured >= 0 && idxFallback > idxConfigured, "VITE_PUBLIC_APP_URL deve essere valutata prima del fallback");
  // Nessun dominio hardcoded nel resolver.
  assert.doesNotMatch(code, /https?:\/\/[a-z0-9.-]*volantinipro\.it/i, "nessun dominio hardcoded in publicAppUrl.js");
});

// --- nessun localhost / ngrok / IP LAN hardcoded nei percorsi di produzione -

test("src/: nessun URL localhost/ngrok/127.0.0.1/IP-LAN hardcoded nel codice di produzione", () => {
  const offenders = [];
  const SKIP_DIRS = new Set(["node_modules", "dist", "__tests__"]);
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        if (!SKIP_DIRS.has(entry)) walk(full);
        continue;
      }
      if (!/\.(js|jsx|ts|tsx)$/.test(entry)) continue;
      if (/\.(test|spec)\./.test(entry)) continue;
      const code = codeOnly(readFileSync(full, "utf8"));
      const re = /["'`]https?:\/\/(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|[a-z0-9-]+\.ngrok[a-z0-9.-]*)/i;
      code.split("\n").forEach((line, i) => {
        if (re.test(line)) offenders.push(`${path.relative(ROOT, full)}:${i + 1}  ${line.trim().slice(0, 120)}`);
      });
    }
  };
  walk(path.join(ROOT, "src"));
  assert.deepEqual(offenders, [], `URL locali hardcoded trovati:\n${offenders.join("\n")}`);
});

// --- driver link costruito su getPublicAppUrl() -----------------------

test("generateDriverAssignmentLink e group-ops usano getPublicAppUrl(), non window.location diretto", () => {
  const adminApi = codeOnly(read("src/lib/services/admin-api.js"));
  const groupOps = codeOnly(read("src/lib/services/group-ops.js"));
  assert.match(adminApi, /getPublicAppUrl\(\)/);
  assert.match(adminApi, /\/driver\/assignment\//);
  assert.match(groupOps, /getPublicAppUrl\(\)/);
});
