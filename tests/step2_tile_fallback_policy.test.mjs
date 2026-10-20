import test from 'node:test';
import assert from 'node:assert/strict';
import { attachTileFallbackPolicy } from '../src/lib/map/tileFallbackPolicy.js';

function setup() {
  const handlers = new Map();
  const layer = { on(name, fn) { handlers.set(name, fn); } };
  let swaps = 0;
  attachTileFallbackPolicy(layer, () => swaps++);
  return { emit: name => handlers.get(name)?.(), swaps: () => swaps };
}

test('one image failure during a successful load keeps the primary map', () => {
  const s = setup();
  for (const event of ['loading', 'tileerror', 'tileload', 'tileerror', 'load']) s.emit(event);
  assert.equal(s.swaps(), 0);
});
test('waits for the complete batch before replacing an unavailable provider', () => {
  const s = setup();
  for (const event of ['loading', 'tileerror', 'tileerror']) s.emit(event);
  assert.equal(s.swaps(), 0);
  s.emit('load');
  assert.equal(s.swaps(), 1);
  for (const event of ['loading', 'tileerror', 'tileerror', 'load']) s.emit(event);
  assert.equal(s.swaps(), 1);
});
test('empty cycles and a lone failed image do not switch providers', () => {
  const s = setup();
  for (const event of ['loading', 'load', 'loading', 'tileerror', 'load']) s.emit(event);
  assert.equal(s.swaps(), 0);
});
test('pan or zoom starts a fresh batch; earlier success does not mask total outage', () => {
  const s = setup();
  for (const event of ['loading', 'tileload', 'load', 'loading', 'tileerror', 'tileerror', 'load']) s.emit(event);
  assert.equal(s.swaps(), 1);
});
