// Homepage "Calcola il preventivo online" CTAs lead to "Richiedi un Preventivo"
// (/preventivo), like the navbar "Calcola preventivo". A comune chosen in the
// calculator travels as ?comune= and is forwarded to Preventivo Guidato
// (configurator prefill) and Preventivo Rapido (pre-filled comune).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  sanitizeComuneParam,
  readComuneParam,
  buildQuoteSelectionHref,
  readServiceParam,
  buildConfiguratorHref,
  buildQuickQuoteHref,
} from "../src/lib/quote/quoteComuneParam.js";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("comune param: real Italian names pass, anything else is dropped", () => {
  for (const name of ["Seveso", "Cormano", "Sesto San Giovanni", "Sant'Angelo Lodigiano", "Cassano d’Adda", "Cantù", "Reggio nell'Emilia"]) {
    assert.equal(sanitizeComuneParam(name), name, name);
  }
  assert.equal(sanitizeComuneParam("  Seveso  "), "Seveso");
  for (const bad of ["", "   ", null, undefined, "<script>alert(1)</script>", "Seveso?x=1", "a&b", "javascript:alert(1)", "123", "x".repeat(81)]) {
    assert.equal(sanitizeComuneParam(bad), null, String(bad));
  }
  assert.equal(readComuneParam("?comune=Seveso"), "Seveso");
  assert.equal(readComuneParam("?comune=Sesto%20San%20Giovanni&x=1"), "Sesto San Giovanni");
  assert.equal(readComuneParam("?comune=%3Cb%3E"), null);
  assert.equal(readComuneParam(""), null);
});

test("links: /preventivo carries the comune; Guidato keeps today's configurator prefill; Rapido gets it too", () => {
  assert.equal(buildQuoteSelectionHref("Seveso"), "/preventivo?comune=Seveso");
  assert.equal(buildQuoteSelectionHref("Sesto San Giovanni"), "/preventivo?comune=Sesto+San+Giovanni");
  assert.equal(buildQuoteSelectionHref(null), "/preventivo");
  assert.equal(buildQuoteSelectionHref("<x>"), "/preventivo");
  assert.equal(buildConfiguratorHref("Seveso"), "/configuratore?service=d2d&comune=Seveso&source=homepage_calculator");
  assert.equal(buildQuickQuoteHref("Seveso"), "/preventivo-rapido?comune=Seveso");
  assert.equal(buildQuickQuoteHref(""), "/preventivo-rapido");
});

test("calculator CTA goes to Richiedi un Preventivo (with comune) and says the comune stays selected", () => {
  const calc = read("src/components/home/HomeQuoteCalculator.jsx");
  assert.match(calc, /if \(comune\) window\.location\.assign\(buildQuoteSelectionHref\(comune\.name\)\);\s*\n\s*else onConfigure\?\.\(\);/);
  assert.match(calc, /onClick=\{goToQuoteSelection\}>Calcola il preventivo online/);
  assert.match(calc, /`Scegli il percorso: \$\{comune\.name\} resterà selezionato\.`/);
  assert.doesNotMatch(calc, /Apri il configuratore con/);
  assert.doesNotMatch(calc, /window\.location\.assign\(buildConfiguratorHref/);
});

test("every homepage 'Calcola il preventivo online' button and the navbar CTA lead to the same 'preventivo' page", () => {
  const home = read("src/pages/public/HomePage.jsx");
  for (const section of ["VolantiniProHeroMap", "QuantityValueSection", "HowItWorksSection", "GpsLiveSection"]) {
    const block = home.slice(home.indexOf(`_jsx(${section},`), home.indexOf("})", home.indexOf(`_jsx(${section},`)));
    assert.match(block, /onConfigure: \(\) => n\("preventivo"\)/, section);
  }
  const hero = read("src/components/home/VolantiniProHeroMap.jsx");
  assert.match(hero, /className="vph-button" onClick=\{configure\}>Calcola il preventivo online/);
  assert.match(hero, /onClick=\{configure\} style=\{primaryButtonStyle\}>\s*Calcola preventivo/);
  for (const file of ["HowItWorksSection.jsx", "GpsLiveSection.jsx"]) {
    assert.match(read(`src/components/home/${file}`), /onClick=\{\(\) => onConfigure\?\.\(\)\}>Calcola il preventivo online/, file);
  }
  const routes = read("src/app/routeResolution.js");
  assert.match(routes, /if \(p === '\/preventivo'\) return 'preventivo';/);
  // /preventivo must win over the configurator prefill route even when ?comune= is present.
  assert.ok(routes.indexOf("'/preventivo'") < routes.indexOf("prefillHas) return"));
});

test("Richiedi un Preventivo forwards the comune to Guidato and Rapido; other buttons untouched", () => {
  const sc = read("src/pages/public/ServiceCenter.jsx");
  assert.match(sc, /const startGuided = \(\) => \(comune \|\| service \? window\.location\.assign\(buildConfiguratorHref\(comune, service \|\| "d2d"\)\) : onNav\("step1", null, \{ newCampaign: true, protectDraft: true \}\)\);/);
  assert.match(sc, /const startQuick = \(\) => \(comune \|\| service \? window\.location\.assign\(buildQuickQuoteHref\(comune, service\)\) : onNav\("quick"\)\);/);
  assert.match(sc, /readComuneParam\(window\.location\.search\)/);
  assert.match(sc, /<QuoteSelectionHeader onNav=\{onNav\} comune=\{comune\} service=\{service\} \/>/);
  // "Configura {servizio} →" (service tab button) keeps its original behaviour.
  assert.match(sc, /onClick=\{\(\) => onNav\("step1", \{ service: svc\.id === "biz" \? "b2b" : svc\.id \}, \{ newCampaign: true, protectDraft: true \}\)\}[\s\S]{0,400}Configura \{svc\.name\} →/);
  // Consulenza unchanged.
  assert.match(sc, /onClick=\{\(\) => onNav\("consultant"\)\}/);
});

test("Preventivo Rapido pre-fills the comune from ?comune= through the shared search (exact match only)", () => {
  const qq = read("src/pages/public/QuickQuotePage.jsx");
  assert.match(qq, /readComuneParam\(window\.location\.search\)/);
  assert.match(qq, /const list = await searchItalianMunicipalities\(initial\);/);
  assert.match(qq, /canonicalizeItalianMunicipalityName\(s\.name, s\)\.toLowerCase\(\) === initial\.toLowerCase\(\)/);
  assert.match(qq, /if \(match\) addComune\(match\);\s*\n\s*else \{ setComuneInput\(initial\); setDropOpen\(true\); \}/);
});

test("the chosen service travels through /preventivo, with the comune when present", () => {
  assert.equal(buildQuoteSelectionHref(null, "h2h"), "/preventivo?service=h2h");
  assert.equal(buildQuoteSelectionHref("Seveso", "d2d"), "/preventivo?service=d2d&comune=Seveso");
  assert.equal(buildConfiguratorHref("Seveso", "h2h"), "/configuratore?service=h2h&comune=Seveso&source=homepage_calculator");
  assert.equal(buildConfiguratorHref(null, "h2h"), "/configuratore?service=h2h");
  assert.equal(buildQuickQuoteHref("Seveso", "h2h"), "/preventivo-rapido?service=h2h&comune=Seveso");
  assert.equal(readServiceParam("?service=h2h"), "h2h");
  assert.equal(readServiceParam("?service=altro"), null);
});

test("services cards and Business CTA are not rerouted", () => {
  const services = read("src/components/home/ServicesSection.jsx");
  assert.match(services, /cta: "Calcola Door to Door"/);
  assert.match(services, /cta: BUSINESS_REQUEST_LABEL/);
  assert.doesNotMatch(services, /quoteComuneParam|buildQuoteSelectionHref/);
});

test("/preventivo uses the single response time and the orange primary button", () => {
  const sc = read("src/pages/public/ServiceCenter.jsx");
  assert.ok(sc.includes("BUSINESS_RESPONSE_TIME[0].toUpperCase()"));
  assert.ok(!sc.includes("Risposta in 24h"));
  const start = sc.slice(sc.indexOf("onClick={startGuided}"), sc.indexOf("Inizia il percorso"));
  assert.ok(start.includes('background: "#CE4B15"'));
  assert.ok(!start.includes("C.indigo"));
});

test("/preventivo has no decorative charts, GPS and photos are shown as paid extras", () => {
  const sc = read("src/pages/public/ServiceCenter.jsx");
  for (const gone of ["MiniChart", "chart:", "ontatti stimati", "Heatmap pedonale", "pedonal", "certificat", "non modificabile", "30 o più"]) assert.ok(!sc.includes(gone), gone);
  assert.equal((sc.match(/extra: GPS_EXTRA,/g) || []).length, 5);
  assert.equal((sc.match(/extra: PHOTO_EXTRA,/g) || []).length, 3);
});

test("the site never claims a certification and copy prices match the extras registry", async () => {
  const { buildExtraServicesRegistry } = await import("../src/lib/extraServicesRegistry.js");
  const { PHOTO_PROOF_PRICE, PHOTO_REPORT_PRICE, TRACKING_GPS_PRICE } = await import("../src/lib/extraServicePrices.js");
  const price = (id) => buildExtraServicesRegistry({}).find((extra) => extra.id === id).price;
  assert.equal(price("tracking_gps"), TRACKING_GPS_PRICE);
  assert.equal(price("photo_proof"), PHOTO_PROOF_PRICE);
  assert.equal(price("photo_report_advanced"), PHOTO_REPORT_PRICE);
  for (const file of ["src/components/home/TrustBar.jsx", "src/components/home/FeatureSmartPairing.jsx", "src/pages/public/HomePage.jsx", "src/lib/constants.js", "src/lib/extraServicesRegistry.js"]) {
    assert.ok(!/certificat|inconfutabil/i.test(read(file)), file);
  }
});
