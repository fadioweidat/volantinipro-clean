// DISTRIBUZIONE APK + WHATSAPP — VolantiniPro Driver Android.
// Due messaggi indipendenti (installazione app / link lavoro personale),
// pagina statica /app-driver, workflow manuale di pubblicazione dell'APK.
// Contract test: nessun invio reale, nessun token reale.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  DRIVER_APP_DOWNLOAD_URL,
  DRIVER_APK_FILE_NAME,
  DRIVER_APK_FILE_URL,
  DRIVER_APP_BUTTON_LABEL,
  DRIVER_JOB_BUTTON_LABEL,
  buildDriverAppInstallWhatsAppMessage,
  buildDriverAppInstallWhatsAppUrl,
  buildDriverJobWhatsAppMessage,
} from "../src/lib/services/driverAppDistribution.js";
import { buildDriverWhatsAppMessage, buildSupplierProgramWhatsAppMessage } from "../src/lib/services/admin-api.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const lf = (s) => s.replace(/\r\n/g, "\n");
const mainJsx = read("../src/main.jsx");
const adminApi = read("../src/lib/services/admin-api.js");
const page = read("../public/app-driver/index.html");
const androidConfig = read("../scripts/configure-capacitor-android.mjs");
const releaseWorkflow = lf(read("../.github/workflows/release-android-driver.yml"));
const vercel = JSON.parse(read("../vercel.json"));

const V2_FINGERPRINT = "63:56:69:9C:14:1B:6F:F1:EA:39:28:32:99:A4:43:FD:D6:9D:99:F2:F9:08:1B:68:EA:19:6A:E6:56:4C:89:99";
const ASSETLINKS_SHA256 = "328ba71f6a0d20bd4631ed376524fad552303637f74e0ffb064f62f8269b7ca5";

// generateDriverAssignmentLink legge import.meta.env (assente sotto node):
// la valutiamo dal sorgente reale con il dominio pubblico di produzione.
function loadGenerateDriverAssignmentLink() {
  const start = adminApi.indexOf("export function generateDriverAssignmentLink");
  const end = adminApi.indexOf("\n}", start) + 2;
  const body = adminApi.slice(start, end).replace("export function", "function");
  return new Function("getPublicAppUrl", `${body}\nreturn generateDriverAssignmentLink;`)(() => "https://www.volantinipro.it");
}
function loadNormalizeDriverRoute() {
  const reLine = mainJsx.match(/const DRIVER_ROUTE_RE = .*;/)[0];
  const start = mainJsx.indexOf("function normalizeDriverRoute(value)");
  const end = mainJsx.indexOf("function DriverNativeHome");
  return new Function(`${reLine}\n${mainJsx.slice(start, end)}\nreturn normalizeDriverRoute;`)();
}

// ─── 1. URL download ─────────────────────────────────────────────────────────
test("URL download: https, dominio pubblico, fuori da /driver/, nome APK fisso", () => {
  assert.equal(DRIVER_APP_DOWNLOAD_URL, "https://www.volantinipro.it/app-driver");
  assert.equal(DRIVER_APK_FILE_NAME, "VolantiniPro-Driver.apk");
  assert.equal(DRIVER_APK_FILE_URL, "https://github.com/fadioweidat/volantinipro-clean/releases/latest/download/VolantiniPro-Driver.apk");
  assert.doesNotMatch(DRIVER_APP_DOWNLOAD_URL + DRIVER_APK_FILE_URL, /[?#]|access|token/i);
});

test("/app-driver NON e' intercettato dall'App Link Android ne' dal router Driver", () => {
  const prefixes = [...androidConfig.matchAll(/android:pathPrefix="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(prefixes)], ["/driver/"], "App Link Android invariato: solo /driver/");
  const path = new URL(DRIVER_APP_DOWNLOAD_URL).pathname;
  for (const prefix of prefixes) assert.ok(!path.startsWith(prefix) && !`${path}/`.startsWith(prefix));
  assert.equal(loadNormalizeDriverRoute()(DRIVER_APP_DOWNLOAD_URL), null);
  // I redirect Vercel non toccano /app-driver (solo host senza www -> www).
  assert.equal(vercel.redirects.length, 1);
  assert.equal(vercel.redirects[0].has[0].value, "volantinipro.it");
  // /app-driver serve la pagina statica prima del catch-all SPA (che resta ultimo).
  assert.deepEqual(vercel.rewrites, [
    { source: "/app-driver", destination: "/app-driver/index.html" },
    { source: "/(.*)", destination: "/index.html" },
  ]);
});

// ─── 2/4. Messaggio installazione ────────────────────────────────────────────
test("Messaggio «Invia app Android»: testo approvato, inoltrabile, nessun dato personale", () => {
  const msg = buildDriverAppInstallWhatsAppMessage();
  assert.equal(msg, [
    "📲 VOLANTINIPRO DRIVER",
    "",
    "Per lavorare con VolantiniPro installa l'app Android.",
    "",
    "⬇️ Scarica VolantiniPro Driver:",
    "https://www.volantinipro.it/app-driver",
    "",
    "L'app va installata una sola volta.",
    "",
    "Puoi inoltrare questo messaggio agli operatori che devono installare l'app.",
  ].join("\n"));
  assert.doesNotMatch(msg, /access=|\?|token|\/driver\/|assignment|campagna|compenso|€|[0-9a-f]{8}-[0-9a-f]{4}-/i);
  // Identico per chiunque: nessun parametro in ingresso.
  assert.equal(buildDriverAppInstallWhatsAppMessage.length, 0);
});

test("URL wa.me installazione: numero normalizzato o selettore contatti, stesso testo", () => {
  const withPhone = buildDriverAppInstallWhatsAppUrl("+39 351 767 3737");
  assert.ok(withPhone.startsWith("https://wa.me/393517673737?text="));
  const noPhone = buildDriverAppInstallWhatsAppUrl();
  assert.ok(noPhone.startsWith("https://wa.me/?text="));
  for (const url of [withPhone, noPhone]) {
    assert.equal(decodeURIComponent(url.split("?text=")[1]), buildDriverAppInstallWhatsAppMessage());
  }
});

// ─── 3/5. Messaggio lavoro ───────────────────────────────────────────────────
const LINK_A = "https://www.volantinipro.it/driver/assignment/0b0e4a52-6c3d-4f55-9a1e-2f6b8d7c1a90?access=tokA";

test("Messaggio «Invia link lavoro»: nuova cornice + dettagli esistenti conservati", () => {
  const msg = buildDriverWhatsAppMessage({
    operatorName: "Marco Rossi", groupName: "Squadra 1", campaignTitle: "Volantini Monza",
    date: "12/10/2026", startTime: "08:30",
    programRows: [{ name: "Centro", quantity: 2000 }, { name: "Stazione", quantity: 1500 }],
    qty: 3500, supplierCompensation: 140, notes: "Ritiro ore 8", link: LINK_A,
  });
  assert.ok(msg.startsWith("📍 NUOVO LAVORO ASSEGNATO\n\n"));
  for (const expected of [
    "Programma di lavoro — Squadra 1", "Campagna: Volantini Monza",
    /1\. Centro — 2\.?000 volantini/, /2\. Stazione — 1\.?500 volantini/, /Totale: 3\.?500 volantini/,
    "Compenso concordato: € 140,00", "Data: 12/10/2026", "Inizio: 08:30", "Note: Ritiro ore 8",
    `👇 Apri il tuo lavoro VolantiniPro:\n${LINK_A}\n`,
    "Apri il link e premi «Apri il lavoro».",
    "Quando inizi la distribuzione, avvia il GPS.",
  ]) {
    if (expected instanceof RegExp) assert.match(msg, expected); else assert.ok(msg.includes(expected), expected);
  }
  assert.ok(msg.endsWith("⚠️ Il link del lavoro è personale e non deve essere inoltrato ad altri operatori."));
  // Il messaggio lavoro non impone l'installazione: nessun link APK dentro.
  assert.ok(!msg.includes(DRIVER_APP_DOWNLOAD_URL) && !msg.includes(".apk"));
});

test("Cornice condivisa: usata da entrambi i builder, senza aggiungere dati", () => {
  assert.match(adminApi, /import \{ buildDriverJobWhatsAppMessage \} from '\.\/driverAppDistribution\.js';/);
  assert.equal((adminApi.match(/return buildDriverJobWhatsAppMessage\(\{/g) || []).length, 4);
  const framed = buildDriverJobWhatsAppMessage({ details: "DETTAGLI", link: "L" });
  assert.doesNotMatch(framed, /€|Compenso|Campagna/);
  assert.match(buildDriverJobWhatsAppMessage({ details: "D", link: null }), /Link non disponibile/);
  assert.match(buildDriverJobWhatsAppMessage({ details: "D", link: "L", mapLink: "M" }), /L\n\nApri mappa:\nM\n/);
});

// ─── Compensi: stesse autorizzazioni di prima ────────────────────────────────
test("Compenso: compare solo se il chiamante lo passa (regola invariata)", () => {
  const base = { campaignTitle: "C", date: "1/1/2026", qty: 100, link: LINK_A };
  for (const build of [
    (extra) => buildDriverWhatsAppMessage({ operatorName: "Op", comuni: ["X"], zone: ["Y"], ...base, ...extra }),
    (extra) => buildSupplierProgramWhatsAppMessage({ supplierName: "Forn", ...base, ...extra }),
  ]) {
    for (const none of [{}, { supplierCompensation: null }, { supplierCompensation: "" }]) {
      assert.doesNotMatch(build(none), /Compenso|€/);
    }
    assert.match(build({ supplierCompensation: 320 }), /Compenso concordato: € 320,00/);
  }
});

test("Compenso: le pagine Admin lo passano esattamente come prima", () => {
  const count = (file) => (read(`../src/pages/admin/${file}`).match(/supplierCompensation/g) || []).length;
  // Dashboard e Centro Operazioni non hanno mai passato compensi: resta cosi'.
  assert.equal(count("AdminDashboard.jsx"), 0);
  assert.equal(count("AdminOperationsCenter.jsx"), 0);
  for (const file of ["CampaignAssignments.jsx", "ClientsQuotes.jsx"]) {
    assert.match(read(`../src/pages/admin/${file}`), /supplierCompensation: savedSupplierCompensation\(assignment, (campaign|row)\)|supplierCompensation,/);
  }
});

// ─── 6/7/8/9. Due operatori, stessa APK, lavori successivi ───────────────────
test("Due operatori: link personali diversi, token solo nel link lavoro, stessa APK", () => {
  const generate = loadGenerateDriverAssignmentLink();
  const normalize = loadNormalizeDriverRoute();
  const a = generate("0b0e4a52-6c3d-4f55-9a1e-2f6b8d7c1a90", "token-operatore-A");
  const b = generate("7d1c9e10-2a4b-4c6d-8e9f-0a1b2c3d4e5f", "token-operatore-B");
  assert.notEqual(a, b);
  const msgA = buildDriverWhatsAppMessage({ operatorName: "A", campaignTitle: "C", date: "d", comuni: ["X"], zone: ["Y"], qty: 1, link: a });
  const msgB = buildDriverWhatsAppMessage({ operatorName: "B", campaignTitle: "C", date: "d", comuni: ["X"], zone: ["Y"], qty: 1, link: b });
  assert.ok(msgA.includes("access=token-operatore-A") && !msgA.includes("token-operatore-B"));
  assert.ok(msgB.includes("access=token-operatore-B") && !msgB.includes("token-operatore-A"));
  // ?access= preservato fino al router dell'app, per entrambi.
  assert.equal(new URL(normalize(a), "https://localhost").searchParams.get("access"), "token-operatore-A");
  assert.equal(new URL(normalize(b), "https://localhost").searchParams.get("access"), "token-operatore-B");
  // Stessa APK per entrambi: messaggio di installazione unico e senza token.
  const install = buildDriverAppInstallWhatsAppMessage();
  assert.ok(!install.includes("token-operatore") && !install.includes("access="));
  // Lavoro successivo: basta un nuovo link lavoro, che non rimanda al download.
  const next = buildDriverWhatsAppMessage({ operatorName: "A", campaignTitle: "C2", date: "d", comuni: ["X"], zone: ["Y"], qty: 1, link: generate("9f8e7d6c-5b4a-4321-8fed-cba987654321", "token-operatore-A2") });
  assert.ok(next.includes("access=token-operatore-A2") && !next.includes("app-driver"));
});

// ─── Pulsanti: due azioni separate nelle 5 pagine, logica nel servizio ───────
test("Admin: due azioni indipendenti in tutte le pagine che inviano il lavoro", () => {
  assert.equal(DRIVER_APP_BUTTON_LABEL, "📲 Invia app Android");
  assert.equal(DRIVER_JOB_BUTTON_LABEL, "📍 Invia link lavoro");
  for (const file of [
    "AdminDashboard.jsx", "AdminOperationsCenter.jsx", "CampaignAssignments.jsx",
    "ClientsQuotes.jsx", "assign-work/AssignWorkResultStep.jsx",
  ]) {
    const src = read(`../src/pages/admin/${file}`);
    assert.match(src, /from '(\.\.\/)+lib\/services\/driverAppDistribution\.js'/, file);
    assert.match(src, /DRIVER_APP_BUTTON_LABEL\}/, file);
    assert.match(src, /DRIVER_JOB_BUTTON_LABEL/, file);
    assert.match(src, /buildDriverAppInstallWhatsAppUrl\(/, file);
    // Nessun testo di installazione duplicato nelle pagine, nessuno stato "installata".
    assert.doesNotMatch(src, /VOLANTINIPRO DRIVER|app-driver|apk_installed|appInstalled|app_installed/i, file);
  }
});

// ─── Pagina /app-driver ──────────────────────────────────────────────────────
test("Pagina /app-driver: statica, senza token, allineata al servizio condiviso", () => {
  assert.ok(page.includes(`href="${DRIVER_APK_FILE_URL}"`));
  assert.ok(page.includes(DRIVER_APP_DOWNLOAD_URL));
  assert.ok(page.includes(`a.name === "${DRIVER_APK_FILE_NAME}"`));
  assert.match(page, /Scarica app Android/);
  assert.match(page, /VolantiniPro Driver è attualmente disponibile per Android\./);
  assert.match(page, /Play Protect/);
  assert.match(page, /<div class="qr"[^>]*><svg /, "QR statico incorporato");
  assert.doesNotMatch(page, /access=|location\.search|localStorage|supabase|testflight|apps\.apple|app store/i);
  assert.match(page, /name="robots" content="noindex, nofollow"/);
  // Solo risorse locali + API pubblica delle release (nessuno script esterno).
  assert.doesNotMatch(page, /<script[^>]+src=/);
});

// ─── 10/11/12. Android invariato ─────────────────────────────────────────────
test("assetlinks.json byte-per-byte invariato, fingerprint v2, package invariato", () => {
  const raw = readFileSync(new URL("../public/.well-known/assetlinks.json", import.meta.url));
  const normalized = Buffer.from(raw.toString("utf8").replace(/\r\n/g, "\n"), "utf8");
  assert.equal(createHash("sha256").update(normalized).digest("hex"), ASSETLINKS_SHA256);
  const target = JSON.parse(normalized.toString("utf8"))[0].target;
  assert.equal(target.package_name, "it.volantinipro.driver");
  assert.deepEqual(target.sha256_cert_fingerprints, [V2_FINGERPRINT]);
  assert.match(read("../capacitor.config.ts"), /appId: 'it\.volantinipro\.driver'/);
});

// ─── Workflow di pubblicazione ───────────────────────────────────────────────
test("Release workflow: solo manuale, verifica e pubblica, mai firma ne' keystore", () => {
  const onBlock = releaseWorkflow.slice(releaseWorkflow.indexOf("\non:"), releaseWorkflow.indexOf("\npermissions:"));
  assert.match(onBlock, /workflow_dispatch:/);
  assert.doesNotMatch(onBlock, /\n  (push|pull_request|schedule|release|workflow_run):/);
  assert.match(onBlock, /dry_run:[\s\S]*default: true/);
  // Solo codice eseguibile: i commenti YAML spiegano proprio cosa NON viene fatto.
  const executable = releaseWorkflow.split("\n").filter((line) => !line.trim().startsWith("#")).join("\n");
  assert.doesNotMatch(executable, /KEYSTORE|keystore|apksigner" sign|apksigner sign|gradlew|npm run build|cap add/);
  assert.match(releaseWorkflow, /\[ "\$conclusion" = "success" \]/);
  assert.match(releaseWorkflow, /\[ "\$path" = "\$BUILD_WORKFLOW" \]/);
  assert.match(releaseWorkflow, /\[ "\$package" = "\$EXPECTED_PACKAGE" \]/);
  assert.match(releaseWorkflow, /EXPECTED_PACKAGE: it\.volantinipro\.driver/);
  assert.match(releaseWorkflow, /grep -qF "\\"\$fp\\"" public\/\.well-known\/assetlinks\.json \|\| \{[^}]*exit 1/);
  assert.match(releaseWorkflow, /esattamente un firmatario/);
  assert.match(releaseWorkflow, new RegExp(`ASSET_NAME: ${DRIVER_APK_FILE_NAME.replace(".", "\\.")}`));
  const publish = releaseWorkflow.slice(releaseWorkflow.indexOf("- name: Publish GitHub Release"));
  assert.match(publish, /if: \$\{\{ !inputs\.dry_run \}\}/);
  assert.match(publish, /gh release view "\$TAG"[\s\S]*exit 1/, "non sovrascrive una release esistente");
});
