// TICKET — ADMIN CLIENTI & PREVENTIVI: KPI stati pagamento + filtri rapidi +
// ricerca estesa + ordinamento + template WhatsApp Admin->Cliente + copia
// riepilogo. Logica pura testabile senza React; il wiring nel componente e'
// verificato via regex sorgente.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  computeKpiCounts,
  lifecycleBucket,
  matchesFilter,
  matchesSearch,
  sortRows,
  applyClientsQuotesView,
  serviceLabel,
  shortCampaignId,
  buildAdminClientWhatsAppMessage,
  buildClientsQuotesSummary,
} from '../src/lib/admin/clientsQuotesView.js';

const page = readFileSync(new URL('../src/pages/admin/ClientsQuotes.jsx', import.meta.url), 'utf8');

const ROWS = [
  { id: 'aaaa1111-xxxx', client: 'Fadi Oweidat', comuni: ['Cormano'], zone: 'Cormano', service: 'd2d', qty: 80632, total: 2891.49, paymentStatus: 'da_pagare', assignment: null, gpsStatus: 'non_disponibile', email: 'fadi@example.com', phone: '+393330000001', createdAt: '2026-09-06T09:00:00Z' },
  { id: 'bbbb2222-yyyy', client: 'Mario Rossi', comuni: ['Bresso'], zone: 'Bresso', service: 'h2h', qty: 10000, total: 500, paymentStatus: 'da_pagare', assignment: null, gpsStatus: 'non_disponibile', createdAt: '2026-09-05T09:00:00Z' },
  { id: 'cccc3333', client: 'Ahmed K', comuni: ['Milano'], zone: 'Milano', service: 'b2b', qty: 5000, total: 1200, paymentStatus: 'pagato', assignment: null, gpsStatus: 'pronto', createdAt: '2026-09-04T09:00:00Z' },
  { id: 'dddd4444', client: 'Luca B', comuni: ['Sesto'], zone: 'Sesto', service: 'd2d', qty: 20000, total: 900, paymentStatus: 'pagato', assignment: { id: 'as1' }, gpsStatus: 'live', createdAt: '2026-09-03T09:00:00Z' },
  { id: 'eeee5555', client: 'Sara V', comuni: ['Monza'], zone: 'Monza', service: 'd2d', qty: 15000, total: 700, paymentStatus: 'pagato', assignment: { id: 'as2' }, gpsStatus: 'storico', createdAt: '2026-09-02T09:00:00Z' },
  { id: 'ffff6666', client: 'No Pay', comuni: ['Como'], zone: 'Como', service: 'd2d', qty: 3000, total: null, paymentStatus: 'non_disponibile', assignment: null, gpsStatus: 'non_disponibile', createdAt: '2026-09-01T09:00:00Z' },
];

test('KPI — conteggi dai dati reali, non hardcoded', () => {
  const k = computeKpiCounts(ROWS);
  assert.equal(k.totali, 6);
  assert.equal(k.da_pagare, 3);          // 2 da_pagare + 1 non_disponibile
  assert.equal(k.pagati, 3);             // superinsieme: tutti i paymentStatus 'pagato'
  assert.equal(k.da_assegnare, 1);       // pagato senza assignment (cccc)
  assert.equal(k.in_lavorazione, 1);     // pagato + assignment, gps live (dddd)
  assert.equal(k.completati, 1);         // gps storico (eeee)
  // i 4 bucket non-superinsieme partizionano le righe
  assert.equal(k.da_pagare + k.da_assegnare + k.in_lavorazione + k.completati, k.totali);
});

test('lifecycleBucket — mappa esclusiva', () => {
  assert.equal(lifecycleBucket(ROWS[0]), 'da_pagare');
  assert.equal(lifecycleBucket(ROWS[5]), 'da_pagare'); // non_disponibile
  assert.equal(lifecycleBucket(ROWS[2]), 'da_assegnare');
  assert.equal(lifecycleBucket(ROWS[3]), 'in_lavorazione');
  assert.equal(lifecycleBucket(ROWS[4]), 'completato');
});

test('filtro "Da pagare" — solo quelli realmente non pagati', () => {
  const r = ROWS.filter((x) => matchesFilter(x, 'da_pagare'));
  assert.deepEqual(r.map((x) => x.client).sort(), ['Fadi Oweidat', 'Mario Rossi', 'No Pay'].sort());
  assert.ok(r.every((x) => x.paymentStatus !== 'pagato'));
});

test('filtro "Pagati" — tutti e soli i paymentStatus pagato', () => {
  const r = ROWS.filter((x) => matchesFilter(x, 'pagati'));
  assert.equal(r.length, 3);
  assert.ok(r.every((x) => x.paymentStatus === 'pagato'));
});

test('filtri Da assegnare / In lavorazione / Completati', () => {
  assert.deepEqual(ROWS.filter((x) => matchesFilter(x, 'da_assegnare')).map((x) => x.client), ['Ahmed K']);
  assert.deepEqual(ROWS.filter((x) => matchesFilter(x, 'in_lavorazione')).map((x) => x.client), ['Luca B']);
  assert.deepEqual(ROWS.filter((x) => matchesFilter(x, 'completati')).map((x) => x.client), ['Sara V']);
  assert.equal(ROWS.filter((x) => matchesFilter(x, 'tutti')).length, 6);
});

test('ricerca — cliente / comune / campaign_id / email / telefono', () => {
  assert.ok(matchesSearch(ROWS[0], 'fadi'));
  assert.ok(matchesSearch(ROWS[0], 'cormano'));
  assert.ok(matchesSearch(ROWS[0], 'aaaa1111'));
  assert.ok(matchesSearch(ROWS[0], 'fadi@example.com'));
  assert.ok(matchesSearch(ROWS[0], '3330000001'));
  assert.equal(matchesSearch(ROWS[0], 'monza'), false);
});

test('ricerca + filtro combinati mantengono la ricerca', () => {
  const out = applyClientsQuotesView(ROWS, { search: 'ross', filter: 'da_pagare', sort: 'default' });
  assert.deepEqual(out.map((x) => x.client), ['Mario Rossi']);
});

test('ordinamento — default (da_pagare recenti, poi pagati, poi altri) + importi + date', () => {
  const def = sortRows(ROWS, 'default').map((x) => x.client);
  // primi due sono i da_pagare piu' recenti
  assert.deepEqual(def.slice(0, 2), ['Fadi Oweidat', 'Mario Rossi']);
  const recenti = sortRows(ROWS, 'recenti').map((x) => x.client);
  assert.equal(recenti[0], 'Fadi Oweidat');
  const vecchi = sortRows(ROWS, 'vecchi').map((x) => x.client);
  assert.equal(vecchi[0], 'No Pay');
  const impDesc = sortRows(ROWS, 'importo_desc').map((x) => x.total);
  assert.deepEqual(impDesc.slice(0, 2), [2891.49, 1200]);
  const impAsc = sortRows(ROWS, 'importo_asc').map((x) => x.client);
  assert.equal(impAsc[0], 'No Pay'); // total null in fondo/quando asc -> -Infinity primo
});

test('template WhatsApp Admin -> Cliente: NON il messaggio Cliente -> VolantiniPro', () => {
  const msg = buildAdminClientWhatsAppMessage(ROWS[0]);
  assert.match(msg, /^Buongiorno Fadi Oweidat,/);
  assert.match(msg, /la contattiamo da VolantiniPro in merito alla campagna aaaa1111/);
  assert.match(msg, /Servizio: Door to Door/);
  assert.match(msg, /Zona: Cormano/);
  assert.match(msg, /Quantita: 80\.632 volantini/);
  assert.match(msg, /Totale: € 2.?891,49/);
  assert.match(msg, /Stato: pagamento da completare\./);
  assert.match(msg, /Le inviamo le informazioni necessarie per completare il pagamento\./);
  // NON il vecchio messaggio generico
  assert.doesNotMatch(msg, /Ciao .*la contattiamo per la sua campagna VolantiniPro \(/);
});

test('copia riepilogo — cliente/ID/servizio/zona/quantita/totale/stato pagamento', () => {
  const s = buildClientsQuotesSummary(ROWS[0]);
  assert.match(s, /Cliente: Fadi Oweidat/);
  assert.match(s, /ID campagna: aaaa1111-xxxx/);
  assert.match(s, /Servizio: Door to Door/);
  assert.match(s, /Zona: Cormano/);
  assert.match(s, /Quantita: 80\.632 volantini/);
  assert.match(s, /Totale: € 2.?891,49/);
  assert.match(s, /Stato pagamento: DA PAGARE/);
});

test('helper vari', () => {
  assert.equal(serviceLabel('d2d'), 'Door to Door');
  assert.equal(serviceLabel('h2h'), 'Hand to Hand');
  assert.equal(serviceLabel(null), 'Servizio n/d');
  assert.equal(shortCampaignId('aaaa1111-2222'), 'aaaa1111…');
  assert.equal(shortCampaignId('short'), 'short');
});

test('ClientsQuotes.jsx — wiring: KPI, filtri, ordinamento, copia riepilogo, WhatsApp corretto; conferma pagamento invariata', () => {
  assert.match(page, /import \{[\s\S]{0,400}computeKpiCounts,[\s\S]{0,400}applyClientsQuotesView,[\s\S]{0,400}buildAdminClientWhatsAppMessage,/);
  assert.match(page, /const kpi = useMemo\(\(\) => computeKpiCounts\(state\.rows\), \[state\.rows\]\)/);
  assert.match(page, /applyClientsQuotesView\(state\.rows, \{ search, filter, sort \}\)/);
  assert.match(page, /const \[filter, setFilter\] = useState\('tutti'\)/);
  assert.match(page, /const \[sort, setSort\] = useState\('default'\)/);
  assert.match(page, /<KpiCard label="Da pagare"/);
  assert.match(page, /<KpiCard label="Completati"/);
  assert.match(page, /CQ_FILTERS\.map\(\(f\) =>/);
  assert.match(page, /onClick=\{\(\) => handleCopySummary\(row\)\}/);
  assert.match(page, /Copia riepilogo/);
  // WhatsApp cliente ora usa il template Admin corretto
  assert.match(page, /const msg = buildAdminClientWhatsAppMessage\(row\)/);
  assert.doesNotMatch(page, /Ciao \$\{row\.client \|\| ''\}, la contattiamo per la sua campagna VolantiniPro/);
  // Conferma pagamento: business logic invariata
  assert.match(page, /await confirmCampaignPayment\(paymentConfirmRow\.id\)/);
  assert.doesNotMatch(page, /confirmCampaignPayment\([^)]*[,)]\s*\{/); // nessun nuovo argomento/opzione
});
