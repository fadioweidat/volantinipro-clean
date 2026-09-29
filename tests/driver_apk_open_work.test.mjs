// BUG DRIVER APK — link WhatsApp -> "Apri il lavoro" -> Start GPS.
// Contract test sul sorgente (main.jsx chiama createRoot(...).render(...) a
// livello di modulo, non importabile sotto node:test — stessa convenzione di
// tests/driver_white_page_recovery.test.mjs).
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { parseSha256, buildAssetLinks, PACKAGE_NAME, KEY_ALIAS } from "../scripts/android-driver-signing.mjs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const mainJsx = read("../src/main.jsx");
const assistantHost = read("../src/components/ai/driver/DriverAssistantHost.jsx");
const workflow = read("../.github/workflows/build-android-driver.yml");

function rootBody() {
  const start = mainJsx.indexOf("function Root()");
  const end = mainJsx.indexOf("createRoot(", start);
  assert.ok(start > 0 && end > start, "Root() non trovato in main.jsx");
  return mainJsx.slice(start, end);
}

test("Root: la home nativa Driver ritorna solo DOPO tutti gli hook (no React #310)", () => {
  const body = rootBody();
  const earlyReturn = body.indexOf('if (nativeDriverApp && path === "/")');
  assert.ok(earlyReturn > 0, "return della home nativa non trovato");
  const hookRe = /\buse(State|Effect|Memo|Callback|Ref|LayoutEffect)\s*\(/g;
  let lastHook = -1;
  for (let m; (m = hookRe.exec(body));) lastHook = m.index;
  assert.ok(lastHook > 0);
  assert.ok(
    earlyReturn > lastHook,
    "un hook di Root e' dopo il return della home nativa: il passaggio / -> /driver/... cambia il numero di hook",
  );
});

test("Home APK: unico pulsante 'Apri il lavoro', nessun copia/incolla", () => {
  const start = mainJsx.indexOf("function DriverNativeHome");
  const end = mainJsx.indexOf("function Root()");
  const home = mainJsx.slice(start, end);
  assert.equal((home.match(/<button\b/g) || []).length, 1);
  assert.match(home, />\s*Apri il lavoro\s*</);
  assert.doesNotMatch(home, /<input\b|clipboard|Incolla/i);
});

test("Deep link nativo e home conservano query (?access=TOKEN)", () => {
  assert.match(mainJsx, /return `\$\{url\.pathname\}\$\{url\.search\}\$\{url\.hash\}`/);
  assert.match(mainJsx, /window\.history\.replaceState\(\{\}, "", route\)/);
});

test("Assistente Driver: nessuna navigazione che perde ?access=", () => {
  assert.doesNotMatch(assistantHost, /window\.location\.href\s*=\s*`\/driver\//);
  assert.match(assistantHost, /navigateDriver\(driverPathWithQuery\(`\/driver\/assignment\/\$\{targetId\}\/map`\)\)/);
});

test("CI APK: env Supabase inlineate e verificate prima della build Android", () => {
  const buildStep = workflow.slice(workflow.indexOf("- name: Build web app"), workflow.indexOf("- name: Create Android project"));
  assert.match(buildStep, /VITE_SUPABASE_URL:\s*\$\{\{/);
  assert.match(buildStep, /VITE_SUPABASE_ANON_KEY:\s*\$\{\{/);
  assert.match(buildStep, /grep -rqF "\$host" dist\/assets/);
  assert.match(workflow, /- name: Check Driver build configuration/);
  assert.ok(
    workflow.indexOf("Check Driver build configuration") < workflow.indexOf("- name: Build web app"),
    "il controllo configurazione deve precedere la build",
  );
  assert.match(workflow, /versionCode \$\{\{ github\.run_number \}\}/);
});

// --- Token del link WhatsApp: generazione -> deep link APK -> hook Driver ----
// normalizeDriverRoute e' definita in main.jsx (non importabile): la
// valutiamo dal sorgente reale, cosi' il test segue il codice vero.
function loadNormalizeDriverRoute() {
  const reLine = mainJsx.match(/const DRIVER_ROUTE_RE = .*;/)[0];
  const start = mainJsx.indexOf("function normalizeDriverRoute(value)");
  const end = mainJsx.indexOf("function DriverNativeHome");
  return new Function(`${reLine}\n${mainJsx.slice(start, end)}\nreturn normalizeDriverRoute;`)();
}
const adminApi = read("../src/lib/services/admin-api.js");

test("Link WhatsApp: ?access= codificato e conservato fino all'hook Driver", () => {
  assert.match(adminApi, /\?access=\$\{encodeURIComponent\(accessToken\)\}/);
  const normalize = loadNormalizeDriverRoute();
  const token = "tok+/=&ç test"; // sintetico, caratteri che richiedono encoding
  const id = "0b0e4a52-6c3d-4f55-9a1e-2f6b8d7c1a90";
  const link = `https://www.volantinipro.it/driver/assignment/${id}?access=${encodeURIComponent(token)}`;
  const route = normalize(link);
  assert.ok(route, "link Driver valido rifiutato");
  const url = new URL(route, "https://localhost");
  assert.equal(url.pathname, `/driver/assignment/${id}`);
  // stessa lettura di readAccessTokenFromLocation (useDriverAssignment.js)
  assert.equal(url.searchParams.get("access"), token);
  assert.equal(normalize(link.replace("www.volantinipro.it", "volantinipro.it")), route);
});

test("Deep link: host estranei e route non Driver rifiutati", () => {
  const normalize = loadNormalizeDriverRoute();
  assert.equal(normalize("https://evil.example/driver/assignment/x?access=a"), null);
  assert.equal(normalize("https://www.volantinipro.it/admin"), null);
  assert.equal(normalize(null), null);
});

// --- Firma Android stabile + assetlinks.json ---------------------------------

test("Firma: parse SHA-256 da keytool e rifiuto di fingerprint non validi", () => {
  const fp = Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, "0").toUpperCase()).join(":");
  assert.equal(parseSha256(`Certificate fingerprints:\n\t SHA1: AA\n\t SHA256: ${fp.toLowerCase()}\n`), fp);
  assert.equal(parseSha256("nessun fingerprint"), null);
  assert.throws(() => buildAssetLinks("AA:BB"));
  assert.throws(() => buildAssetLinks(""));
  assert.equal(buildAssetLinks(fp)[0].target.package_name, "it.volantinipro.driver");
});

test("assetlinks.json (se presente): JSON valido, package Driver, fingerprint reale-formato", () => {
  const file = new URL("../public/.well-known/assetlinks.json", import.meta.url);
  if (!existsSync(file)) return;
  const links = JSON.parse(readFileSync(file, "utf8"));
  const target = links[0].target;
  assert.deepEqual(links[0].relation, ["delegate_permission/common.handle_all_urls"]);
  assert.equal(target.package_name, PACKAGE_NAME);
  assert.ok(target.sha256_cert_fingerprints.length >= 1);
  for (const fp of target.sha256_cert_fingerprints) assert.match(fp, /^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/);
  const capConfig = read("../capacitor.config.ts");
  assert.match(capConfig, new RegExp(`appId: '${PACKAGE_NAME.replace(/\./g, "\.")}'`));
});

test("CI APK: firma stabile via secret e blocco se il certificato non e' in assetlinks.json", () => {
  const sign = workflow.slice(workflow.indexOf("- name: Sign APK with stable key"), workflow.indexOf("- name: Upload APK"));
  assert.match(sign, /secrets\.ANDROID_KEYSTORE_BASE64/);
  assert.match(sign, /--ks-pass env:ANDROID_KEYSTORE_PASSWORD/);
  assert.match(sign, new RegExp(`--ks-key-alias ${KEY_ALIAS}`));
  assert.match(sign, /grep -qF "\$sha" public\/\.well-known\/assetlinks\.json/);
  assert.doesNotMatch(workflow, /echo "\$ANDROID_KEYSTORE_PASSWORD"|echo "\$VITE_SUPABASE_ANON_KEY"/);
});
