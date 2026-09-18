// TICKET — ADMIN CANNOT FIND POST-FIX BRUZZANO/COMASINA CAMPAIGN.
// BUG riprodotto dal vivo: Admin "Clienti & Preventivi", ricerca esatta per
// ID campagna reale (7d57e1ab-ec39-4c8a-9768-124084ef1d2f, creata dal
// configuratore pubblico) -> "Nessun preventivo trovato".
//
// ROOT CAUSE: getClientsQuotesOverview()/getRealCampaigns() escludono di
// default (includeTest=false) le righe con quality!=='real'. classifyCampaign
// (admin-api.js) classifica quality:'test' quando nome/email/note contengono
// \b(test|demo|placeholder|fake|sample)\b — regola corretta e intenzionale
// per non sporcare la navigazione di default, ma il nome del cliente di
// prova ("QA Test Runtime Gate...") ci e' finito dentro, quindi quelle righe
// non arrivano MAI in `rows`: nessun filtro di ricerca a valle puo'
// ritrovarle, anche digitando l'ID esatto.
//
// FIX (minimo, non tocca la regola business esistente): entrambe le pagine
// (ClientsQuotes.jsx / AdminOrdersRegistry.jsx) ora chiamano
// getClientsQuotesOverview({ includeTest: true }) cosi' le righe test
// arrivano in stato locale; applyClientsQuotesView / filteredRows nascondono
// comunque quality!=='real' quando la ricerca e' vuota (navigazione di
// default IDENTICA a prima), ma una ricerca esplicita non vuota le rende
// raggiungibili. I contatori KPI restano filtrati a sole campagne "real" in
// entrambe le pagine (nessuna regressione sui totali mostrati in Home).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyClientsQuotesView } from '../src/lib/admin/clientsQuotesView.js';

const clientsQuotesPage = readFileSync(new URL('../src/pages/admin/ClientsQuotes.jsx', import.meta.url), 'utf8');
const ordersRegistryPage = readFileSync(new URL('../src/pages/admin/AdminOrdersRegistry.jsx', import.meta.url), 'utf8');

test('applyClientsQuotesView: senza ricerca, nasconde le righe non "real" (comportamento invariato)', () => {
  const rows = [
    { id: 'a', quality: 'real', client: 'Mario Rossi' },
    { id: 'b', quality: 'test', client: 'QA Test Runtime Gate' },
  ];
  const out = applyClientsQuotesView(rows, { search: '', filter: 'tutti', sort: 'default' });
  assert.deepEqual(out.map((r) => r.id), ['a'], 'la riga test deve restare nascosta quando non si cerca nulla');
});

test('applyClientsQuotesView: con ricerca esplicita per ID esatto, la campagna "test" e\' trovabile', () => {
  const rows = [
    { id: 'a', quality: 'real', client: 'Mario Rossi' },
    { id: '7d57e1ab-ec39-4c8a-9768-124084ef1d2f', quality: 'test', client: 'QA Test Runtime Gate FIXED' },
  ];
  const out = applyClientsQuotesView(rows, { search: '7d57e1ab-ec39-4c8a-9768-124084ef1d2f', filter: 'tutti', sort: 'default' });
  assert.deepEqual(out.map((r) => r.id), ['7d57e1ab-ec39-4c8a-9768-124084ef1d2f'], 'la ricerca esplicita per ID deve raggiungere anche le righe quality test');
});

test('applyClientsQuotesView: ricerca per nome cliente raggiunge righe test/demo allo stesso modo', () => {
  const rows = [
    { id: 'a', quality: 'real', client: 'Mario Rossi' },
    { id: 'b', quality: 'test', client: 'QA Test Runtime Gate Comasina' },
  ];
  const out = applyClientsQuotesView(rows, { search: 'comasina', filter: 'tutti', sort: 'default' });
  assert.deepEqual(out.map((r) => r.id), ['b']);
});

test('ClientsQuotes.jsx: load() ora passa includeTest:true a getClientsQuotesOverview', () => {
  assert.match(clientsQuotesPage, /getClientsQuotesOverview\(\{ includeTest: true \}\)/);
});

test('ClientsQuotes.jsx: i KPI restano calcolati solo su campagne "real" (nessuna regressione sui totali Home)', () => {
  assert.match(
    clientsQuotesPage,
    /computeKpiCounts\(state\.rows\.filter\(\(r\) => !r\.quality \|\| r\.quality === 'real'\)\)/
  );
});

test('AdminOrdersRegistry.jsx: load() ora passa includeTest:true a getClientsQuotesOverview', () => {
  assert.match(ordersRegistryPage, /getClientsQuotesOverview\(\{ includeTest: true \}\)/);
});

test('AdminOrdersRegistry.jsx: filteredRows nasconde quality!=="real" solo quando la ricerca e\' vuota', () => {
  assert.match(
    ordersRegistryPage,
    /if \(!q\) rows = rows\.filter\(\(r\) => !r\.quality \|\| r\.quality === 'real'\);/
  );
});

test('AdminOrdersRegistry.jsx: i KPI restano calcolati solo su campagne "real"', () => {
  assert.match(
    ordersRegistryPage,
    /const rows = state\.rows\.filter\(\(r\) => !r\.quality \|\| r\.quality === 'real'\);/
  );
});

test('nessuna modifica alla regola di classificazione (classifyCampaign) o ad altri consumatori (es. AdminDashboard.jsx Home KPI)', () => {
  const adminApi = readFileSync(new URL('../src/lib/services/admin-api.js', import.meta.url), 'utf8');
  assert.match(adminApi, /function classifyCampaign\(campaign, row, serviceSource\) \{/, 'classifyCampaign invariata, stessa firma');
  assert.match(adminApi, /if \(\/\\b\(test\|demo\|placeholder\|fake\|sample\)\\b\/\.test\(haystack\)\)/, 'regola test/demo/placeholder/fake/sample invariata');
  const dashboard = readFileSync(new URL('../src/pages/admin/AdminDashboard.jsx', import.meta.url), 'utf8');
  assert.match(dashboard, /clientsQuotesResult = await getClientsQuotesOverview\(\{\s*prefetched:/, 'AdminDashboard.jsx Home KPI continua a NON passare includeTest:true (nessun cambiamento ai totali Home)');
});
