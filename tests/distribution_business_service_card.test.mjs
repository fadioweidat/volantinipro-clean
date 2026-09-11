import test from 'node:test';
import assert from 'node:assert/strict';
import { distributionTypes } from '../src/lib/distributionTypes.js';

test('distributionTypes: defines exactly 3 services with unchanged IDs', () => {
  assert.equal(distributionTypes.length, 3);
  const ids = distributionTypes.map(d => d.id);
  assert.deepEqual(ids, ['d2d', 'h2h', 'b2b']);
});

test('Distribuzione Business: title, description, explanation, and howItWorks communicate targeted B2B distribution', () => {
  const b2b = distributionTypes.find(d => d.id === 'b2b');
  assert.ok(b2b);

  // 1. Title
  assert.equal(b2b.name, 'Distribuzione Business');

  // 2. Card Description
  assert.equal(
    b2b.desc,
    'Distribuzione mirata presso aziende, negozi, uffici e professionisti selezionati in base al tuo target.'
  );

  // 3. Explanation
  assert.equal(
    b2b.explanation,
    'Consegniamo volantini, brochure, cataloghi e materiale promozionale direttamente presso attività e sedi professionali selezionate.'
  );

  // 4. Use Cases
  assert.equal(
    b2b.useCases,
    'Forniture B2B, presentazione servizi, cataloghi professionali, offerte dedicate alle aziende, convenzioni, Ho.Re.Ca. e attività commerciali.'
  );

  // 5. Target
  assert.equal(
    b2b.target,
    'Imprenditori, titolari di attività, professionisti, responsabili acquisti, uffici e commercianti.'
  );

  // 6. How it works
  assert.equal(
    b2b.howItWorks,
    'Selezioniamo le attività più adatte al tuo target e consegniamo direttamente presso le sedi.'
  );

  // 7. Time
  assert.equal(b2b.time, '3–5 giorni lavorativi');
});

test('3-way Service Differentiation: Door to Door, Hand to Hand, Business communicate distinct audiences', () => {
  const d2d = distributionTypes.find(d => d.id === 'd2d');
  const h2h = distributionTypes.find(d => d.id === 'h2h');
  const b2b = distributionTypes.find(d => d.id === 'b2b');

  // Door to Door: Famiglie e residenti
  assert.match(d2d.target, /Famiglie e residenti/i);
  assert.match(d2d.desc, /cassette postali|condomini|residenziali/i);

  // Hand to Hand: Persone e passanti
  assert.match(h2h.target, /Persone|passanti/i);
  assert.match(h2h.desc, /promoter|flusso pedonale/i);

  // Business: Aziende, professionisti, attività
  assert.match(b2b.target, /Imprenditori|professionisti|commercianti/i);
  assert.match(b2b.desc, /aziende|negozi|uffici|professionisti/i);
});

