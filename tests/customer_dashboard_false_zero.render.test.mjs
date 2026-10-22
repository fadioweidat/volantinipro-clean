import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer, transformWithEsbuild } from 'vite';

// Execute the DashboardPage selected by AppRouter, with controlled hook results.
// This verifies rendering contracts; it is not authenticated runtime evidence.
const source = readFileSync('volantinipro-final.jsx', 'utf8');
const start = source.indexOf('export function DashboardPage');
const body = source.slice(start, source.indexOf('export function CampaignDashboardPage', start));
const imports = source.split('\n').filter(line => line.startsWith('import ') && /customerCampaigns|customerDashboardMetrics|customerDisplay/.test(line)).join('\n').replaceAll('"./src/', '"/src/');
const vite = await createServer({ configFile: false, server: { middlewareMode: true, watch: null }, appType: 'custom', logLevel: 'silent', plugins: [{
  name: 'dashboard-render-fixture',
  resolveId(id) { if (id === 'virtual:customer-dashboard') return '\0customer-dashboard.jsx'; },
  async load(id) { if (id !== '\0customer-dashboard.jsx') return;
    const code = `import React, {useState, useEffect} from 'react';
${imports}
const C = {green:'#2ECC8A',yellow:'#FBBF24',orange:'#E8571A',blue:'#60A5FA',purple:'#A78BFA',white:'#fff',navyMid:'#142039'};
const F = {sans:'sans-serif',serif:'serif'};
const useCliente = () => ({cliente:{nome:'Cliente test'}, loading:false});
const useCampagne = () => globalThis.__dashboardFixture;
const isCustomerAiDashboardEnabled = false;
const SkeletonCard = () => <div data-testid="campaign-skeleton" />;
const MissingValueBadge = () => <span>Dato non disponibile</span>;
const CampaignSettlementSummary = () => null;
const getFinalCoverage = async () => null;
${body}`;
    return (await transformWithEsbuild(code, "fixture.jsx", {loader:"jsx", jsx:"transform"})).code;
  },
}] });
after(() => vite.close());
const { DashboardPage } = await vite.ssrLoadModule('virtual:customer-dashboard');
function render(fixture) {
  globalThis.__dashboardFixture = {sessionInvalid:false, ...fixture};
  return renderToStaticMarkup(React.createElement(DashboardPage, {onNav:()=>{}}));
}
function kpi(html, label) {
  // The numeric value precedes its label inside each KPI card.
  const before = html.slice(0, html.indexOf(label));
  return before.slice(before.lastIndexOf('<div style="padding:16px;'));
}
const campaign = {id:'c1',stato:'confermata',stato_pagamento:'pagato',totale_euro:0,volantini_distribuiti:0,quantita:0,comuni:[]};
test('loading renders skeletons and never the empty state', () => {
  const html = render({campagne:[],loading:true,error:null});
  assert.match(html, /campaign-skeleton/);
  assert.doesNotMatch(html, /Nessuna campagna ancora/);
});
test('request failure renders unavailable KPIs and an actionable error, never empty success', () => {
  const html = render({campagne:[],loading:false,error:'Network failure'});
  assert.doesNotMatch(html, /Nessuna campagna ancora/);
  assert.match(html, /Riprova/);
  for (const label of ['Campagne attive','In attesa pagamento','Totale speso','Avanzamento distribuzione']) assert.match(kpi(html,label), /Dato non disponibile/);
});
test('successful empty response is a real zero with the empty state', () => {
  const html = render({campagne:[],loading:false,error:null});
  assert.match(html, /Nessuna campagna ancora/);
  assert.match(kpi(html,'Totale speso'), /€0,00/);
  assert.match(kpi(html,'Avanzamento distribuzione'), /Disponibile durante la distribuzione/);
});
test('explicit zero remains zero', () => {
  const html = render({campagne:[campaign],loading:false,error:null});
  assert.match(kpi(html,'Totale speso'), /€0,00/);
  assert.match(kpi(html,'Avanzamento distribuzione'), /Disponibile durante la distribuzione/);
});
// 2026-10-22 (Fadi): amounts known for some campaigns are summed with a note naming
// how many have none; unavailable only when no campaign has the amount. Flyers keep
// 2026-10-22 option A: the flyers KPI is replaced by "Avanzamento distribuzione" (%).
test('amount: unavailable only when no campaign has it, otherwise known sum + note', () => {
  const none = render({campagne:[{...campaign,totale_euro:null,volantini_distribuiti:null}],loading:false,error:null});
  assert.match(kpi(none,'Totale speso'), /Dato non disponibile/);
  assert.match(none, /1 campagna senza importo/);
  const partial = render({campagne:[{...campaign,totale_euro:1524.44},{...campaign,id:'c2',totale_euro:null,volantini_distribuiti:null}],loading:false,error:null});
  assert.match(kpi(partial,'Totale speso'), /€1\.524,44/);
  assert.match(partial, /1 campagna senza importo/);
});
test('known positive totals are summed exactly', () => {
  const html = render({campagne:[{...campaign,totale_euro:120.5,volantini_distribuiti:300}, {...campaign,id:'c2',totale_euro:10,volantini_distribuiti:200}],loading:false,error:null});
  assert.match(kpi(html,'Totale speso'), /€130,50/);
  assert.doesNotMatch(html, /Volantini distribuiti/, 'no flyer count KPI (field never recorded)');
});
test('unknown status and payment state do not become zero counts', () => {
  const html = render({campagne:[{...campaign,stato:null,stato_pagamento:null}],loading:false,error:null});
  assert.match(kpi(html,'Campagne attive'), /Dato non disponibile/);
  assert.match(kpi(html,'In attesa pagamento'), /Dato non disponibile/);
});
test('non-finite totals are unavailable', () => {
  const html = render({campagne:[{...campaign,totale_euro:NaN,volantini_distribuiti:Infinity}],loading:false,error:null});
  assert.match(kpi(html,'Totale speso'), /Dato non disponibile/);
});
test('distribution started: progress waits for the real coverage (skeleton), never a flyer estimate', () => {
  const html = render({campagne:[{...campaign,stato:'in_distribuzione',quantita:5000}],loading:false,error:null});
  assert.doesNotMatch(kpi(html,'Avanzamento distribuzione'), /Disponibile durante la distribuzione|Dato non disponibile|\d%</);
  assert.match(kpi(html,'Avanzamento distribuzione'), /admin-shimmer/);
});

test('partial observations: known sums with notes naming the missing field', () => {
  const html = render({campagne:[{...campaign,totale_euro:120.5,stato_pagamento:'in_attesa_pagamento'}, {...campaign,id:'c2',totale_euro:null,stato_pagamento:null,volantini_distribuiti:null}],loading:false,error:null});
  assert.match(html, /1 campagna senza stato di pagamento/);
  assert.match(html, /1 campagna senza importo/);
  assert.match(kpi(html,'Totale speso'), /€120,50/);
  assert.match(kpi(html,'In attesa pagamento'), />1</);
});
test('unavailable request never presents partial observations as real data', () => {
  const html = render({campagne:[{...campaign,totale_euro:null}],loading:false,error:'Network failure'});
  assert.doesNotMatch(html, /Somma parziale|stati mancanti|campagne senza dato/);
});
