// Regression tests (render + mock DB) per il destinatario del programma in Assegna lavoro.
// Rendono il VERO AssignWork (bundle esbuild con admin-api/gps-api/supabaseClient simulati, dati sintetici,
// window.open sostituito: nessun invio reale, nessuna rete).
//
// Contratto corrente (058ad29 + fix identita' canonica):
//  - "Automatico (in base a Gruppo / Fornitore)" = nessuna scelta esplicita: precedenza gruppo > fornitore;
//  - una scelta esplicita (isManualChoice) vince su gruppo/fornitore, e non ricade mai su un altro destinatario;
//  - lo snapshot salvato in metadata.explicit_program_recipient e' {type,id,name,phone} (isManualChoice e
//    groupName sono metadati di UI, non identita'); la verifica post-salvataggio confronta l'identita' canonica;
//  - allo step 4 visualizzazione, messaggio, stato di invio e target wa.me leggono lo STESSO destinatario salvato;
//  - il compenso e' quello inserito dall'admin / da un'unica offerta accettata, mai il prezzo cliente.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { buildSupplierProgramWhatsAppMessage } from '../src/lib/services/admin-api.js';
import { RECIPIENT_REQUIRED } from '../src/lib/services/recipientResolver.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const NAMES = ['adminListSuppliers', 'listAssignableOperators', 'getCampaignZonesWithGroups', 'getCampaignRecord', 'listAssignmentZones', 'createOperatorAssignment', 'updateOperatorAssignment', 'setAssignmentZones', 'updateCampaignZoneAssignment', 'generateDriverAssignmentLink', 'createOperationalGroup', 'revokeOperatorAssignment', 'buildSupplierProgramWhatsAppMessage', 'buildDriverWhatsAppMessage'];

let temp;
let bundle;
const previousWindow = globalThis.window;

before(async () => {
  temp = await mkdtemp(new URL('./.recipient-render-', import.meta.url));
  const outfile = `${temp}/bundle.mjs`;
  await build({
    stdin: {
      contents: `export { AssignWork } from './src/pages/admin/AssignWork.jsx'; export { AssignWorkGroupOperatorStep as Group } from './src/pages/admin/assign-work/AssignWorkGroupOperatorStep.jsx'; export { AssignWorkProgramStep as Program } from './src/pages/admin/assign-work/AssignWorkProgramStep.jsx'; export { AssignWorkPreviewStep as Preview } from './src/pages/admin/assign-work/AssignWorkPreviewStep.jsx'; export { AssignWorkResultStep as Result } from './src/pages/admin/assign-work/AssignWorkResultStep.jsx';`,
      resolveDir: process.cwd(),
    },
    outfile, bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', external: ['react', 'react/jsx-runtime'],
    plugins: [{ name: 'mock-db', setup(b) {
      b.onResolve({ filter: /(?:admin-api|gps-api|supabaseClient)\.js$/ }, (args) => ({ path: args.path, namespace: 'mock-db' }));
      b.onLoad({ filter: /.*/, namespace: 'mock-db' }, (args) => ({ contents: args.path.includes('supabaseClient')
        ? 'export const supabase = new Proxy({}, { get: (_target, key) => globalThis.__recipientFixture.supabase[key] }); export const ensureSupabaseSessionBridge = async () => {};'
        : NAMES.map((name) => `export const ${name} = (...args) => globalThis.__recipientFixture.api.${name}(...args);`).join('\n') }));
    } }],
    logLevel: 'silent',
  });
  bundle = await import(pathToFileURL(outfile));
});

after(async () => {
  globalThis.window = previousWindow;
  delete globalThis.__recipientFixture;
  if (temp) await rm(temp, { recursive: true, force: true });
});

// ── dati sintetici (nessun destinatario reale) ────────────────────────────────
const HASSAN = { id: 'hassan', display_name: 'Hassan', phone: '3511234567' }; // -> 393511234567
const SUPPLIER_A = { id: 'sup-a', company_name: 'Fornitore A Srl', contact_name: 'Referente A', phone: '3510000001' }; // -> 393510000001

// Fixture del DB simulato. persistOverride(metadata) permette di simulare un salvataggio che persiste dati diversi.
function makeFixture({ suppliers = [], operators = [], groups = [], quotes = [], persistOverride = null, quotesPromise = null } = {}) {
  const state = { calls: [], saved: null, creates: 0, updates: 0, opens: [] };
  const persist = (metadata) => {
    const copy = structuredClone(metadata);
    return persistOverride ? persistOverride(copy) : copy;
  };
  state.api = {
    buildSupplierProgramWhatsAppMessage,
    buildDriverWhatsAppMessage: () => '',
    adminListSuppliers: async () => { state.calls.push('suppliers'); return { available: true, rows: suppliers }; },
    listAssignableOperators: async () => { state.calls.push('operators'); return operators; },
    getCampaignZonesWithGroups: async () => { state.calls.push('zones'); return { groups, zones: [{ id: 'zone', zone_name: 'Milano', quantity_assigned: 1000 }] }; },
    getCampaignRecord: async () => { state.calls.push('campaign'); return { id: 'campaign', title: 'Test locale', total_amount: 9999, metadata: {} }; },
    listAssignmentZones: async () => [{ zone_id: 'zone', quantity: 1000 }],
    createOperatorAssignment: async (payload) => { state.creates += 1; state.saved = { id: 'assignment', access_token: 'fixture-token', status: 'active', operator_id: payload.operatorId, group_id: payload.groupId, metadata: persist(payload.metadata) }; return state.saved; },
    updateOperatorAssignment: async (id, payload) => { assert.equal(id, 'assignment'); state.updates += 1; state.saved = { ...state.saved, ...payload, metadata: persist(payload.metadata ?? state.saved.metadata) }; return state.saved; },
    setAssignmentZones: async () => [],
    updateCampaignZoneAssignment: async () => {},
    generateDriverAssignmentLink: () => 'https://example.test/program',
    createOperationalGroup: async () => {},
    revokeOperatorAssignment: async () => {},
  };
  state.supabase = { from: () => ({
    select: () => ({ eq: () => { state.calls.push('quotes'); return quotesPromise || Promise.resolve({ data: quotes, error: null }); } }),
    update: () => ({ eq: async () => ({ error: null }) }),
  }) };
  globalThis.__recipientFixture = state;
  globalThis.window = { open: (...args) => { state.opens.push(args); } };
  return state;
}

async function mount(props = {}) {
  let renderer;
  await act(async () => { renderer = TestRenderer.create(React.createElement(bundle.AssignWork, { campaignId: 'campaign', ...props })); });
  return renderer;
}
const group = (r) => r.root.findByType(bundle.Group).props;
const pageText = (r) => JSON.stringify(r.toJSON());
const recipientSelect = (r) => r.root.findAllByType('select').find((node) => node.findAllByType('option').some((o) => o.props.value === '' && String(o.children.join('')).startsWith('Automatico')));
const optionFor = (r, id) => recipientSelect(r).findAllByType('option').find((o) => String(o.props.value).includes(`"id":"${id}"`));
const chooseRecipient = (r, id) => act(async () => recipientSelect(r).props.onChange({ target: { value: optionFor(r, id).props.value } }));
async function fillProgramAndGoToPreview(r, compensation = '250') {
  await act(async () => group(r).setStep(2));
  await act(async () => { const p = r.root.findByType(bundle.Program).props; p.setSupplierCompensation(compensation); p.handleToggleZone('zone'); });
  await act(async () => r.root.findByType(bundle.Program).props.setStep(3));
}
const save = (r) => act(async () => r.root.findByType(bundle.Preview).props.handleSave());
const resultMounted = (r) => r.root.findAllByType(bundle.Result).length === 1;
// testo visibile del riepilogo destinatario dello step 4
const recipientSummary = (r) => {
  const out = [];
  (function walk(n) { if (typeof n === 'string') out.push(n); else if (n) (n.children || []).forEach(walk); })(r.toJSON());
  return out.join(' ').match(/Destinatario programma:?.{0,110}/)?.[0] || '';
};

test('AssignWork explicit recipient + €250: independent reads, save without false error, persisted identity, wa.me, modify and remount', async () => {
  let releaseQuotes;
  const quotesPromise = new Promise((resolve) => { releaseQuotes = resolve; });
  const state = makeFixture({ operators: [HASSAN], quotesPromise });
  let r = await mount();
  try {
    // le letture indipendenti partono insieme, prima che le offerte siano rilasciate
    assert.deepEqual(new Set(state.calls), new Set(['quotes', 'suppliers', 'operators', 'zones', 'campaign']));
    await act(async () => { releaseQuotes({ data: [{ supplier_id: 's', quote_status: 'submitted', total_amount: 999 }], error: null }); });
    assert.equal(group(r).canGoNext(), false, 'nessun destinatario: Avanti bloccato');
    assert.ok(recipientSelect(r), "il selettore mostra l'opzione Automatico");

    await chooseRecipient(r, 'hassan');
    assert.equal(group(r).canGoNext(), true);
    await act(async () => group(r).setStep(2));
    assert.equal(r.root.findByType(bundle.Program).props.supplierCompensation, '', "un'offerta solo inviata non precompila il compenso");
    await act(async () => { const p = r.root.findByType(bundle.Program).props; p.setSupplierCompensation('250'); p.handleToggleZone('zone'); });
    await act(async () => r.root.findByType(bundle.Program).props.setStep(3));
    assert.equal(r.root.findByType(bundle.Preview).props.supplierCompensation, '250');
    assert.match(pageText(r), /Hassan/);

    await save(r);
    assert.ok(resultMounted(r), 'il salvataggio del destinatario esplicito riesce e mostra lo step 4');
    assert.doesNotMatch(pageText(r), /Impossibile salvare/, 'nessun falso errore di conferma del salvataggio');
    // snapshot persistito = solo identita' canonica (nessun isManualChoice / groupName)
    assert.deepEqual(state.saved.metadata.explicit_program_recipient, { type: 'operator', id: 'hassan', name: 'Hassan', phone: '393511234567' });
    assert.equal(state.saved.metadata.supplier_compensation, 250);

    await act(async () => r.root.findByType(bundle.Result).props.handleWhatsApp());
    const url = new URL(state.opens[0][0]);
    assert.equal(url.pathname, '/393511234567');
    assert.match(url.searchParams.get('text'), /250/);
    assert.doesNotMatch(url.searchParams.get('text'), /9999/, 'il prezzo cliente non sostituisce il compenso');

    const modify = r.root.findAllByType('button').find((node) => node.children.includes('Modifica programma'));
    await act(async () => modify.props.onClick());
    await act(async () => r.root.findByType(bundle.Program).props.setStep(3));
    await save(r);
    assert.equal(state.creates, 1);
    assert.equal(state.updates, 1);
    assert.ok(resultMounted(r), 'anche il salvataggio in modifica riesce');

    // ricarica: la scelta esplicita resta la stessa e non torna Automatico
    await act(async () => r.unmount());
    r = await mount({ existingAssignment: JSON.parse(JSON.stringify(state.saved)) });
    assert.match(pageText(r), /393511234567/);
    assert.equal(JSON.parse(recipientSelect(r).props.value).id, 'hassan');
    assert.equal(JSON.parse(recipientSelect(r).props.value).isManualChoice, true);
    await act(async () => group(r).setStep(2));
    assert.equal(r.root.findByType(bundle.Program).props.supplierCompensation, '250');
  } finally {
    await act(async () => r.unmount());
  }
});

// Un salvataggio che persiste un'identita' diversa (o un compenso diverso) NON deve essere confermato.
for (const [label, override] of [
  ['telefono diverso', (m) => ({ ...m, explicit_program_recipient: { ...m.explicit_program_recipient, phone: '3519999999' } })],
  ['id diverso', (m) => ({ ...m, explicit_program_recipient: { ...m.explicit_program_recipient, id: 'hassan-2' } })],
  ['nome diverso', (m) => ({ ...m, explicit_program_recipient: { ...m.explicit_program_recipient, name: 'Hassan X' } })],
  ['tipo diverso', (m) => ({ ...m, explicit_program_recipient: { ...m.explicit_program_recipient, type: 'registered_supplier' } })],
  ['compenso diverso', (m) => ({ ...m, supplier_compensation: 251 })],
]) {
  test(`post-save verification fails when the persisted ${label}`, async () => {
    const state = makeFixture({ operators: [HASSAN], persistOverride: override });
    const r = await mount();
    try {
      await chooseRecipient(r, 'hassan');
      await fillProgramAndGoToPreview(r);
      await save(r);
      assert.equal(resultMounted(r), false, 'senza conferma dell identita/compenso salvati non si passa allo step 4');
      assert.ok(r.root.findAllByType(bundle.Preview).length === 1, 'resta sull anteprima');
      assert.match(pageText(r), /Impossibile salvare/);
      assert.equal(state.opens.length, 0, 'nessuna apertura WhatsApp');
    } finally {
      await act(async () => r.unmount());
    }
  });
}

test('Step 4 with supplier A + explicit operator B: display, message and WhatsApp target are all B', async () => {
  const state = makeFixture({ suppliers: [SUPPLIER_A], operators: [HASSAN] });
  const r = await mount();
  try {
    await act(async () => group(r).setSelectedSupplierId('sup-a'));
    await chooseRecipient(r, 'hassan');
    await fillProgramAndGoToPreview(r);
    await save(r);
    assert.ok(resultMounted(r));
    assert.deepEqual(state.saved.metadata.explicit_program_recipient, { type: 'operator', id: 'hassan', name: 'Hassan', phone: '393511234567' });

    const result = r.root.findByType(bundle.Result).props;
    assert.equal(result.recipientValid, true);
    assert.equal(result.resolvedRecipient.recipientName, 'Hassan');
    assert.equal(result.resolvedRecipient.phone, '393511234567');
    const summary = recipientSummary(r);
    assert.match(summary, /Hassan/);
    assert.match(summary, /393511234567/);
    assert.doesNotMatch(summary, /Fornitore A/, 'il fornitore selezionato non sostituisce il destinatario esplicito');

    const message = result.buildWhatsAppMsg();
    assert.match(message, /Hassan/);
    assert.doesNotMatch(message, /Fornitore A/, 'il saluto non nomina il fornitore A');

    await act(async () => r.root.findByType(bundle.Result).props.handleWhatsApp());
    assert.equal(state.opens.length, 1);
    const url = new URL(state.opens[0][0]);
    assert.equal(url.pathname, '/393511234567', 'il target wa.me e il destinatario B');
    assert.match(url.searchParams.get('text'), /Hassan/);
    assert.doesNotMatch(url.searchParams.get('text'), /Fornitore A/);
  } finally {
    await act(async () => r.unmount());
  }
});

test('invalid explicit recipient phone blocks and never falls through to the selected supplier', async () => {
  const state = makeFixture({ suppliers: [SUPPLIER_A], operators: [HASSAN] });
  const existingAssignment = {
    id: 'assignment', access_token: 'fixture-token', status: 'active',
    metadata: { explicit_program_recipient: { type: 'operator', id: 'hassan', name: 'Hassan', phone: 'non-valido' }, supplier_id: 'sup-a' },
  };
  const r = await mount({ existingAssignment });
  try {
    await act(async () => group(r).setSelectedSupplierId('sup-a'));
    assert.equal(group(r).canGoNext(), false, 'telefono esplicito non valido: nessun ripiego sul fornitore A');
    assert.match(pageText(r), new RegExp(RECIPIENT_REQUIRED.slice(0, 20)));
    const next = r.root.findAllByType('button').find((b) => b.children.join('').includes('Avanti'));
    assert.equal(next.props.disabled, true);
    assert.equal(state.creates + state.updates, 0);
    assert.equal(state.opens.length, 0);
  } finally {
    await act(async () => r.unmount());
  }
});

test('Automatico: supplier and group paths save with a canonical identity and target the resolved recipient', async () => {
  // fornitore selezionato
  let state = makeFixture({ suppliers: [SUPPLIER_A], operators: [HASSAN] });
  let r = await mount();
  try {
    await act(async () => group(r).setSelectedSupplierId('sup-a'));
    assert.equal(group(r).canGoNext(), true);
    assert.equal(JSON.parse(recipientSelect(r).props.value || 'null'), null, 'il selettore resta su Automatico');
    await fillProgramAndGoToPreview(r);
    await save(r);
    assert.ok(resultMounted(r), 'il percorso Automatico con fornitore salva');
    assert.deepEqual(state.saved.metadata.explicit_program_recipient, { type: 'registered_supplier', id: 'sup-a', name: 'Fornitore A Srl', phone: '393510000001' });
    await act(async () => r.root.findByType(bundle.Result).props.handleWhatsApp());
    assert.equal(new URL(state.opens[0][0]).pathname, '/393510000001');
  } finally {
    await act(async () => r.unmount());
  }
  // gruppo con telefono del capo squadra (precedenza gruppo > fornitore): nessun groupName persistito e
  // il salvataggio non deve fallire; il fornitore A e' selezionato ma NON e' il destinatario
  state = makeFixture({ suppliers: [SUPPLIER_A], groups: [{ id: 'grp-1', name: 'Squadra Test', lead_name: 'Capo Squadra', lead_phone: '3510000005' }] });
  r = await mount();
  try {
    await act(async () => group(r).setSelectedSupplierId('sup-a'));
    await act(async () => group(r).setSelectedGroupId('grp-1'));
    assert.equal(group(r).canGoNext(), true);
    await fillProgramAndGoToPreview(r);
    await save(r);
    assert.ok(resultMounted(r), 'il percorso Automatico con gruppo salva');
    const persisted = state.saved.metadata.explicit_program_recipient;
    assert.equal(persisted.type, 'group');
    assert.equal(persisted.phone, '393510000005');
    assert.equal('groupName' in persisted, false);
    assert.equal('isManualChoice' in persisted, false);
    await act(async () => r.root.findByType(bundle.Result).props.handleWhatsApp());
    assert.equal(new URL(state.opens[0][0]).pathname, '/393510000005');
  } finally {
    await act(async () => r.unmount());
  }
});

test('Step 1: Automatico does not deadlock when a valid recipient resolves and blocks when none does', async () => {
  makeFixture({
    suppliers: [{ id: 'sp', company_name: 'postini test', contact_name: 'Fadi Test', phone: '3510000003' }],
    operators: [HASSAN],
    groups: [{ id: 'gf', name: 'fadi', lead_name: 'Fadi Test' }],
  });
  let r = await mount();
  try {
    await act(async () => group(r).setSelectedSupplierId('sp'));
    assert.equal(group(r).canGoNext(), true, 'solo fornitore: Avanti abilitato');
    assert.match(pageText(r), /postini test/);
    await act(async () => group(r).setSelectedGroupId('gf'));
    const labels = recipientSelect(r).findAllByType('option').map((o) => o.children.join(''));
    assert.ok(labels.some((l) => l.includes('postini test')), 'opzione fornitore');
    assert.ok(labels.some((l) => l.includes('Fadi Test')), 'opzione capo gruppo');
    // scelta esplicita del gruppo, poi ritorno ad Automatico: nessun blocco
    const groupOption = recipientSelect(r).findAllByType('option').find((o) => String(o.props.value).includes('"type":"group"'));
    await act(async () => recipientSelect(r).props.onChange({ target: { value: groupOption.props.value } }));
    assert.equal(group(r).canGoNext(), true);
    await act(async () => recipientSelect(r).props.onChange({ target: { value: '' } }));
    assert.equal(group(r).canGoNext(), true, 'Automatico con fornitore valido non deve bloccare Step 1');
    assert.doesNotMatch(pageText(r), /Seleziona il destinatario del programma/);
    await act(async () => group(r).setStep(2));
    assert.equal(r.root.findAllByType(bundle.Program).length, 1);
  } finally {
    await act(async () => r.unmount());
  }

  // nessun destinatario valido (fornitore e gruppo senza telefono): Step 1 non avanza e non ripiega su altri
  makeFixture({
    suppliers: [{ id: 'sn', company_name: 'Ditta Senza Tel' }],
    operators: [HASSAN],
    groups: [{ id: 'gv', name: 'Gruppo Vuoto' }],
  });
  r = await mount();
  try {
    await act(async () => group(r).setSelectedSupplierId('sn'));
    await act(async () => group(r).setSelectedGroupId('gv'));
    assert.equal(group(r).canGoNext(), false);
    assert.match(pageText(r), new RegExp(RECIPIENT_REQUIRED.slice(0, 20)));
    const next = r.root.findAllByType('button').find((b) => b.children.join('').includes('Avanti'));
    assert.equal(next.props.disabled, true);
  } finally {
    await act(async () => r.unmount());
  }
});
