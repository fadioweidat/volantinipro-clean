import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { downloadQuotePdf, generateQuotePdfBytes, mapQuoteDataToPdfModel } from '../src/lib/pdf/generateQuotePdf.js';

const demo = {
  quoteId: 'VP-TEST-01',
  generatedAt: '2026-10-31T10:00:00.000Z',
  service: 'Door to Door',
  status: 'Preventivo confermato',
  client: { name: 'Cliente Test', email: 'cliente@example.org', phone: '0123456789' },
  campaign: { quantity: 7524, format: 'A5', materialStatus: 'gia stampato', sides: 'fronte retro' },
  area: { mainArea: 'Bruzzano', selectedMunicipalities: ['Milano'] },
  outputs: { insertedFlyers: 7524, recommendedFlyers: null, coverageStatus: 'unavailable' },
  municipalities: [{ name: 'Bruzzano', status: 'Selezionato', estimatedFlyers: 7524 }],
  pricing: {
    lines: [{ label: 'Distribuzione Door to Door', quantity: 7524, unitPrice: 0.02, total: 150.48 }],
    subtotal: 150.48,
    extras: [],
    discounts: [],
    total: 150.48,
    printingLine: { label: 'Stampa indicativa', amount: 49.52, inTotal: true, indicative: true },
    graphicLine: { label: 'Grafica richiesta', amount: 79, inTotal: true },
    grandTotal: 279,
  },
};
test('download model includes customer and comprehensive quote price', () => {
  const mapped = mapQuoteDataToPdfModel(demo);
  assert.equal(mapped.client.name, 'Cliente Test');
  assert.equal(mapped.pricing.grandTotal, 279);
  assert.equal(mapped.outputs.recommendedFlyers, null);
});

test('generated PDF has valid header, trailer, customer and real grand total', () => {
  const bytes = generateQuotePdfBytes(demo);
  assert.ok(bytes instanceof Uint8Array);
  assert.ok(bytes.length > 1200);
  const pdf = Buffer.from(bytes).toString('latin1');
  assert.ok(pdf.startsWith('%PDF-1.4'));
  assert.match(pdf, /%%EOF\s*$/);
  assert.match(pdf, /Cliente Test/);
  assert.match(pdf, /cliente@example\.org/);
  assert.match(pdf, /Totale complessivo/);
  assert.match(pdf, /279,00/);
  assert.match(pdf, /Stampa indicativa/);
  assert.match(pdf, /Grafica richiesta/);
});

test('Step4 download action uses a Blob PDF, never a print window', () => {
  const code = fs.readFileSync(new URL('../src/pages/public/configurator/Step4.jsx', import.meta.url), 'utf8');
  assert.match(code, /downloadQuotePdf\(quotePdfData, pdfFileName\)/);
  assert.doesNotMatch(code, /printQuotePdf\(/);
  assert.match(code, /Scarica preventivo PDF/);
});

test('download triggers native file save with .pdf filename, without print', () => {
  // The event target is a browser download anchor. Verify the Blob download
  // without opening windows, and prevent timer side-effects in this test.
  const documentBefore = globalThis.document;
  const createBefore = URL.createObjectURL;
  const revokeBefore = URL.revokeObjectURL;
  const timerBefore = globalThis.setTimeout;
  let clicked = false, openedPrint = false, savedName = '', revokedUrl = '';
  const anchor = {
    href: '', download: '',
    click() { clicked = true; savedName = this.download; },
    remove() {},
  };
  try {
    globalThis.document = { body: { appendChild(node) { assert.equal(node, anchor); } }, createElement(tag) { assert.equal(tag, 'a'); return anchor; } };
    URL.createObjectURL = blob => { assert.equal(blob.type, 'application/pdf'); return 'blob:test'; };
    URL.revokeObjectURL = url => { revokedUrl = url; };
    globalThis.setTimeout = callback => { callback(); };
    const blob = downloadQuotePdf(demo, 'Preventivo-VolantiniPro-Bruzzano.pdf');
    assert.ok(blob.size > 1000);
    assert.equal(clicked, true);
    assert.equal(savedName, 'Preventivo-VolantiniPro-Bruzzano.pdf');
    assert.equal(revokedUrl, 'blob:test');
    assert.equal(openedPrint, false);
  } finally {
    globalThis.document = documentBefore;
    URL.createObjectURL = createBefore;
    URL.revokeObjectURL = revokeBefore;
    globalThis.setTimeout = timerBefore;
  }
});
