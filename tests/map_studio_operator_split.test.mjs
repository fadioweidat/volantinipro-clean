// Studio Mappa — assegnazione linee auto → operatore.
// ISOLAMENTO: questo modulo NON deve importare src/lib/geo/operatorSplit.js.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

import {
  assignAllToOperator,
  splitWaysByOperatorSector,
} from '../src/pages/admin/map-studio/mapStudioOperatorSplit.js';

const SRC = readFileSync(new URL('../src/pages/admin/map-studio/mapStudioOperatorSplit.js', import.meta.url), 'utf8');

function radialWays(n = 24) {
  // n vie che partono dall'origine [45,9] in direzioni diverse
  return Array.from({ length: n }, (_, i) => {
    const ang = (i / n) * 2 * Math.PI;
    return {
      id: `w${i}`,
      geometry: [[45, 9], [45 + 0.01 * Math.sin(ang), 9 + 0.01 * Math.cos(ang)]],
    };
  });
}

test('ISOLAMENTO — non importa il modulo del motore operativo', () => {
  // solo statement di import/require reali, non i commenti che lo citano
  const importLines = SRC.split('\n').filter((l) => /^\s*(import|const|let|var)\b/.test(l) && /require\(|from\s+['"]/.test(l));
  for (const l of importLines) assert.doesNotMatch(l, /operatorSplit/);
  assert.doesNotMatch(SRC, /^\s*import[\s\S]*?operatorSplit\.js/m);
});

test('FASE 1 — assignAllToOperator: TUTTE le vie all\'operatore scelto', () => {
  const ways = radialWays(10);
  const out = assignAllToOperator(ways, 'op-A');
  assert.equal(out.length, 10);
  assert.ok(out.every((x) => x.operatorId === 'op-A'));
  assert.ok(out.every((x) => x.lengthM > 0));
  assert.equal(out[3].wayId, 'w3');
});

test('splitWaysByOperatorSector: N operatori, partizione deterministica e ~bilanciata', () => {
  const ways = radialWays(24);
  const ids = ['a', 'b', 'c', 'd'];
  const origin = [45, 9];
  const r1 = splitWaysByOperatorSector(ways, ids, origin);
  const r2 = splitWaysByOperatorSector(ways, ids, origin);
  assert.deepEqual(r1.map((x) => x.operatorId), r2.map((x) => x.operatorId), 'deterministico');

  const perOp = {};
  for (const a of r1) perOp[a.operatorId] = (perOp[a.operatorId] || 0) + a.lengthM;
  const totals = ids.map((id) => perOp[id] || 0);
  assert.ok(totals.every((t) => t > 0), 'ogni operatore riceve qualcosa');
  const max = Math.max(...totals);
  const min = Math.min(...totals);
  assert.ok((max - min) / max < 0.4, `bilanciamento ragionevole: ${totals.map((t) => t.toFixed(0))}`);
});

test('splitWaysByOperatorSector: 1 solo id o nessuna origine → tutto a uno', () => {
  const ways = radialWays(6);
  assert.ok(splitWaysByOperatorSector(ways, ['solo'], [45, 9]).every((x) => x.operatorId === 'solo'));
  assert.ok(splitWaysByOperatorSector(ways, ['a', 'b'], null).every((x) => x.operatorId === 'a'));
});
