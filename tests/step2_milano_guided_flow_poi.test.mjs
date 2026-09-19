// TICKET — STEP 2 MILANO GUIDED DISTRIBUTION FLOW + RADIUS NIL BREAKDOWN + POI ICONS
// Test suite verificando l'esperienza guidata Milano, il breakdown NIL in modalita' raggio,
// la ricerca autocomplete quartieri, le icone POI per attivita' e lo stato degradato discreto.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const step2map = readFileSync(new URL('../src/components/Step2Map.jsx', import.meta.url), 'utf8');
const guidance = readFileSync(new URL('../src/pages/public/configurator/step2/MilanoGuidance.jsx', import.meta.url), 'utf8');
const contextCard = readFileSync(new URL('../src/pages/public/configurator/step2/MilanoAddressContextCard.jsx', import.meta.url), 'utf8');

// ── 1. Indirizzo di partenza & copy in chiaro per il cliente ──────────────────
test('1. MilanoAddressContextCard: mostra "Zona di partenza", spiegazione NIL in chiaro e label NIL', () => {
  assert.match(contextCard, /Zona di partenza:/);
  assert.match(contextCard, /Milano è divisa in zone chiamate NIL\. Non devi conoscerle: le individuiamo automaticamente dal tuo indirizzo\./);
  assert.match(contextCard, /Quartiere \/ zona di Milano \(NIL\)/);
  assert.match(contextCard, /data-testid="milano-address-context"/);
});

// ── 2. Tre scelte di distribuzione Milano ────────────────────────────────────
test('2. MilanoGuidance: offre le 3 modalita\' Milano + Municipio con badge trasparente', () => {
  assert.match(guidance, /Milano completo/);
  assert.match(guidance, /NIL \/ Quartiere/);
  assert.match(guidance, /Raggio/);
  assert.match(guidance, /Municipio · Disponibile prossimamente/);
});

// ── 3. Radius mode NIL breakdown ─────────────────────────────────────────────
test('3. MilanoGuidance: in modalita\' Raggio mostra la ripartizione per singola zona/NIL', () => {
  assert.match(guidance, /isRadiusMode && Array\.isArray\(zonesAllocation\)/);
  assert.match(guidance, /Ripartizione zone nel raggio/);
  assert.match(guidance, /Fabbisogno:/);
  assert.match(guidance, /Mancano.*per 100%/);
});

// ── 4. Ricerca quartieri / zone con autocomplete e toggle Aggiungi/Rimuovi ────
test('4. MilanoGuidance: ricerca con label "Vuoi aggiungere un altro quartiere?" e autocomplete', () => {
  assert.match(guidance, /Vuoi aggiungere un altro quartiere\?/);
  assert.match(guidance, /placeholder="Cerca quartiere o zona di Milano/);
  assert.match(guidance, /role="combobox"/);
  assert.match(guidance, /role="listbox"/);
  assert.match(guidance, /\+ Aggiungi/);
  assert.match(guidance, /Rimuovi/);
});

// ── 5. Dettagli avanzati collassabili ────────────────────────────────────────
test('5. MilanoGuidance: include accordion "Mostra dettagli avanzati" per non appesantire la UX', () => {
  assert.match(guidance, /Mostra dettagli avanzati/);
  assert.match(guidance, /Nascondi dettagli avanzati/);
  assert.match(guidance, /setShowAdvanced/);
});

// ── 6. Icone POI coerenti con l'attività Step 1 in D2D e H2H/B2B ─────────────
test('6. Step2Map.jsx: informationalPoiIcon riceve e usa la categoria attivita\' (palestre, scuole, retail, ecc.)', () => {
  assert.match(step2map, /function informationalPoiIcon\(L, color, category = ''\)/);
  assert.match(step2map, /const symbol = poiCategorySymbol\(category\);/);
  assert.match(step2map, /informationalPoiIcon\(L, item\.color \|\| categoryColor\(item\.category\), item\.category\)/);
  // poiCategorySymbol include categorie principali
  assert.match(step2map, /palestra.*fitness.*🏋/);
  assert.match(step2map, /scuol.*🎓/);
  assert.match(step2map, /supermerc.*negozio.*retail.*🛒/);
  assert.match(step2map, /ristor.*🍽/);
  assert.match(step2map, /farmac.*⚕/);
});

// ── 7. Stato fallimento POI discreto e non bloccante ─────────────────────────
test('7. Step2Map.jsx: notifica POI non bloccante in posizione discreta con retry', () => {
  assert.match(step2map, /poiFetchFailed && \(/);
  assert.match(step2map, /Attività commerciali temporaneamente non disponibili\. La configurazione può continuare\./);
  assert.match(step2map, /onClick=\{onRetryPoi\}/);
  assert.match(step2map, /position: 'absolute', right: 10, bottom: 12/);
});
