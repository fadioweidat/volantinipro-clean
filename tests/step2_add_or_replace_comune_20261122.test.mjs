// Opzione A (decisione Fadi 2026-11-22): con un comune gia' selezionato,
// scegliere un altro comune dalla barra in alto non lo sostituisce piu' in
// silenzio. Compare la scelta "Aggiungi" (proposta) / "Sostituisci" / "Annulla".
// In piu' l'aggiunta non perde il comune principale quando la lista e' vuota
// (Step 2 aperto da Step 1 / URL con il solo `city`).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const panel = read("src/pages/public/configurator/step2/Step2TerritoryControlsPanel.jsx");
const step2 = read("src/pages/public/configurator/Step2.jsx");

test("barra in alto: nessuna sostituzione diretta del comune dai risultati", () => {
  const direct = panel.match(/selectPrimaryMunicipality\(c\);/g) || [];
  // l'unica chiamata diretta rimasta e' nel pulsante "Sostituisci" e nel caso senza comuni
  assert.equal(direct.length, 2, "solo chooseMunicipalityFromSearch e il pulsante Sostituisci");
  assert.equal((panel.match(/chooseMunicipalityFromSearch\(c\)/g) || []).length, 2, "entrambi i punti di selezione passano dalla scelta");
});

test("con un comune gia' presente si chiede Aggiungi / Sostituisci", () => {
  assert.match(panel, /searchMode === "municipality" && current\.length > 0 && !current\.some\(m => isSameMunicipality\(m, c\)\)/);
  assert.match(panel, /data-testid="municipality-choice-add" autoFocus/);
  assert.match(panel, /data-testid="municipality-choice-replace"/);
  assert.match(panel, /data-testid="municipality-choice-cancel"/);
  assert.match(panel, /appendMunicipalityToActiveZone\(c\);\n\s*\}\} style=\{\{ minHeight: 36/);
});

test("il comune principale conta anche se la lista e' vuota", () => {
  assert.match(panel, /: \(city \? \[city\] : \[\]\);\n\s*const chooseMunicipalityFromSearch/);
  assert.match(step2, /const prev = Array\.isArray\(prevRaw\) && prevRaw\.length > 0 \? prevRaw : \(city \? \[city\] : \[\]\);/);
});

test("stesso nome in province diverse non e' lo stesso comune", () => {
  assert.match(panel, /ka\.name === kb\.name && \(!ka\.prov \|\| !kb\.prov \|\| ka\.prov === kb\.prov\)/);
});
