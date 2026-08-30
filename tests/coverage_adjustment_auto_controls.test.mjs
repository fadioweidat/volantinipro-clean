// Ticket "AUTOMATICO ADMIN COMPLETO + GOMMA CIRCOLARE" — subset sicuro
// (client-only, nessun cambio schema/motore). Verifica di contratto sorgente
// su CoverageAdjustmentPanel.jsx + verifica di comportamento pura su
// selectRoadsFromOrigin (percentuale <-> lunghezza vie idonee).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

import { selectRoadsFromOrigin } from '../src/lib/geo/originRadialSelection.js';

const SRC = readFileSync(new URL('../src/components/admin/CoverageAdjustmentPanel.jsx', import.meta.url), 'utf8');

// ── §2 controllo percentuale ────────────────────────────────────────────
test('§2 — controllo percentuale automatico presente (preset + slider 1–100 + default da automaticPercent)', () => {
  assert.match(SRC, /AUTO_PCT_PRESETS\s*=\s*\[50,\s*60,\s*70,\s*80,\s*90,\s*100\]/);
  assert.match(SRC, /const \[autoPct, setAutoPct\] = useState/);
  assert.match(SRC, /Number\(automaticPercent\)/, 'default deve derivare da automaticPercent quando disponibile');
  assert.match(SRC, /type="range" min=\{1\} max=\{100\}/);
  assert.match(SRC, /della lunghezza delle vie idonee \(non è la copertura finale\)/);
});

// ── §3 punto di partenza ───────────────────────────────────────────────
test('§3 — selettore origine con 3 modalità + validazione confine + fallback centro comune', () => {
  assert.match(SRC, /const \[autoOriginMode, setAutoOriginMode\] = useState\(storePoint \? 'store' : 'center'\)/);
  assert.match(SRC, />Punto vendita</);
  assert.match(SRC, />Centro comune</);
  assert.match(SRC, />Scegli sulla mappa</);
  assert.match(SRC, /function OriginClickCapture/);
  assert.match(SRC, /geoJsonContainsPoint\(boundaryGeometry, lat, lng\)/, 'il click origine deve validare contro il confine');
  assert.match(SRC, /autoOrigin \|\| autoCenterPoint \|\| getMunicipalityCenterPoint\(boundaryGeometry\)/, 'fallback dichiarato a centro comune');
  assert.match(SRC, /storePoint && Number\.isFinite/, 'punto vendita usato SOLO se coordinata reale');
  assert.match(SRC, /Punto di partenza automatico/, 'marker origine etichettato');
});

// ── §6 gomma circolare ─────────────────────────────────────────────────
test('§6 — cerchio gomma che segue il mouse (Circle raggio reale in metri) + crosshair', () => {
  assert.match(SRC, /function EraseCursorCapture/);
  assert.match(SRC, /mousemove\(event\)\s*\{\s*if \(active\) onMove/);
  assert.match(SRC, /mouseout\(\)\s*\{\s*onLeave\(\)/);
  assert.match(SRC, /<Circle\s+[\s\S]*?radius=\{eraseRadiusM\}[\s\S]*?interactive=\{false\}/);
  assert.match(SRC, /vp-erase-cursor\{cursor:crosshair\}/);
  assert.match(SRC, /className=\{correcting && tool === 'erase' \? 'vp-erase-cursor' : undefined\}/);
});

// ── §7 dimensione gomma ────────────────────────────────────────────────
test('§7 — raggio gomma controllabile, stesso numero usato da eraseNearest, niente 35 hardcoded', () => {
  assert.match(SRC, /DEFAULT_ERASE_RADIUS_M\s*=\s*25/);
  assert.match(SRC, /const \[eraseRadiusM, setEraseRadiusM\] = useState\(DEFAULT_ERASE_RADIUS_M\)/);
  assert.match(SRC, /const ERASE_RADIUS_M = eraseRadiusM;/, 'eraseNearest deve usare il valore UI');
  assert.doesNotMatch(SRC, /const ERASE_RADIUS_M = 35/, 'il 35 hardcoded non deve piu\' esistere');
  assert.match(SRC, /ERASE_RADIUS_PRESETS_M\s*=\s*\[5,\s*10,\s*20,\s*30,\s*50\]/);
});

// ── §9 KPI preview ─────────────────────────────────────────────────────
test('§9 — KPI bozza automatica (richiesta %, vie, lunghezza, rete totale) senza toccare il FINALE', () => {
  assert.match(SRC, /const \[autoKpi, setAutoKpi\] = useState\(null\)/);
  assert.match(SRC, /setAutoKpi\(\{[\s\S]*requestedPct:[\s\S]*ways:[\s\S]*selectedKm:[\s\S]*totalKm:[\s\S]*coveragePct:/);
  assert.match(SRC, /Copertura richiesta/);
  assert.match(SRC, /Rete idonea totale/);
  // nessuna scrittura verso il motore/DB nel ramo di caricamento
  assert.doesNotMatch(SRC.slice(SRC.indexOf('const loadAutomaticBase'), SRC.indexOf('const handleCloseShape')), /calculate_campaign_final_coverage|\.update\(|\.rpc\(/);
});

// ── §10 no duplicati al reload ─────────────────────────────────────────
test('§10 — ricaricare l\'automatico sostituisce la bozza (conferma) e non duplica', () => {
  assert.match(SRC, /const \[lastAutoLines, setLastAutoLines\] = useState\(\[\]\)/);
  assert.match(SRC, /window\.confirm\('Rigenerare la bozza automatica\?/);
  assert.match(SRC, /prev\.filter\(\(l\) => !lastAutoLines\.includes\(l\)\)/, 'le vie auto precedenti vanno rimosse per reference, non duplicate');
  assert.match(SRC, /setLastAutoLines\(lines\)/);
});

// ── §11 UX riordino ───────────────────────────────────────────────────
test('§11 — blocco AUTOMATICO ADMIN ordinato (percentuale -> origine -> carica) prima della toolbar', () => {
  const block = SRC.indexOf("Generazione automatica");
  const toolbar = SRC.indexOf(">Strumenti<");
  assert.ok(block > 0 && toolbar > 0 && block < toolbar, 'il blocco automatico deve precedere la toolbar strumenti');
  // ordine interno: percentuale prima di "Punto di partenza" prima di "Carica"
  const pctPos = SRC.indexOf('Copertura automatica<', block);
  const originPos = SRC.indexOf('Punto di partenza<', block);
  const loadPos = SRC.indexOf('Carica copertura automatica', block);
  assert.ok(pctPos > 0 && originPos > pctPos && loadPos > originPos);
});

// ── §1 button audit: nessun dead button (handler collegato) ────────────
test('§1 — ogni pulsante della toolbar ha un handler collegato', () => {
  for (const h of ['onClick={() => setTool(\'select\')}', 'onClick={() => { setTool(\'draw\'); }}', 'onClick={() => setTool(\'erase\')}',
    'onClick={handleUndo}', 'onClick={handleSave}', 'onClick={handleCloseShape}', 'onClick={loadAutomaticBase}', 'onClick={handleClearAll}']) {
    assert.ok(SRC.includes(h), `handler mancante: ${h}`);
  }
});

// ── contratto invariato ───────────────────────────────────────────────
test('contratto: resolveRoadNetwork(municipalityName, boundaryGeometry) e selectRoadsFromOrigin invariati', () => {
  assert.match(SRC, /resolveRoadNetwork\(municipalityName, boundaryGeometry\)/);
  assert.match(SRC, /selectRoadsFromOrigin\(net, origin, pct, gpsPath\)/);
});

// ── comportamento: percentuale <-> lunghezza vie idonee (AUTO 50/70/100) ─
function syntheticNetwork(n = 100, wayLen = 100) {
  // n vie da 2 punti, disposte a distanza crescente lungo una linea E dall'origine.
  const ways = [];
  for (let i = 0; i < n; i += 1) {
    const lat = 45.0;
    const lng0 = 9.0 + i * 0.01;
    const lng1 = lng0 + 0.001;
    ways.push({ id: i + 1, geometry: [[lat, lng0], [lat, lng1]], lengthM: wayLen });
  }
  return { ways, totalLengthM: n * wayLen };
}

for (const pct of [50, 70, 100]) {
  test(`AUTO ${pct}% — selectedLengthM ≈ ${pct}% di totalEligibleRoadLength`, () => {
    const net = syntheticNetwork(200, 100); // 20 km totali
    const origin = { lat: 45.0, lng: 9.0 };
    const sel = selectRoadsFromOrigin(net, origin, pct, []);
    const ratio = sel.selectedLengthM / net.totalLengthM;
    // tolleranza = una via (100 m su 20 km = 0.5%), l'algoritmo si ferma appena raggiunge/supera il target
    assert.ok(Math.abs(ratio - pct / 100) <= 0.01, `atteso ~${pct}% , ottenuto ${(ratio * 100).toFixed(2)}%`);
    assert.ok(sel.selectedWays.length > 0);
    assert.ok(Math.abs(sel.coverageMetricPercent - ratio * 100) < 1e-6);
  });
}

test('AUTO — vie più vicine all\'origine selezionate per prime (espansione radiale)', () => {
  const net = syntheticNetwork(50, 100);
  const sel = selectRoadsFromOrigin(net, { lat: 45.0, lng: 9.0 }, 20, []);
  // il 20% => ~10 vie, e devono essere le id piu' basse (piu' vicine)
  const ids = sel.selectedWays.map((w) => w.id).sort((a, b) => a - b);
  assert.deepEqual(ids, Array.from({ length: ids.length }, (_, i) => i + 1));
});
