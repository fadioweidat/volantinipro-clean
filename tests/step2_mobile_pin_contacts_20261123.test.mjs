// Fase 2 (2026-11-23), gruppi B3, B4, B5 — Step 2 su telefono.
// B3 (5438fc7 + bd6fad4): "Scegli punto manuale" chiude la tastiera e porta la mappa in vista.
// B4 (2a99910): barra del punto manuale compatta, con "Annulla" sempre raggiungibile.
// B5 (nuovo): box contatti compatto e chiudibile nello Step 2 su telefono, mai tolto.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = p => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const step2 = read("src/pages/public/configurator/Step2.jsx");
const mapPanel = read("src/pages/public/configurator/step2/Step2MapPanel.jsx");
const box = read("src/components/common/PublicContactBox.jsx");
const routes = read("src/app/PublicRoutes.jsx");

test("B3: ancora stabile della mappa e scroll al punto manuale", () => {
  assert.match(mapPanel, /<div id="step2-map-target" style=\{\{[\s\S]{0,120}scrollMarginTop: 20,/);
  const fn = step2.slice(step2.indexOf("function startManualPinSelection()"), step2.indexOf("async function handleManualMapClick(coords)"));
  assert.match(fn, /document\.activeElement\?\.blur\?\.\(\);/);
  assert.match(fn, /document\.getElementById\("step2-map-target"\)\?\.scrollIntoView\(\{ behavior: "smooth", block: "start" \}\)/);
});

test("B4: barra del punto manuale compatta con Annulla", () => {
  const banner = mapPanel.slice(mapPanel.indexOf("{manualPinMode && <div style={{"), mapPanel.indexOf("Annulla"));
  assert.ok(banner.length > 0);
  assert.match(banner, /left: 12,\n\s*right: 12,/);
  assert.match(banner, /maxWidth: "calc\(100% - 24px\)"/);
  assert.match(banner, /Tocca la mappa per scegliere il punto/);
  assert.match(banner, /<button type="button" onClick=\{\(\) => setManualPinMode\(false\)\}/);
  assert.doesNotMatch(banner, /transform: "translateX\(-50%\)"/);
});

test("B5: box contatti compatto solo nello Step 2, sempre montato per i visitatori", () => {
  assert.match(routes, /isConfiguratorStep && !assistantAllowed && <PublicContactBox compactOnMobile=\{page === "step2"\} \/>/);
  assert.match(box, /export default function PublicContactBox\(\{ compactOnMobile = false \}\)/);
  assert.match(box, /const MOBILE_QUERY = "\(max-width: 640px\)";/);
  assert.match(box, /data-testid="public-contact-box-open"/);
  assert.match(box, /data-testid="public-contact-box-collapse"/);
  assert.match(box, /data-testid="public-contact-box-dismiss"/);
  // Su desktop e negli altri step il box resta quello completo.
  assert.match(box, /if \(!mobileCompact\) \{[\s\S]{0,300}Hai domande\? Scrivici/);
  // La chiusura vale solo per la sessione e non rompe senza storage.
  assert.match(box, /try \{ return window\.sessionStorage\.getItem\(DISMISS_KEY\) === "1"; \} catch \{ return false; \}/);
});
