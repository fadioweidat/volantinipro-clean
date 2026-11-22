// Fix 2026-11-22 (segnalazione Fadi, Monza): dopo "Aumenta a 63.472" lo Step 2
// mostrava ancora "Quantita' inserita: 10.000" e "Con 10.000 volantini...".
// Intestazione e frasi descrittive devono usare la quantita' reale della
// campagna (step2TruthModel.quantity.current); la quantita' iniziale resta
// solo nel pannello di scelta Mantieni / Aumenta.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const panel = fs.readFileSync(new URL("../src/pages/public/configurator/step2/Step2ComunePanel.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("Step 2: quantita' della campagna presa dal modello reale", () => {
  assert.match(panel, /const campaignFlyerQuantity = Number\(step2TruthModel\?\.quantity\?\.current\) > 0 \? Number\(step2TruthModel\.quantity\.current\) : flyerQuantityFromStep1;/);
});

test("Step 2: intestazione 'Quantita inserita' usa la quantita' della campagna", () => {
  assert.match(panel, /Quantità inserita: <b style=\{\{\s*color: col\s*\}\}>\{campaignFlyerQuantity\.toLocaleString\(/);
});

test("Step 2: le frasi 'Con N volantini' descrivono lo scenario corrente", () => {
  assert.match(panel, /`Con \$\{formatIntegerIT\(campaignFlyerQuantity\)\} volantini il sistema copre prima/);
  assert.match(panel, /con \{formatIntegerIT\(campaignFlyerQuantity\)\} volantini coprirai principalmente/);
  assert.match(panel, /Con \{formatIntegerIT\(campaignFlyerQuantity\)\} volantini coprirai principalmente:/);
  assert.doesNotMatch(panel, /`Con \$\{formatIntegerIT\(flyerQuantityFromStep1\)\} volantini il sistema copre prima/);
});

test("Step 2: il pulsante 'Mantieni' resta sulla quantita' disponibile", () => {
  assert.match(panel, /Mantieni \{Number\(availableFlyers \|\| 0\)\.toLocaleString/);
});
