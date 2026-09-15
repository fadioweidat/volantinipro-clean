import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { buildSupplierProgramWhatsAppMessage } from '../src/lib/services/admin-api.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
test('AssignWork explicit recipient + €250: preview, save, result, modify and remount; independent reads start together (mock DB)', async () => {
  const temp = await mkdtemp(new URL('./.recipient-render-', import.meta.url));
  let renderer;
  const previousWindow = globalThis.window;
  try {
    const calls = []; let releaseQuotes; let saved; let creates = 0; let updates = 0;
    const quotes = new Promise(resolve => { releaseQuotes = resolve; });
    const api = {
      buildSupplierProgramWhatsAppMessage,
      adminListSuppliers: async () => { calls.push('suppliers'); return { available: true, rows: [] }; },
      listAssignableOperators: async () => { calls.push('operators'); return [{ id: 'hassan', display_name: 'Hassan', phone: '3511234567' }]; },
      getCampaignZonesWithGroups: async () => { calls.push('zones'); return { groups: [], zones: [{ id: 'zone', zone_name: 'Milano', quantity_assigned: 1000 }] }; },
      getCampaignRecord: async () => { calls.push('campaign'); return { id: 'campaign', title: 'Test locale', total_amount: 9999, metadata: {} }; },
      listAssignmentZones: async () => [{ zone_id: 'zone', quantity: 1000 }],
      createOperatorAssignment: async payload => { creates++; saved = { id: 'assignment', access_token: 'fixture-token', status: 'active', metadata: structuredClone(payload.metadata) }; return saved; },
      updateOperatorAssignment: async (id, payload) => { assert.equal(id, 'assignment'); updates++; saved = { ...saved, ...payload }; return saved; },
      setAssignmentZones: async () => [], updateCampaignZoneAssignment: async () => {},
      generateDriverAssignmentLink: () => 'https://example.test/program',
      createOperationalGroup: async () => {}, revokeOperatorAssignment: async () => {},
    };
    globalThis.__recipientFixture = { api, supabase: { from: table => ({
      select: () => ({ eq: () => { calls.push('quotes'); return quotes; } }),
      update: () => ({ eq: async () => ({ error: null }) }),
    }) } };
    const outfile = `${temp}/bundle.mjs`;
    await build({ stdin: { contents: `export { AssignWork } from './src/pages/admin/AssignWork.jsx'; export { AssignWorkGroupOperatorStep as Group } from './src/pages/admin/assign-work/AssignWorkGroupOperatorStep.jsx'; export { AssignWorkProgramStep as Program } from './src/pages/admin/assign-work/AssignWorkProgramStep.jsx'; export { AssignWorkPreviewStep as Preview } from './src/pages/admin/assign-work/AssignWorkPreviewStep.jsx'; export { AssignWorkResultStep as Result } from './src/pages/admin/assign-work/AssignWorkResultStep.jsx';`, resolveDir: process.cwd() },
      outfile, bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', external: ['react', 'react/jsx-runtime'],
      plugins: [{ name: 'mock-db', setup(b) {
        b.onResolve({ filter: /(?:admin-api|gps-api|supabaseClient)\.js$/ }, args => ({ path: args.path, namespace: 'mock-db' }));
        b.onLoad({ filter: /.*/, namespace: 'mock-db' }, args => ({ contents: args.path.includes('supabaseClient')
          ? 'export const supabase = globalThis.__recipientFixture.supabase; export const ensureSupabaseSessionBridge = async () => {};'
          : Object.keys(api).map(name => `export const ${name} = (...args) => globalThis.__recipientFixture.api.${name}(...args);`).join('\n') + '\nexport const buildDriverWhatsAppMessage = () => "";' }));
      } }], logLevel: 'silent' });
    const { AssignWork, Group, Program, Preview, Result } = await import(pathToFileURL(outfile));
    const opens = []; globalThis.window = { open: (...args) => opens.push(args) };
    await act(async () => { renderer = TestRenderer.create(React.createElement(AssignWork, { campaignId: 'campaign' })); });
    assert.deepEqual(new Set(calls), new Set(['quotes', 'suppliers', 'operators', 'zones', 'campaign']));
    await act(async () => { releaseQuotes({ data: [{ supplier_id: 's', quote_status: 'submitted', total_amount: 999 }], error: null }); });
    assert.equal(renderer.root.findByType(Group).props.canGoNext(), false);
    await act(async () => {
      const props = renderer.root.findByType(Group).props;
      props.setSupplierMode('manual'); props.setManualSupplier({ name: 'Fornitore test', phone: '3331112233', contact_name: '', email: '', notes: '' });
    });
    const recipientSelect = renderer.root.findAllByType('select').find(node => node.findAllByType('option').some(o => o.props.value === '' && o.children.includes('Seleziona destinatario')));
    const option = recipientSelect.findAllByType('option').find(node => String(node.props.value).includes('hassan'));
    await act(async () => recipientSelect.props.onChange({ target: { value: option.props.value } }));
    assert.equal(renderer.root.findByType(Group).props.canGoNext(), true);
    await act(async () => renderer.root.findByType(Group).props.setStep(2));
    assert.equal(renderer.root.findByType(Program).props.supplierCompensation, '');
    await act(async () => { const p = renderer.root.findByType(Program).props; p.setSupplierCompensation('250'); p.handleToggleZone('zone'); });
    await act(async () => renderer.root.findByType(Program).props.setStep(3));
    assert.equal(renderer.root.findByType(Preview).props.supplierCompensation, '250');
    assert.match(JSON.stringify(renderer.toJSON()), /Hassan/);
    await act(async () => renderer.root.findByType(Preview).props.handleSave());
    assert.deepEqual(saved.metadata.explicit_program_recipient, { type: 'operator', id: 'hassan', name: 'Hassan', phone: '393511234567' });
    assert.equal(saved.metadata.supplier_compensation, 250);
    await act(async () => renderer.root.findByType(Result).props.handleWhatsApp());
    const url = new URL(opens[0][0]); assert.equal(url.pathname, '/393511234567'); assert.match(url.searchParams.get('text'), /250/); assert.doesNotMatch(url.searchParams.get('text'), /9999/);
    const modify = renderer.root.findAllByType('button').find(node => node.children.includes('Modifica programma'));
    await act(async () => modify.props.onClick());
    await act(async () => renderer.root.findByType(Program).props.setStep(3));
    await act(async () => renderer.root.findByType(Preview).props.handleSave());
    assert.equal(creates, 1); assert.equal(updates, 1);
    await act(async () => renderer.unmount());
    await act(async () => { renderer = TestRenderer.create(React.createElement(AssignWork, { campaignId: 'campaign', existingAssignment: JSON.parse(JSON.stringify(saved)) })); });
    assert.match(JSON.stringify(renderer.toJSON()), /393511234567/);
    await act(async () => renderer.root.findByType(Group).props.setStep(2));
    assert.equal(renderer.root.findByType(Program).props.supplierCompensation, '250');
  } finally {
    if (renderer) await act(async () => renderer.unmount());
    globalThis.window = previousWindow; delete globalThis.__recipientFixture;
    assert.ok(temp.startsWith(new URL('.', import.meta.url).pathname.replace(/^\/(?:([A-Za-z]):)/, '$1:')) || /^.*[\\/]tests[\\/]\.recipient-render-[^\\/]+$/.test(temp));
    await rm(temp, { recursive: true, force: true });
  }
});

test('AssignWork Step 1 deadlock fix: postini pubblicitari + fadi group resolves recipients, enables Avanti al programma, and explains blocks', async () => {
  const temp = await mkdtemp(new URL('./.recipient-render-deadlock-', import.meta.url));
  let renderer;
  const previousWindow = globalThis.window;
  try {
    const api = {
      buildSupplierProgramWhatsAppMessage,
      adminListSuppliers: async () => ({
        available: true,
        rows: [{
          id: 'supplier-postini',
          company_name: 'postini pubblicitari',
          contact_name: 'Fadi oweidat',
          phone: '+393277175000',
        }],
      }),
      listAssignableOperators: async () => [{ id: 'hassan', display_name: 'Hassan', phone: '3511234567' }],
      getCampaignZonesWithGroups: async () => ({
        groups: [{ id: 'group-fadi', name: 'fadi', lead_name: 'Fadi oweidat' }],
        zones: [{ id: 'zone-1', zone_name: 'Centro', quantity_assigned: 500 }],
      }),
      getCampaignRecord: async () => ({ id: 'campaign-1', title: 'Campagna Test', total_amount: 1000, metadata: {} }),
      listAssignmentZones: async () => [],
      createOperatorAssignment: async payload => ({ id: 'new-assignment', metadata: payload.metadata }),
      updateOperatorAssignment: async () => {},
      setAssignmentZones: async () => [],
      updateCampaignZoneAssignment: async () => {},
      generateDriverAssignmentLink: () => 'https://example.test/program',
      createOperationalGroup: async () => {},
      revokeOperatorAssignment: async () => {},
    };
    globalThis.__recipientFixture = { api, supabase: { from: () => ({
      select: () => ({ eq: async () => ({ data: [], error: null }) }),
      update: () => ({ eq: async () => ({ error: null }) }),
    }) } };
    const outfile = `${temp}/bundle.mjs`;
    await build({
      stdin: {
        contents: `export { AssignWork } from './src/pages/admin/AssignWork.jsx'; export { AssignWorkGroupOperatorStep as Group } from './src/pages/admin/assign-work/AssignWorkGroupOperatorStep.jsx'; export { AssignWorkProgramStep as Program } from './src/pages/admin/assign-work/AssignWorkProgramStep.jsx';`,
        resolveDir: process.cwd(),
      },
      outfile,
      bundle: true,
      platform: 'node',
      format: 'esm',
      jsx: 'automatic',
      external: ['react', 'react/jsx-runtime'],
      plugins: [{
        name: 'mock-db',
        setup(b) {
          b.onResolve({ filter: /(?:admin-api|gps-api|supabaseClient)\.js$/ }, args => ({ path: args.path, namespace: 'mock-db' }));
          b.onLoad({ filter: /.*/, namespace: 'mock-db' }, args => ({
            contents: args.path.includes('supabaseClient')
              ? 'export const supabase = globalThis.__recipientFixture.supabase; export const ensureSupabaseSessionBridge = async () => {};'
              : Object.keys(api).map(name => `export const ${name} = (...args) => globalThis.__recipientFixture.api.${name}(...args);`).join('\n') + '\nexport const buildDriverWhatsAppMessage = () => "";'
          }));
        }
      }],
      logLevel: 'silent',
    });

    const { AssignWork, Group, Program } = await import(pathToFileURL(outfile));
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(AssignWork, { campaignId: 'campaign-1' }));
    });

    const groupStep = renderer.root.findByType(Group);

    // 1. Select supplier 'supplier-postini'
    await act(async () => {
      groupStep.props.setSelectedSupplierId('supplier-postini');
    });

    // 2. The supplier is defaulted as explicit recipient because it has canonical phone +393277175000
    assert.equal(renderer.root.findByType(Group).props.canGoNext(), true);
    assert.match(JSON.stringify(renderer.toJSON()), /postini pubblicitari/);

    // 3. Select group 'group-fadi'
    await act(async () => {
      groupStep.props.setSelectedGroupId('group-fadi');
    });

    // Both supplier and group contact are available
    const select = renderer.root.findAllByType('select').find(n => n.findAllByType('option').some(o => o.props.value === '' && o.children.includes('Seleziona destinatario')));
    const options = select.findAllByType('option').map(o => o.children.join(''));
    assert.ok(options.some(opt => opt.includes('postini pubblicitari')));
    assert.ok(options.some(opt => opt.includes('Fadi oweidat')));

    // Next remains enabled
    assert.equal(renderer.root.findByType(Group).props.canGoNext(), true);

    // 4. Switch explicit recipient to Fadi oweidat (group)
    const fadiOption = select.findAllByType('option').find(o => String(o.props.value).includes('Fadi oweidat'));
    await act(async () => {
      select.props.onChange({ target: { value: fadiOption.props.value } });
    });
    assert.equal(renderer.root.findByType(Group).props.canGoNext(), true);

    // 5. If recipient is cleared: canGoNext is false and clear blocker message is displayed
    await act(async () => {
      select.props.onChange({ target: { value: '' } });
    });
    assert.equal(renderer.root.findByType(Group).props.canGoNext(), false);
    assert.match(JSON.stringify(renderer.toJSON()), /Seleziona il destinatario del programma\./);

    // 6. Reselect supplier recipient: enables next immediately and advancing to step 2 works
    const postiniOption = select.findAllByType('option').find(o => String(o.props.value).includes('postini pubblicitari'));
    await act(async () => {
      select.props.onChange({ target: { value: postiniOption.props.value } });
    });
    assert.equal(renderer.root.findByType(Group).props.canGoNext(), true);
    await act(async () => {
      renderer.root.findByType(Group).props.setStep(2);
    });
    assert.ok(renderer.root.findByType(Program));
  } finally {
    if (renderer) await act(async () => renderer.unmount());
    globalThis.window = previousWindow;
    delete globalThis.__recipientFixture;
    assert.ok(temp.startsWith(new URL('.', import.meta.url).pathname.replace(/^\/(?:([A-Za-z]):)/, '$1:')) || /^.*[\\/]tests[\\/]\.recipient-render-[^\\/]+$/.test(temp));
    await rm(temp, { recursive: true, force: true });
  }
});

