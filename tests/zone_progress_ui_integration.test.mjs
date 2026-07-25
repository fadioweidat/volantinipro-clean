import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import TestRenderer, { act } from 'react-test-renderer';
import test from 'node:test';
import { ZoneProgressPanel } from '../src/components/zone-progress/ZoneProgressPanel.jsx';
import { useZoneProgress, zoneProgressReducer } from '../src/hooks/useZoneProgress.js';
import { createZoneProgressClient } from '../src/lib/services/zone-progress-api.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const CAMPAIGN_ID = '30000000-0000-0000-0000-00000000000a';
const ZONE_ID = '40000000-0000-0000-0000-00000000000a';

test('zone progress reducer covers loading, success, empty, and errors', () => {
  const started = zoneProgressReducer(
    { ...baseState(), zones: [{ campaign_zone_id: ZONE_ID }] },
    { type: 'load_started' },
  );
  assert.equal(started.refreshing, true);
  assert.equal(started.loading, false);

  const empty = zoneProgressReducer(started, {
    type: 'load_succeeded',
    zones: [],
    history: [],
  });
  assert.deepEqual(empty.zones, []);
  assert.equal(empty.loading, false);

  const error = new Error('Non autorizzato');
  const failed = zoneProgressReducer(empty, { type: 'load_failed', error });
  assert.equal(failed.error, error);
  assert.equal(failed.refreshing, false);
});

test('ZoneProgressPanel renders loading, empty, customer, Admin, and history states', () => {
  const loading = renderToStaticMarkup(createElement(ZoneProgressPanel, { loading: true }));
  assert.match(loading, /Caricamento avanzamento zone/);

  const empty = renderToStaticMarkup(createElement(ZoneProgressPanel, { zones: [] }));
  assert.match(empty, /Nessuna zona configurata/);

  const customer = renderToStaticMarkup(createElement(ZoneProgressPanel, {
    zones: [zoneRow({ effective_percent: 35 })],
  }));
  assert.match(customer, /35%/);
  assert.doesNotMatch(customer, /Imposta override|Storico modifiche/);

  const admin = renderToStaticMarkup(createElement(ZoneProgressPanel, {
    zones: [zoneRow({ effective_percent: 55, manual_percent: 55, manual_override_enabled: true })],
    history: [{
      id: 'history-1',
      zone_name_snapshot: 'Centro',
      event_type: 'manual_override',
      old_effective_percent: 10,
      new_effective_percent: 55,
      reason: 'Verifica copertura',
      created_at: '2026-07-25T12:00:00Z',
    }],
    isAdmin: true,
  }));
  assert.match(admin, /Imposta override/);
  assert.match(admin, /Storico modifiche/);
  assert.match(admin, /Verifica copertura/);
});

test('main hook flow loads, sets, refreshes, clears, and refreshes history', async () => {
  const backend = createFakeBackend();
  const client = createZoneProgressClient(backend.supabase);
  let current;

  function Harness() {
    current = useZoneProgress({ campaignId: CAMPAIGN_ID, includeHistory: true, client });
    return createElement(ZoneProgressPanel, {
      zones: current.zones,
      history: current.history,
      loading: current.loading,
      refreshing: current.refreshing,
      error: current.error,
      notice: current.notice,
      isAdmin: true,
      mutatingZoneId: current.mutatingZoneId,
      onRefresh: current.refresh,
      onSetManual: current.setManualProgress,
      onClearManual: current.clearManualProgress,
    });
  }

  let renderer;
  await act(async () => {
    renderer = TestRenderer.create(createElement(Harness));
    await flushEffects();
  });
  assert.equal(current.loading, false);
  assert.equal(current.zones[0].effective_percent, 20);
  assert.equal(current.history.length, 0);

  let setResult;
  await act(async () => {
    setResult = await current.setManualProgress(ZONE_ID, 62, 'Controllo Admin');
  });
  assert.equal(setResult, true);
  assert.equal(current.zones[0].effective_percent, 62);
  assert.equal(current.history.length, 1);
  assert.equal(current.notice, 'Override manuale salvato.');

  let clearResult;
  await act(async () => {
    clearResult = await current.clearManualProgress(ZONE_ID, 'Ripristino automatico');
  });
  assert.equal(clearResult, true);
  assert.equal(current.zones[0].effective_percent, 20);
  assert.equal(current.history.length, 2);
  assert.equal(current.notice, 'Override manuale rimosso.');
  assert.deepEqual(backend.rpcNames, [
    'get_campaign_zone_progress',
    'admin_set_zone_manual_progress',
    'get_campaign_zone_progress',
    'admin_clear_zone_manual_progress',
    'get_campaign_zone_progress',
  ]);

  await act(async () => renderer.unmount());
});

test('successful mutation remains successful when the following refresh fails', async () => {
  let loadCount = 0;
  let setCount = 0;
  const client = {
    async getCampaignZoneProgress() {
      loadCount += 1;
      if (loadCount > 1) throw new Error('Refresh non disponibile');
      return [zoneRow({ effective_percent: 20 })];
    },
    async setZoneManualProgress() {
      setCount += 1;
      return zoneRow({
        effective_percent: 60,
        manual_percent: 60,
        manual_override_enabled: true,
      });
    },
    async clearZoneManualProgress() {
      throw new Error('not expected');
    },
  };
  let current;
  function Harness() {
    current = useZoneProgress({ campaignId: CAMPAIGN_ID, client });
    return null;
  }

  let renderer;
  await act(async () => {
    renderer = TestRenderer.create(createElement(Harness));
    await flushEffects();
  });

  let result;
  await act(async () => {
    result = await current.setManualProgress(ZONE_ID, 60, 'Verifica refresh');
  });

  assert.equal(result, true);
  assert.equal(setCount, 1);
  assert.equal(current.notice, 'Override manuale salvato.');
  assert.equal(current.error.message, 'Refresh non disponibile');
  assert.equal(current.zones[0].effective_percent, 20);
  await act(async () => renderer.unmount());
});

test('hook serializes mutations and rejects a concurrent set or clear', async () => {
  let releaseSet;
  const setGate = new Promise((resolve) => { releaseSet = resolve; });
  let setCount = 0;
  let clearCount = 0;
  const client = {
    async getCampaignZoneProgress() {
      return [zoneRow({ effective_percent: 20 })];
    },
    async setZoneManualProgress() {
      setCount += 1;
      await setGate;
      return zoneRow({
        effective_percent: 65,
        manual_percent: 65,
        manual_override_enabled: true,
      });
    },
    async clearZoneManualProgress() {
      clearCount += 1;
      return zoneRow();
    },
  };
  let current;
  function Harness() {
    current = useZoneProgress({ campaignId: CAMPAIGN_ID, client });
    return null;
  }

  let renderer;
  await act(async () => {
    renderer = TestRenderer.create(createElement(Harness));
    await flushEffects();
  });

  let firstMutation;
  await act(async () => {
    firstMutation = current.setManualProgress(ZONE_ID, 65, 'Prima mutation');
    await flushEffects();
  });

  let concurrentResult;
  await act(async () => {
    concurrentResult = await current.clearManualProgress(ZONE_ID, 'Mutation concorrente');
  });
  assert.equal(concurrentResult, false);
  assert.equal(setCount, 1);
  assert.equal(clearCount, 0);

  await act(async () => {
    releaseSet();
    assert.equal(await firstMutation, true);
  });
  assert.equal(current.mutatingZoneId, null);
  await act(async () => renderer.unmount());
});

test('hook exposes authorization errors without fallback data', async () => {
  const client = createZoneProgressClient({
    async rpc() {
      return { data: null, error: { code: '42501', message: 'CAMPAGNA_NON_AUTORIZZATA' } };
    },
  });
  let current;
  function Harness() {
    current = useZoneProgress({ campaignId: CAMPAIGN_ID, client });
    return null;
  }
  let renderer;
  await act(async () => {
    renderer = TestRenderer.create(createElement(Harness));
    await flushEffects();
  });
  assert.equal(current.error.code, 'zone_progress_forbidden');
  assert.deepEqual(current.zones, []);
  await act(async () => renderer.unmount());
});

test('routed UI integrates customer and Admin roles while operator stays excluded', () => {
  const customerPage = readFileSync('src/pages/customer/CampaignTracking.jsx', 'utf8');
  const adminPage = readFileSync('src/pages/admin/GpsMonitor.jsx', 'utf8');
  const operatorPage = readFileSync('src/pages/driver/TrackingPage.jsx', 'utf8');
  const service = readFileSync('src/lib/services/zone-progress-api.js', 'utf8');

  assert.match(customerPage, /useZoneProgress\(\{ campaignId \}\)/);
  assert.match(customerPage, /<ZoneProgressPanel/);
  assert.doesNotMatch(customerPage, /isAdmin|onSetManual|onClearManual/);

  assert.match(adminPage, /includeHistory: true/);
  assert.match(adminPage, /onSetManual=\{zoneProgress\.setManualProgress\}/);
  assert.match(adminPage, /onClearManual=\{zoneProgress\.clearManualProgress\}/);

  assert.doesNotMatch(operatorPage, /useZoneProgress|ZoneProgressPanel/);
  assert.doesNotMatch(service, /\.from\(['"]campaign_zone_progress['"]\)/);
  assert.match(service, /\.from\(['"]campaign_zone_progress_history['"]\)/);
});

function baseState() {
  return {
    loading: true,
    refreshing: false,
    mutatingZoneId: null,
    zones: [],
    history: [],
    error: null,
    notice: '',
  };
}

function zoneRow(overrides = {}) {
  return {
    campaign_zone_id: ZONE_ID,
    campaign_id: CAMPAIGN_ID,
    zone_name: 'Centro',
    address_label: 'Milano',
    effective_percent: 20,
    updated_at: '2026-07-25T12:00:00Z',
    automatic_percent: 20,
    manual_percent: null,
    manual_override_enabled: false,
    override_reason: null,
    calculation_version: 'zone-progress-v1',
    source_summary: {},
    automatic_updated_at: null,
    updated_by: null,
    ...overrides,
  };
}

function createFakeBackend() {
  let progress = zoneRow();
  const history = [];
  const rpcNames = [];
  const supabase = {
    async rpc(name, args) {
      rpcNames.push(name);
      if (name === 'get_campaign_zone_progress') {
        return { data: [{ ...progress }], error: null };
      }
      if (name === 'admin_set_zone_manual_progress') {
        const old = progress.effective_percent;
        progress = {
          ...progress,
          effective_percent: args.p_manual_percent,
          manual_percent: args.p_manual_percent,
          manual_override_enabled: true,
          override_reason: args.p_reason,
        };
        history.unshift(historyRow('manual_override', old, args.p_manual_percent, args.p_reason));
        return { data: { ...progress }, error: null };
      }
      if (name === 'admin_clear_zone_manual_progress') {
        const old = progress.effective_percent;
        progress = {
          ...progress,
          effective_percent: progress.automatic_percent,
          manual_percent: null,
          manual_override_enabled: false,
          override_reason: null,
        };
        history.unshift(historyRow('manual_clear', old, progress.effective_percent, args.p_reason));
        return { data: { ...progress }, error: null };
      }
      return { data: null, error: { code: '42883', message: 'unknown function' } };
    },
    from(table) {
      assert.equal(table, 'campaign_zone_progress_history');
      return historyQuery(history);
    },
  };
  return { supabase, rpcNames };
}

function historyQuery(history) {
  return {
    select() { return this; },
    eq() { return this; },
    order() { return this; },
    async limit() { return { data: history.map((row) => ({ ...row })), error: null }; },
  };
}

function historyRow(eventType, oldValue, newValue, reason) {
  return {
    id: `history-${Math.random()}`,
    campaign_zone_id_snapshot: ZONE_ID,
    campaign_id_snapshot: CAMPAIGN_ID,
    zone_name_snapshot: 'Centro',
    event_type: eventType,
    old_effective_percent: oldValue,
    new_effective_percent: newValue,
    old_manual_percent: null,
    new_manual_percent: eventType === 'manual_override' ? newValue : null,
    reason,
    changed_by: null,
    created_at: '2026-07-25T12:00:00Z',
  };
}

function flushEffects() {
  return new Promise((resolve) => setImmediate(resolve));
}
