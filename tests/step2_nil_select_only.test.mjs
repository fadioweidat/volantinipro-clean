// TICKET — "SELEZIONA SOLO QUESTO NIL" (Step2 NIL UX only, no core calc changes).
// Blocco reale osservato: la ricerca NIL ("Cerca NIL / quartiere") filtra/evidenzia
// solo le righe mostrate, senza mai cambiare `selected` — per isolare una singola
// NIL (es. BRUZZANO) l'utente doveva deselezionare manualmente le altre 87.
// Fix: bottone "Seleziona solo questo NIL" per riga NIL, visibile solo in
// modalita' NIL manuale, che chiama setSelected([z.id]) — lo stesso pattern
// canonico gia' usato altrove in Step2ComunePanel per il preselect da indirizzo
// (candidate/addressPreviewNilZones). Nessun nuovo stato, nessun nuovo calcolo,
// nessuna modifica a Raggio/Comune/CAP/pricing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const panel = readFileSync(new URL('../src/pages/public/configurator/step2/Step2ComunePanel.jsx', import.meta.url), 'utf8');
const step2 = readFileSync(new URL('../src/pages/public/configurator/Step2.jsx', import.meta.url), 'utf8');
const milanoGuidance = readFileSync(new URL('../src/pages/public/configurator/step2/MilanoGuidance.jsx', import.meta.url), 'utf8');

test('A. la ricerca NIL resta filter-only: nessun setSelected/toggleZone legato a onNilQueryChange/nilQuery in MilanoGuidance', () => {
  assert.match(milanoGuidance, /la selezione non cambia con la ricerca/, 'la copy esplicita non-destruttiva deve restare');
  assert.doesNotMatch(milanoGuidance, /onNilQueryChange[\s\S]{0,80}setSelected/, 'onNilQueryChange non deve mai chiamare setSelected');
});

test('B/D. il bottone "Seleziona solo questo NIL" chiama setSelected([z.id]) — isola esattamente una NIL', () => {
  assert.match(panel, /Seleziona solo questo NIL/, 'label del bottone presente');
  assert.match(panel, /setSelected\(\[z\.id\]\)/, 'click isola la selezione a un solo id, riusando lo stesso pattern canonico');
});

test('il bottone e\' gated a z.isNil && nilManualMode (non appare per Comune/Raggio/CAP)', () => {
  assert.match(panel, /z\.isNil && nilManualMode && !\(selected\.length === 1 && selected\[0\] === z\.id\) && <button/);
});

test('il click del bottone usa stopPropagation per non far scattare anche il toggleZone del checkbox/riga', () => {
  const ariaIdx = panel.indexOf('aria-label={`Seleziona solo il NIL');
  const btnBlock = panel.slice(ariaIdx - 600, ariaIdx);
  assert.match(btnBlock, /e\.stopPropagation\(\)/);
});

test('C. il toggle checkbox multi-select esistente (toggleZone) resta invariato', () => {
  assert.match(panel, /toggleZone\(z\.id\)/, 'checkbox multi-select esistente intatto');
  assert.match(step2, /function toggleZone\(id\)/, 'handler toggleZone in Step2.jsx non toccato');
});

test('accessibilita\': bottone reale con aria-label descrittivo', () => {
  assert.match(panel, /aria-label=\{`Seleziona solo il NIL \$\{z\.name \|\| z\.id\}`\}/);
});

test('I. nessuna modifica a pricing/quantita\': setSelected([z.id]) non ricalcola manualmente valori — il motore Step2 esistente resta l\'unica fonte', () => {
  const ariaIdx = panel.indexOf('aria-label={`Seleziona solo il NIL');
  const btnBlock = panel.slice(ariaIdx - 600, ariaIdx + 400);
  assert.doesNotMatch(btnBlock, /requiredFlyers\s*=|assignedFlyers\s*=|zCap\(/, 'nessun calcolo custom introdotto vicino al bottone');
});

test('F/G/H. Comune completo, Raggio e altri comuni (es. Varedo) non toccati: nessuna nuova gating su isComuneMode/isRadiusMode', () => {
  assert.doesNotMatch(panel, /isRadiusMode[\s\S]{0,40}Seleziona solo questo NIL/);
  assert.doesNotMatch(panel, /Seleziona solo questo NIL[\s\S]{0,40}isRadiusMode/);
});
