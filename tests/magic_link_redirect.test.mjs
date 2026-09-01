// Fix magic link Cliente/Admin: il redirect_to del magic link in PRODUZIONE
// deve sempre essere costruito dal dominio pubblico (VITE_PUBLIC_APP_URL),
// mai da window.location.origin — che su un dev server LAN/localhost e' un
// IP privato non raggiungibile dal link ricevuto via email
// (bug: http://192.168.10.65:5174/#access_token=...).
//
// Convenzione test: src/lib/publicAppUrl.js e volantinipro-final.jsx
// dipendono da import.meta.env, non eseguibile sotto `node --test` puro
// (vedi tests/env_production_readiness.test.mjs), quindi qui si verifica il
// contratto sul sorgente (stesso approccio gia' usato per publicAppUrl).

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const PUBLIC_APP_URL_SRC = readFileSync(new URL("../src/lib/publicAppUrl.js", import.meta.url), "utf8");
const FINAL_SRC = readFileSync(new URL("../volantinipro-final.jsx", import.meta.url), "utf8");
const ROUTE_RES_SRC = readFileSync(new URL("../src/app/routeResolution.js", import.meta.url), "utf8");
const SESSION_SRC = readFileSync(new URL("../src/auth/session.js", import.meta.url), "utf8");

function codeOnly(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
}
const PUBLIC_APP_URL_CODE = codeOnly(PUBLIC_APP_URL_SRC);
// volantinipro-final.jsx e' un monolite di ~370KB con molte regex literal
// contenenti sequenze /* */ e //: uno strip naive dei commenti lo devasta.
// Per questo file si asserisce sul sorgente grezzo; i pochi riferimenti a
// IP/porta stanno solo in commenti che citano di proposito il bug (192.168.x.x,
// mai l'IP reale 192.168.10.65).
const FINAL_CODE = FINAL_SRC;

// Isola il corpo di getAuthRedirectBase.
function authRedirectBaseBody(code) {
  const start = code.indexOf("export function getAuthRedirectBase()");
  assert.ok(start >= 0, "getAuthRedirectBase non trovata in publicAppUrl.js");
  // fino alla prossima 'export function' o fine file
  const rest = code.slice(start + 1);
  const next = rest.indexOf("\nexport function ");
  return code.slice(start, next >= 0 ? start + 1 + next : undefined);
}
const AUTH_BASE_BODY = authRedirectBaseBody(PUBLIC_APP_URL_CODE);

// --- costruttore del redirect magic link -------------------------------

test("signInWithOtp: emailRedirectTo usa getAuthRedirectBase(), non window.location.origin", () => {
  assert.match(FINAL_CODE, /signInWithOtp\(\{/, "chiamata signInWithOtp non trovata");
  assert.match(FINAL_CODE, /emailRedirectTo:\s*`\$\{getAuthRedirectBase\(\)\}\$\{redirectPath\}`/,
    "emailRedirectTo deve usare getAuthRedirectBase()");
  assert.doesNotMatch(FINAL_CODE, /emailRedirectTo:\s*`\$\{window\.location\.origin\}/,
    "emailRedirectTo non deve piu' usare window.location.origin");
});

test("volantinipro-final.jsx importa getAuthRedirectBase dall'helper unico", () => {
  assert.match(FINAL_CODE, /import\s*\{[^}]*getAuthRedirectBase[^}]*\}\s*from\s*["']\.\/src\/lib\/publicAppUrl\.js["']/);
});

test("redirectPath del magic link resta /auth/callback", () => {
  assert.match(FINAL_CODE, /const redirectPath = "\/auth\/callback"/);
});

// --- helper getAuthRedirectBase: regola prod vs dev -------------------

test("getAuthRedirectBase: in DEV ritorna window.location.origin", () => {
  assert.match(AUTH_BASE_BODY, /if\s*\(\s*import\.meta\.env\.DEV\s*\)/, "deve ramificare su import.meta.env.DEV");
  // Nel ramo DEV compare currentOrigin (derivato da window.location.origin).
  const devBranch = AUTH_BASE_BODY.slice(AUTH_BASE_BODY.indexOf("import.meta.env.DEV"));
  assert.match(devBranch, /return\s+currentOrigin/, "il ramo DEV deve tornare l'origin corrente");
  assert.match(AUTH_BASE_BODY, /currentOrigin\s*=[\s\S]*window\.location\.origin/,
    "currentOrigin deve derivare da window.location.origin");
});

test("getAuthRedirectBase: in PRODUZIONE usa VITE_PUBLIC_APP_URL e mai window.location.origin come valore primario", () => {
  assert.match(AUTH_BASE_BODY, /const configured =[\s\S]*import\.meta\.env\.VITE_PUBLIC_APP_URL/,
    "configured deve derivare da VITE_PUBLIC_APP_URL");
  // Dopo il ramo DEV, la produzione ritorna `configured` prima di qualunque
  // fallback su currentOrigin.
  const prodPart = AUTH_BASE_BODY.slice(AUTH_BASE_BODY.indexOf("import.meta.env.DEV"));
  assert.match(prodPart, /if \(configured\) return configured/, "la produzione deve tornare VITE_PUBLIC_APP_URL");
  const idxConfiguredReturn = prodPart.indexOf("if (configured) return configured");
  const idxOriginFallback = prodPart.indexOf("return currentOrigin", idxConfiguredReturn);
  assert.ok(idxOriginFallback === -1 || idxConfiguredReturn < idxOriginFallback,
    "in produzione currentOrigin e' solo un fallback DOPO configured");
  // Quel fallback e' segnalato come errore di configurazione.
  assert.match(prodPart, /AUTH_REDIRECT_BASE_MISSING_PUBLIC_APP_URL/);
});

test("getAuthRedirectBase: nessun dominio / IP / porta hardcoded", () => {
  assert.doesNotMatch(AUTH_BASE_BODY, /https?:\/\/[a-z0-9.-]*volantinipro\.it/i, "nessun dominio hardcoded");
  assert.doesNotMatch(AUTH_BASE_BODY, /192\.168\./, "nessun IP LAN hardcoded");
  assert.doesNotMatch(AUTH_BASE_BODY, /localhost:\d+|:5174/, "nessuna porta dev hardcoded");
});

test("getPublicAppUrl resta un export separato (driver flow invariato)", () => {
  assert.match(PUBLIC_APP_URL_CODE, /export function getPublicAppUrl\(\)/);
  assert.match(PUBLIC_APP_URL_CODE, /export function getAuthRedirectBase\(\)/);
});

// --- nessun origin locale nel codice production-reachable ------------

test("nessun 192.168.10.65 / localhost:5174 nel codice production-reachable", () => {
  for (const [name, code] of [
    ["volantinipro-final.jsx", FINAL_CODE],
    ["src/lib/publicAppUrl.js", PUBLIC_APP_URL_CODE],
  ]) {
    assert.doesNotMatch(code, /192\.168\.10\.65/, `${name}: IP LAN hardcoded`);
    assert.doesNotMatch(code, /localhost:5174|127\.0\.0\.1:5174/, `${name}: origin dev hardcoded`);
  }
});

// --- callback: routing + pulizia hash ------------------------------

test("callback: /auth/callback risolve alla login page e l'hash con token ci passa", () => {
  assert.match(ROUTE_RES_SRC, /if\s*\(hasAuthHash\)\s*return\s*'login'/);
  assert.match(ROUTE_RES_SRC, /p === '\/auth\/callback'\)\s*return\s*'login'/);
});

test("callback: Cliente -> dashboard, Admin -> admin (ruolo verificato dal backend)", () => {
  const s = FINAL_CODE.indexOf('window.location.hash.includes("access_token")');
  assert.ok(s >= 0, "blocco callback non trovato");
  const cb = FINAL_CODE.slice(s, s + 7200);
  assert.match(cb, /verifySupabaseAdminRole\(restoredSession\)/, "il ruolo Admin e' verificato lato backend");
  assert.match(cb, /onNav\("admin"\)/, "Admin -> /admin");
  assert.match(cb, /onNav\(pendingReturnToStep4 \? "step4" : "dashboard"\)/, "Cliente -> /dashboard (o step4 se pending)");
});

test("callback: Fornitore -> /supplier (SupplierGuard gestisce il rifiuto), stesso magic link", () => {
  const s = FINAL_CODE.indexOf('window.location.hash.includes("access_token")');
  const cb = FINAL_CODE.slice(s, s + 7200);
  // intento supplier catturato PRIMA di clearPendingAuthContext, poi instrada
  // su /supplier (route esistente -> SupplierGuard). Nessun ruolo concesso qui.
  assert.match(cb, /const loginIntentIsSupplier = isSupplierContext;/);
  assert.match(cb, /if \(loginIntentIsSupplier\) \{\s*onNav\("supplier-dashboard"\);/);
  // il branch supplier NON deve precedere/soppiantare quello Admin
  assert.ok(cb.indexOf('onNav("admin")') < cb.indexOf('onNav("supplier-dashboard")'),
    "Admin resta valutato prima di Fornitore");
  // context supplier -> memorizzato nel pending context per il round-trip del magic link
  assert.match(FINAL_CODE, /rememberPendingAuthContext\(isAdminContext \? "admin" : isDriverContext \? "driver" : isSupplierContext \? "supplier" : "customer"\)/);
  // stesso Supabase Auth: nessuna nuova chiamata OTP dedicata al supplier
  const otpCount = (FINAL_CODE.match(/signInWithOtp\(\{/g) || []).length;
  assert.equal(otpCount, 1, "un solo signInWithOtp condiviso da tutti i context");
});

test("callback: context=supplier non passa mai dalla Dashboard Cliente", () => {
  const s = FINAL_CODE.indexOf('window.location.hash.includes("access_token")');
  const cb = FINAL_CODE.slice(s, s + 7200);
  // il return del branch supplier impedisce di raggiungere onNav(... "dashboard")
  const supplierIdx = cb.indexOf('if (loginIntentIsSupplier) {');
  const dashboardIdx = cb.indexOf('onNav(pendingReturnToStep4 ? "step4" : "dashboard")');
  assert.ok(supplierIdx >= 0 && dashboardIdx > supplierIdx, "il branch supplier precede il fallback dashboard");
  assert.match(cb.slice(supplierIdx, dashboardIdx), /onNav\("supplier-dashboard"\);\s*return;/);
});

test("callback: l'hash con access_token viene rimosso dall'URL dopo il restore", () => {
  // consumeSupabaseAuthHash e' invocata con il path pulito /auth/callback ...
  assert.match(FINAL_CODE, /consumeSupabaseAuthHash\(cleanPath\)/);
  assert.match(FINAL_CODE, /const cleanPath = "\/auth\/callback"/);
  // ... e la funzione fa replaceState per togliere il token dalla barra indirizzi.
  assert.match(SESSION_SRC, /consumeSupabaseAuthHash[\s\S]{0,600}window\.history\.replaceState\(null, "", cleanPath/);
});
