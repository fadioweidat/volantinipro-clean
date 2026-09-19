// Driver "Programma Operativo": lista compatta mobile. SOLO presentazione.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeZoneWorkflow } from '../src/lib/driver/zoneWorkflow.js';
import { buildZoneListView, programSummaryText, FUTURE_ZONES_DEFAULT_LIMIT, normalizeZoneSearch } from '../src/lib/driver/zoneListView.js';

const rd = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const comp = rd('../src/components/driver/DriverZoneProgram.jsx');
const page = rd('../src/pages/driver/DriverAssignmentPage.jsx');
const view = rd('../src/lib/driver/zoneListView.js');

const NAMES = ['BRUZZANO', 'COMASINA', 'PARCO NORD', 'AFFORI', 'BOVISASCA', 'NIGUARDA', 'BOVISA', 'DERGANO', 'QUARTO OGGIARO', 'VILLAPIZZONE', 'ROSERIO', 'MACIACHINI', 'Cormano', 'Bresso', 'Novate Milanese', 'Cusano Milanino', 'Paderno Dugnano', 'Cinisello Balsamo', 'Bollate', 'Sesto San Giovanni'];
const mk = (status = {}) => NAMES.map((n, i) => ({ id: `z${i + 1}`, zone_name: n, quantity: 1000 + i, status: status[i] || 'Da iniziare' }));
const build = (zones, opts) => buildZoneListView(zones, computeZoneWorkflow(zones).stateOf, opts);
const names = (rows) => rows.map((r) => r.zone.zone_name);

test('header: conteggi REALI (non hardcoded)', () => {
  const zs = mk({ 1: 'In corso', 3: 'In corso', 0: 'Completata' });
  const v = build(zs);
  assert.deepEqual(v.counts, { total: 20, inProgress: 2, toStart: 17, completed: 1 });
  assert.equal(programSummaryText(v.counts), '20 zone · 2 in corso · 17 da iniziare · 1 completata');
  assert.equal(programSummaryText({ total: 1, inProgress: 0, toStart: 0, completed: 1 }), '1 zona · 0 in corso · 0 da iniziare · 1 completata');
  assert.doesNotMatch(comp + view, /\b20 zone\b|17 da iniziare/);
});

test('A/K. le zone IN_CORSO sono sempre in testa e ne possono coesistere piu\' d\'una', () => {
  const v = build(mk({ 1: 'In corso', 3: 'In corso' }));
  assert.deepEqual(names(v.inProgress), ['COMASINA', 'AFFORI']);
  const i = comp.indexOf('section-in-progress');
  assert.ok(i > 0 && i < comp.indexOf('section-to-start') && comp.indexOf('section-to-start') < comp.indexOf('section-completed'));
});

test('B. DA_INIZIARE = riga compatta (non card grande), Mappa solo come icona', () => {
  assert.match(comp, /data-zone-row="compact"/);
  assert.match(comp, /minHeight: 60/);
  assert.match(comp, /aria-label=\{`Mappa \$\{z\.zone_name\}`\}/);
  assert.match(comp, /📍/);
});

test('C. COMPLETATE collassate di default con "Vedi completate"; sezione assente se 0', () => {
  const zs = mk({ 0: 'Completata' });
  const v = build(zs);
  assert.equal(v.completed.expanded, false);
  assert.match(comp, /Vedi completate/);
  assert.equal(build(mk()).completed.all.length, 0);
  assert.match(comp, /view\.completed\.all\.length > 0/);
  assert.equal(build(zs, { showCompleted: true }).completed.expanded, true);
});

test('D. di default solo le prime 4 zone future', () => {
  const v = build(mk({ 0: 'Completata', 1: 'In corso' }));
  assert.equal(FUTURE_ZONES_DEFAULT_LIMIT, 4);
  assert.deepEqual(names(v.toStart.visible), ['PARCO NORD', 'AFFORI', 'BOVISASCA', 'NIGUARDA']);
  assert.equal(v.toStart.all.length, 18);
});

test('E/F. "Mostra altre N zone" espande, "Mostra meno" richiude', () => {
  const zs = mk({ 0: 'Completata', 1: 'In corso' });
  const collapsed = build(zs);
  assert.equal(collapsed.toStart.hiddenCount, 14);
  assert.match(comp, /Mostra altre \{view\.toStart\.hiddenCount\} zone/);
  const open = build(zs, { expandedFuture: true });
  assert.equal(open.toStart.visible.length, 18);
  assert.equal(open.toStart.canCollapse, true);
  assert.match(comp, /Mostra meno/);
  assert.match(comp, /aria-expanded=\{false\}/);
  assert.match(comp, /aria-expanded=\{true\}/);
});

test('G. ricerca "comas" -> COMASINA, "aff" -> AFFORI; case/accent-insensitive; ignora il limite', () => {
  const zs = mk();
  assert.deepEqual(names(build(zs, { query: 'comas' }).toStart.visible), ['COMASINA']);
  assert.deepEqual(names(build(zs, { query: 'AFF' }).toStart.visible), ['AFFORI']);
  assert.equal(normalizeZoneSearch('Cinìsello'), 'cinisello');
  const many = build(zs, { query: 'o' });
  assert.ok(many.toStart.visible.length > FUTURE_ZONES_DEFAULT_LIMIT, 'con ricerca si vedono tutti i risultati');
  assert.equal(build(zs, { query: 'zzzz' }).noResults, true);
  assert.match(comp, /placeholder="Cerca Comasina, Affori\.\.\."/);
  assert.match(comp, /htmlFor="driver-zone-search"/);
});

test('H. filtri Tutte / In corso / Da iniziare / Completate', () => {
  const zs = mk({ 0: 'Completata', 1: 'In corso' });
  const inProg = build(zs, { filter: 'in_progress' });
  assert.equal(inProg.inProgress.length, 1);
  assert.equal(inProg.toStart.all.length, 0);
  assert.equal(inProg.completed.all.length, 0);
  const todo = build(zs, { filter: 'to_start' });
  assert.equal(todo.inProgress.length, 0);
  assert.equal(todo.toStart.all.length, 18);
  const done = build(zs, { filter: 'completed' });
  assert.equal(done.completed.all.length, 1);
  assert.equal(done.completed.expanded, true);
  assert.match(comp, /aria-pressed=\{on\}/);
  assert.match(comp, /overflowX: 'auto'/);
});

test('I/J. gli handler di avvio/chiusura restano quelli esistenti (stessa RPC, stessi status)', () => {
  // Modello multi-device: Inizia apre la sessione GPS di QUESTO telefono
  // (gps_start_session_v3 lato server marca la zona In corso); Termina chiude
  // sessione + zona nella stessa transazione (gps_transition_session_v3).
  assert.match(page, /function startZone\(z\)/);
  assert.match(page, /await tracking\.start\(z\.id\)/);
  assert.match(page, /function completeZone\(z\)/);
  assert.match(page, /await tracking\.end\(\)/);
  assert.match(page, /Questo telefono sta già lavorando su/);
  assert.match(comp, /`Termina \$\{z\.zone_name\}`/);
  assert.match(comp, /aria-label=\{`Inizia \$\{z\.zone_name\}`\}/);
  assert.match(page, /onStart=\{startZone\}/);
  assert.match(page, /onComplete=\{completeZone\}/);
});

test('L. nessun auto-completamento e nessun vincolo di ordine introdotto', () => {
  assert.doesNotMatch(comp + view, /status: 'Completata'|setDriverZoneWorkStatus|coverage/i);
  const w = computeZoneWorkflow(mk());
  assert.equal(w.canStart(mk()[5]), true, 'ogni zona DA_INIZIARE resta avviabile');
});

test('M. nessuna richiesta di rete per zona: lista, ricerca, filtri e collassi sono client-side', () => {
  assert.doesNotMatch(comp + view, /fetch\(|supabase|\.rpc\(|import\(.*supabase/);
  assert.match(comp, /useMemo/);
});

test('N/O. Samsung 412 / iPhone 390: nessun overflow orizzontale (min-width 0, wrap, chip scrollabili, input 16px)', () => {
  assert.match(comp, /minWidth: 0, maxWidth: '100%'/);
  assert.match(comp, /flexWrap: 'wrap'/);
  assert.match(comp, /overflowWrap: 'anywhere'/);
  assert.match(comp, /overflowX: 'auto'/);
  assert.match(comp, /fontSize: 16/);
  assert.match(comp, /const TOUCH = 44/);
  // nessuna larghezza fissa in px sopra 390 negli elementi della lista
  const widths = [...comp.matchAll(/(?:^|[^a-zA-Z])width: (\d+)/g)].map((m) => Number(m[1]));
  assert.ok(widths.every((w) => w <= 390), `larghezze fisse: ${widths}`);
});

test('ordine pagina invariato: Programma Operativo, Segnalazioni, Messaggi, Controlli', () => {
  const p = page.indexOf('<DriverZoneProgram');
  const i = page.indexOf('<DriverIssuesSection');
  const m = page.indexOf('<DriverMessagesSection');
  const c = page.indexOf('{/* Controls */}');
  assert.ok(p > 0 && p < i && i < m && m < c);
});
