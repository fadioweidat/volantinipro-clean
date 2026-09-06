// PERFORMANCE — "Step 2 repeated analysis / map_sectors requests while idle".
//
// Audit runtime (prod bc80b17): dopo il settle, Step 2 IDLE su Cormano /
// Milano (MI) comune completo / Raggio / NIL BRUZZANO NON emette alcuna
// richiesta analysis-istat, alcuna RPC get_map_sectors, alcun log diagnostico
// (misurato 23-50s per scenario). Il loop di refetch/recompute era gia' stato
// eliminato dai fix precedenti (22c5779 fetchKey debounce, 8296b15 P1-A zone
// selection, round6 coord quantization).
//
// Restava SOLO rumore di log: 5 diagnostiche TEMPORANEE (tickets 17-22) +
// [MAP_SECTORS_RPC_REQUEST]/[MAP_SECTORS_RPC_SUCCESS] stampavano in console ad
// ogni cambio modalita'/settle anche in PRODUZIONE (console.warn/console.info
// non gated). Questo test blocca la regressione: tutte devono essere gated
// dietro il debug flag Step 2 (in prod -> nessun output). Nessuna modifica al
// data flow / fetchKey / debounce / P1-A.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const step2 = readFileSync(new URL("../src/pages/public/configurator/Step2.jsx", import.meta.url), "utf8");
const hook = readFileSync(new URL("../src/hooks/useServiceAnalysis.js", import.meta.url), "utf8");
const sectorsApi = readFileSync(new URL("../src/lib/services/sectors-api.js", import.meta.url), "utf8");

const stripComments = (s) => s.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

test("[STEP2_ANALYSIS_KEY] (useServiceAnalysis) gated dietro il debug flag", () => {
  assert.match(hook, /const step2DebugEnabled = \(\) =>/);
  // l'effect diagnostico esce subito se il debug non e' attivo
  assert.match(hook, /useEffect\(\(\) => \{\s*(?:\/\/[^\n]*\n\s*)*if \(!step2DebugEnabled\(\)\) return;/);
  // nessun console.warn("[STEP2_ANALYSIS_KEY]") NON preceduto dal guard
  const code = stripComments(hook);
  assert.match(code, /if \(!step2DebugEnabled\(\)\) return;[\s\S]*console\.warn\("\[STEP2_ANALYSIS_KEY\]"/);
});

test("[STEP2_ANALYSIS_GATE] / _TERRITORIAL_STATE / _RESPONSE / _MAPPING (Step2.jsx) gated", () => {
  const code = stripComments(step2);
  // GATE: solo dentro isStep2DebugEnabled()
  assert.match(code, /if \(isStep2DebugEnabled\(\)\) console\.warn\("\[STEP2_ANALYSIS_GATE\]"/);
  // TERRITORIAL_STATE: il ramo che logga richiede isStep2DebugEnabled()
  assert.match(code, /if \(!hasUsefulApiZones && isStep2DebugEnabled\(\)\) \{[\s\S]{0,120}console\.warn\("\[STEP2_TERRITORIAL_STATE\]"/);
  // RESPONSE + MAPPING: l'effect esce subito se il debug non e' attivo
  assert.match(code, /useEffect\(\(\) => \{\s*if \(!isStep2DebugEnabled\(\)\) return;\s*if \(!apiData && !apiError\) return;/);
  assert.match(code, /useEffect\(\(\) => \{\s*if \(!isStep2DebugEnabled\(\)\) return;\s*if \(!city \|\| !apiRequestSettled\) return;/);
});

test("ogni diagnostica STEP2 in Step2.jsx e' dentro un blocco isStep2DebugEnabled()", () => {
  const code = stripComments(step2);
  // GATE + TERRITORIAL_STATE: guard INLINE, vicino al log
  for (const tag of ["STEP2_ANALYSIS_GATE", "STEP2_TERRITORIAL_STATE"]) {
    const re = new RegExp(`console\\.(warn|info|log)\\("\\[${tag}\\]"`, "g");
    let m;
    while ((m = re.exec(code))) {
      const before = code.slice(Math.max(0, m.index - 260), m.index);
      assert.match(before, /isStep2DebugEnabled\(\)/, `${tag}: log non gated`);
    }
  }
  // RESPONSE + MAPPING: l'INTERO effect esce subito se il debug non e' attivo
  // (prima statement) -> il log e' irraggiungibile in prod. (forma esatta gia'
  // verificata nel test 2)
});

test("[MAP_SECTORS_RPC_REQUEST]/[MAP_SECTORS_RPC_SUCCESS] (sectors-api) gated; errori restano visibili", () => {
  assert.match(sectorsApi, /const mapSectorsInfo = \(\.\.\.args\) => \{\s*if \(debugStep2Enabled\(\)\) console\.info\(\.\.\.args\);\s*\};/);
  // gli errori/fallback restano un console.warn diretto (segnalano problemi reali)
  assert.match(sectorsApi, /const mapSectorsWarn = \(\.\.\.args\) => console\.warn\(\.\.\.args\);/);
  // mapSectorsInfo e' usato SOLO per REQUEST/SUCCESS di routine
  assert.match(sectorsApi, /mapSectorsInfo\('\[MAP_SECTORS_RPC_REQUEST\]'/);
  assert.match(sectorsApi, /mapSectorsInfo\('\[MAP_SECTORS_RPC_SUCCESS\]'/);
});

test("data flow INVARIATO: fetchKey / debounce / P1-A non toccati", () => {
  // fetchKey debounce (22c5779): l'effect di fetch dipende SOLO da fetchKey + nonce
  assert.match(hook, /\n\s*\}, \[fetchKey, bfcacheResumeNonce\]\);/);
  assert.match(hook, /const pending = Boolean\(\s*zoneValid &&\s*lastSettledKeyRef\.current !== fetchKey/);
  // P1-A zone selection preservation (8296b15)
  assert.match(step2, /setSelected\(prev => resolveZoneAutoSelection\(\{/);
  // coord quantization
  assert.match(step2, /const queryCenterLat = round6\(/);
});
