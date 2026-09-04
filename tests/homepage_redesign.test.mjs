// Homepage redesign — struttura, sezioni duplicate rimosse, nuove sezioni
// (GPS Live / Smart Pairing / Dashboard+Report), FAQ ridotte, responsive,
// prefers-reduced-motion. Solo controlli statici sul sorgente (no DOM/rete).
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const HOME = read("src/pages/public/HomePage.jsx");

// ── Ordine sezioni homepage ────────────────────────────────────────────────
test("HomePage: ordine sezioni Hero -> Perché -> Come funziona -> Servizi -> GPS -> Smart Pairing -> Dashboard -> Business -> FAQ -> Contatti -> CTA -> Footer", () => {
  const order = [
    "VolantiniProHeroMap", "TrustBar", "WhyDifferentSection", "HowItWorksSection",
    "ServicesSection", "GpsLiveSection", "SmartPairingSection", "DashboardClienteSection",
    "EnterpriseSection", "FAQSection", "ContattiSection", "FinalCtaSection", "Footer",
  ];
  const positions = order.map((name) => {
    const idx = HOME.indexOf(`_jsx(${name},`);
    assert.ok(idx >= 0, `${name} non trovato nel render della homepage`);
    return idx;
  });
  for (let i = 1; i < positions.length; i += 1) {
    assert.ok(positions[i] > positions[i - 1], `${order[i]} deve venire dopo ${order[i - 1]}`);
  }
});

// ── Sezioni duplicate/ridondanti rimosse dalla homepage ────────────────────
test("HomePage: sezioni duplicate rimosse (Tecnologia, Risultati, Cosa ricevi, Pricing, vecchio TrackingLive/SmartPairing)", () => {
  for (const name of ["TecnologiaSection", "RisultatiSection", "CosaRiceviSection", "PricingSection", "TrackingLiveSection", "FeatureSmartPairing", "FeatureZonaMappa"]) {
    assert.doesNotMatch(HOME, new RegExp(`_jsx\\(${name},`), `${name} non deve più essere renderizzato in homepage`);
  }
  // niente KPI band nascosta / stepper inline duplicato (assorbiti in HowItWorksSection)
  assert.doesNotMatch(HOME, /ref: kpiBandRef/);
});

// ── Nuove sezioni: GPS Live reale ───────────────────────────────────────────
test("GpsLiveSection: mappa/percorso/marker/stato/avanzamento/foto/timeline, non un grafico a linea generico", () => {
  const src = read("src/components/home/GpsLiveSection.jsx");
  assert.match(src, /id="gps-live"/);
  assert.match(src, /polygon/); // area campagna
  assert.match(src, /motion\.path/); // percorso GPS che si disegna
  assert.match(src, /marker operatore|<circle cx="292" cy="66"/i); // marker operatore
  assert.match(src, /In distribuzione|status/i); // stato attività
  assert.match(src, /Aggiornato \d/); // ultimo aggiornamento
  assert.match(src, /Avanzamento/); // avanzamento %
  assert.match(src, /Foto ricevute|📍/); // foto ricevute
  assert.match(src, /timeline/i);
  assert.match(src, /Anteprima dimostrativa/); // dataset demo dichiarato esplicitamente
  assert.doesNotMatch(src, /d="M20 150 L70 120/); // NON il vecchio grafico a linea generico
  // layout desktop 35-40% testo / 60-65% visual
  assert.match(src, /minmax\(0,38%\) minmax\(0,62%\)/);
  assert.match(src, /useReducedMotion/);
});

// ── Nuove sezioni: Smart Pairing / pianificazione ───────────────────────────
test("SmartPairingSection: board di pianificazione reale (calendario, migliore finestra, capacità), non decorativa", () => {
  const src = read("src/components/home/SmartPairingSection.jsx");
  assert.match(src, /id="smart-pairing"/);
  assert.match(src, /Pianifica la distribuzione nel momento giusto/);
  assert.match(src, /Settembre 2026/);
  assert.match(src, /Migliore finestra/);
  assert.match(src, /8–10 settembre/);
  assert.match(src, /Capacità disponibile/);
  assert.match(src, /Copertura consigliata/);
  assert.match(src, /Consigliato/); // badge
  assert.match(src, /Pianificazione dimostrativa/); // dataset demo dichiarato
  assert.match(src, /useReducedMotion/);
});

// ── Nuove sezioni: Dashboard Cliente + Report unificati ─────────────────────
test("DashboardClienteSection: 4 callout + mockup (report PDF, foto geolocalizzate, mappa copertura)", () => {
  const src = read("src/components/home/DashboardClienteSection.jsx");
  for (const label of ["Stato campagna", "Tracking GPS", "Foto e prove", "Report finale"]) {
    assert.match(src, new RegExp(label));
  }
  assert.match(src, /Report_Campagna\.pdf/);
  assert.match(src, /Foto geolocalizzate/);
  assert.match(src, /polygon/); // mappa di copertura (mockup)
  assert.match(src, /Anteprima dimostrativa/);
  assert.match(src, /useReducedMotion/);
});

// ── Come funziona: stepper orizzontale/verticale ────────────────────────────
test("HowItWorksSection: id=come-funziona, 4 step invariati, timeline orizzontale desktop / verticale mobile", () => {
  const src = read("src/components/home/HowItWorksSection.jsx");
  assert.match(src, /id="come-funziona"/);
  for (const t of ["Configura", "Analizza il territorio", "Personalizza", "Preventivo"]) {
    assert.match(src, new RegExp(t));
  }
  assert.equal((src.match(/howitworks-node/g) || []).length >= 2, true);
  assert.match(src, /@media \(max-width: 860px\)/);
  assert.match(src, /flex-direction: column/);
  assert.match(src, /useReducedMotion/);
});

// ── FAQ ridotte a 6 ─────────────────────────────────────────────────────────
test("FAQSection: homepage mostra al massimo 6 FAQ + 'Vedi tutte le FAQ'", () => {
  const src = read("src/components/home/FAQSection.jsx");
  const count = (src.match(/q:\s*"/g) || []).length;
  assert.ok(count <= 6, `attese <=6 FAQ, trovate ${count}`);
  assert.match(src, /Vedi tutte le FAQ/);
  for (const q of ["Come funziona il configuratore?", "Cos'è Smart Pairing?", "Come controllo la distribuzione?", "Come funziona il Tracking GPS?", "Quali prove ricevo?", "Il preventivo è vincolante?"]) {
    assert.match(src, new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

// ── Contatti: WhatsApp + Email, invariati da questo ticket ──────────────────
test("HomePage monta ContattiSection (WhatsApp + Email) prima della CTA finale", () => {
  assert.ok(HOME.indexOf("_jsx(ContattiSection,") < HOME.indexOf("_jsx(FinalCtaSection,"));
});

// ── Responsive: hook useIsMobile / breakpoint coerenti nelle nuove sezioni ──
test("Nuove sezioni: responsive via CSS media query (niente breakpoint diversi senza motivo)", () => {
  for (const file of ["GpsLiveSection.jsx", "SmartPairingSection.jsx", "DashboardClienteSection.jsx"]) {
    const src = read(`src/components/home/${file}`);
    assert.match(src, /@media \(max-width: 900px\)/);
  }
});

// ── prefers-reduced-motion ──────────────────────────────────────────────────
test("prefers-reduced-motion: regola globale presente in app.css + useReducedMotion nelle sezioni animate nuove/modificate", () => {
  const css = read("src/styles/app.css");
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  for (const file of [
    "GpsLiveSection.jsx", "SmartPairingSection.jsx", "DashboardClienteSection.jsx",
    "HowItWorksSection.jsx", "WhyDifferentSection.jsx", "ServicesSection.jsx",
  ]) {
    const src = read(`src/components/home/${file}`);
    assert.match(src, /useReducedMotion/, `${file} deve rispettare prefers-reduced-motion`);
  }
});

// ── Nessun tocco a logica preventivatore / Step / prezzi / auth / routing ──
test("Sezioni nuove/modificate: nessun import di Step, calcoli prezzo, Mapbox, auth, routing", () => {
  for (const file of [
    "GpsLiveSection.jsx", "SmartPairingSection.jsx", "DashboardClienteSection.jsx", "HowItWorksSection.jsx",
  ]) {
    const src = read(`src/components/home/${file}`);
    assert.doesNotMatch(src, /configurator\/Step|quotePricing|territorialCampaignCalculator|mapbox-gl|supabaseClient|AppRouter/i);
  }
});
