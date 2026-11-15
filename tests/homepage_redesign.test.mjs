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
// Ordine del design attuale (aggiornato 2026-11-15, nessuna modifica al codice homepage).
test("HomePage: ordine sezioni Hero -> Quantità -> Come funziona -> GPS -> Perché -> Fattibilità -> Servizi -> Smart Pairing -> Dashboard -> Business -> FAQ -> Contatti -> CTA -> Footer", () => {
  const order = [
    "VolantiniProHeroMap", "QuantityValueSection", "HowItWorksSection", "GpsLiveSection",
    "WhyDifferentSection", "FeasibilitySection", "ServicesSection", "SmartPairingSection", "DashboardClienteSection",
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
// Design attuale: storia con foto operatore, telefono con mappa dimostrativa
// (zona, percorso, punti GPS, foto di prova) e tre servizi, GPS e foto come extra.
test("GpsLiveSection: mappa dimostrativa con zona/percorso/punti GPS/foto, GPS e foto come servizi aggiuntivi, non un grafico a linea generico", () => {
  const src = read("src/components/home/GpsLiveSection.jsx");
  assert.match(src, /id="gps-live"/);
  assert.match(src, /aria-label="Mappa dimostrativa con zona, percorso e punti GPS"/);
  assert.match(src, /polygon/); // area campagna
  assert.match(src, /motion\.path/); // percorso GPS che si disegna
  assert.match(src, /<circle key=\{`\$\{cx\}-\$\{cy\}`\}/); // punti GPS sul percorso
  assert.match(src, /Foto della distribuzione/); // foto di prova sul telefono
  for (const t of ["Foto geolocalizzate", "Percorso GPS", "Report per Comune"]) assert.match(src, new RegExp(t));
  assert.equal((src.match(/Servizio aggiuntivo:/g) || []).length, 2); // GPS e foto: extra a pagamento
  assert.match(src, /Anteprima dimostrativa/); // dataset demo dichiarato esplicitamente
  assert.doesNotMatch(src, /d="M20 150 L70 120/); // NON il vecchio grafico a linea generico
  // layout desktop: storia | telefono 258px | servizi
  const css = read("src/components/home/homepage-visual-review.css");
  assert.match(css, /\.vpg-inner \{[^}]*grid-template-columns:minmax\(0,1\.43fr\) 258px minmax\(0,\.87fr\)/);
  assert.match(src, /useReducedMotion/);
});

// ── Nuove sezioni: Smart Pairing / pianificazione ───────────────────────────
test("SmartPairingSection: board di pianificazione reale (calendario, migliore finestra, capacità), non decorativa", () => {
  const src = read("src/components/home/SmartPairingSection.jsx");
  assert.match(src, /id="smart-pairing"/);
  assert.match(src, /Pianifica la distribuzione nel momento giusto/);
  // Mese dinamico (mese successivo a oggi) e finestra calcolata, non piu' fissi.
  assert.match(src, /buildSmartPairingExampleMonth\(\)/);
  assert.match(src, /Migliore finestra/);
  assert.match(src, /\{example\.windowLabel\}/);
  assert.match(src, /Copertura consigliata/);
  assert.match(src, /Consigliato/); // badge
  assert.match(src, />Esempio</); // dataset demo dichiarato in modo visibile
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
// Design attuale: 5 step dal territorio al report.
test("HowItWorksSection: id=come-funziona, 5 step, timeline orizzontale desktop / verticale mobile", () => {
  const src = read("src/components/home/HowItWorksSection.jsx");
  assert.match(src, /id="come-funziona"/);
  const titles = [...src.matchAll(/title: '([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(titles, ["Scegli il territorio", "Ottieni il preventivo", "Conferma l’ordine", "Distribuzione sul campo", "Verifica GPS e report"]);
  const styles = read("src/components/home/process-feasibility.css");
  const review = read("src/components/home/homepage-visual-review.css");
  assert.match(src, /className="vpp-steps"/);
  assert.match(src, /className="vpp-section vpp-process vpq-process"/);
  assert.match(review, /\.vpq-process \.vpp-steps \{ grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/); // orizzontale
  assert.match(review, /\.vpq-process \.vpp-steps \{ grid-template-columns:minmax\(0,1fr\)/); // verticale mobile
  assert.match(styles, /@media\(max-width:520px\)/);
  assert.match(styles, /prefers-reduced-motion:reduce/);

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
  for (const file of ["SmartPairingSection.jsx", "DashboardClienteSection.jsx"]) {
    const src = read(`src/components/home/${file}`);
    assert.match(src, /@media \(max-width: 900px\)/);
  }
  // GpsLiveSection: stili in homepage-visual-review.css, stesso breakpoint 900px.
  const css = read("src/components/home/homepage-visual-review.css");
  assert.match(css, /@media \(max-width: 900px\) \{[^@]*\.vpg-inner \{/);
});

// ── prefers-reduced-motion ──────────────────────────────────────────────────
test("prefers-reduced-motion: regola globale presente in app.css + useReducedMotion nelle sezioni animate nuove/modificate", () => {
  const css = read("src/styles/app.css");
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  for (const file of [
    "GpsLiveSection.jsx", "SmartPairingSection.jsx", "DashboardClienteSection.jsx",
    "WhyDifferentSection.jsx", "ServicesSection.jsx",
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
