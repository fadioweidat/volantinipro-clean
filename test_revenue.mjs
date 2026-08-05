import { test, mock } from 'node:test';
import assert from 'node:assert';

// We'll write a simple test for the logic introduced in AdminDashboard.jsx
function parseRevenue(rawTotal) {
  let parsedTotal = null;
  if (rawTotal != null && String(rawTotal).trim() !== '') {
    const maybeNumber = Number(rawTotal);
    if (Number.isFinite(maybeNumber)) {
      parsedTotal = maybeNumber;
    }
  }
  return parsedTotal;
}

test('Revenue logic parses null correctly', () => {
  assert.strictEqual(parseRevenue(null), null);
});

test('Revenue logic parses undefined correctly', () => {
  assert.strictEqual(parseRevenue(undefined), null);
});

test('Revenue logic parses 0 reale correctly', () => {
  assert.strictEqual(parseRevenue(0), 0);
  assert.strictEqual(parseRevenue('0'), 0);
  assert.strictEqual(parseRevenue('0.00'), 0);
});

test('Revenue logic parses valore positivo correctly', () => {
  assert.strictEqual(parseRevenue(100), 100);
  assert.strictEqual(parseRevenue('150.50'), 150.5);
});

test('Revenue logic handles empty strings', () => {
  assert.strictEqual(parseRevenue(''), null);
  assert.strictEqual(parseRevenue('   '), null);
});
