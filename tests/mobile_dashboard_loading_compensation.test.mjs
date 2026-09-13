import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildDriverWhatsAppMessage,
  buildSupplierProgramWhatsAppMessage,
} from '../src/lib/services/admin-api.js';
import {
  campaignSettlement,
  invalidateSettlementCache,
} from '../src/lib/campaignSettlement.js';

describe('Mobile Dashboard Stability, Loading States & Supplier WhatsApp Compensation', () => {

  test('CSS: .vp-campaign-dashboard-grid and shell classes are defined with responsive breakpoints', () => {
    const css = readFileSync('src/styles/app.css', 'utf8');
    assert.match(css, /\.vp-campaign-dashboard-shell\s*\{/);
    assert.match(css, /\.vp-campaign-dashboard-grid\s*\{/);
    assert.match(css, /@media\s*\(max-width:\s*900px\)\s*\{\s*\.vp-campaign-dashboard-grid\s*\{\s*grid-template-columns:\s*1fr/);
    assert.match(css, /@media\s*\(max-width:\s*480px\)\s*\{\s*\.vp-campaign-dashboard-shell\s*\{/);
  });

  test('CampaignDashboardPage in volantinipro-final.jsx uses responsive shell and grid', () => {
    const code = readFileSync('volantinipro-final.jsx', 'utf8');
    assert.match(code, /className="vp-campaign-dashboard-shell"/);
    assert.match(code, /className="vp-campaign-dashboard-grid"/);
    assert.ok(!code.includes('minmax(280px'));
  });

  test('Admin KPI Cards in ClientsQuotes.jsx accept loading prop and do not flash false zero', () => {
    const code = readFileSync('src/pages/admin/ClientsQuotes.jsx', 'utf8');
    assert.match(code, /function KpiCard\(\{\s*label,\s*value,\s*color,\s*onClick,\s*active,\s*loading\s*\}\)/);
    assert.match(code, /loading\s*\?\s*\(\s*<span[^>]*>—<\/span>\s*\)/);
    assert.match(code, /loading=\{state\.loading && state\.rows\.length === 0\}/);
    assert.match(code, /visibleRows\.length === 0 && \(|\{state\.loading && visibleRows\.length === 0/);
  });

  test('getClientsQuotesOverview extracts and exposes supplierCompensation and supplierName', () => {
    const code = readFileSync('src/lib/services/admin-api.js', 'utf8');
    assert.match(code, /supplier_compensation/);
    assert.match(code, /supplierCompensation,/);
    assert.match(code, /supplierName,/);
  });

  test('buildDriverWhatsAppMessage includes agreed compensation when supplierCompensation is provided', () => {
    const msg = buildDriverWhatsAppMessage({
      operatorName: 'Luigi Verdi',
      groupName: 'Squadra B',
      campaignTitle: 'Campagna Test Compenso',
      service: 'd2d',
      comuni: ['Monza'],
      date: '18/10/2026',
      programRows: [{ name: 'Monza Centro', quantity: 3000 }],
      qty: 3000,
      supplierCompensation: 250,
      link: 'https://app.volantinipro.it/driver/assignment/123',
    });

    assert.match(msg, /Compenso concordato: € 250,00/);
    assert.match(msg, /Totale: 3\.?000 volantini\nCompenso concordato: € 250,00/);
  });

  test('buildDriverWhatsAppMessage omits compensation line when supplierCompensation is not passed', () => {
    const msg = buildDriverWhatsAppMessage({
      operatorName: 'Luigi Verdi',
      campaignTitle: 'Campagna Senza Compenso',
      date: '18/10/2026',
      qty: 2000,
      link: 'https://app.volantinipro.it/driver/assignment/124',
    });

    assert.doesNotMatch(msg, /Compenso concordato/);
  });

  test('ClientsQuotes.jsx handleInviaProgramma prioritizes buildSupplierProgramWhatsAppMessage and passes supplierCompensation', () => {
    const code = readFileSync('src/pages/admin/ClientsQuotes.jsx', 'utf8');
    assert.match(code, /buildSupplierProgramWhatsAppMessage/);
    assert.match(code, /supplierCompensation,\s*link/);
  });

  test('AssignWork.jsx prefills and falls back to existing assignment supplier_compensation', () => {
    const code = readFileSync('src/pages/admin/AssignWork.jsx', 'utf8');
    assert.match(code, /existingAssignment\?\.metadata\?\.supplier_compensation/);
  });

  test('campaignSettlement provides in-memory caching and cache invalidation', async () => {
    invalidateSettlementCache();
    const res = await campaignSettlement(null);
    assert.deepEqual(res, { settlement_status: 'not_applicable', amount_due_cents: null });
  });

});
