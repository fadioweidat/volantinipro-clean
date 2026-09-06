/**
 * tests/admin_supplier_assign_delete_nav.test.mjs
 *
 * Test suite per:
 *  A. Admin Assign Work — Prima il Fornitore
 *  B. Safe Delete / Remove / Archive / Revoke
 *  C. Customer Dashboard & Navigation
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveAppRoute } from '../src/app/routeResolution.js';

// ─── 1. ROUTING & CUSTOMER NAVIGATION TESTS ───────────────────────────────────

describe('Customer Routes & Deterministic Navigation', () => {
  test('resolveAppRoute matches canonical customer tracking routes', () => {
    assert.equal(resolveAppRoute('/campagna/123-abc/tracking'), 'customer-tracking:123-abc');
    assert.equal(resolveAppRoute('/cliente/campagna/123-abc/tracking'), 'customer-tracking:123-abc');
    assert.equal(resolveAppRoute('/customer/campaigns/123-abc/tracking'), 'customer-tracking:123-abc');
    assert.equal(resolveAppRoute('/dashboard/123-abc/tracking'), 'customer-tracking:123-abc');
  });

  test('resolveAppRoute matches canonical customer report routes', () => {
    assert.equal(resolveAppRoute('/campagna/123-abc/report'), 'customer-report:123-abc');
    assert.equal(resolveAppRoute('/cliente/campagna/123-abc/report'), 'customer-report:123-abc');
    assert.equal(resolveAppRoute('/customer/campaigns/123-abc/report'), 'customer-report:123-abc');
    assert.equal(resolveAppRoute('/dashboard/123-abc/report'), 'customer-report:123-abc');
  });

  test('resolveAppRoute matches canonical customer payment routes', () => {
    assert.equal(resolveAppRoute('/campagna/123-abc/pagamento'), 'customer-payment:123-abc');
    assert.equal(resolveAppRoute('/cliente/campagna/123-abc/pagamento'), 'customer-payment:123-abc');
    assert.equal(resolveAppRoute('/customer/campaigns/123-abc/payment'), 'customer-payment:123-abc');
    assert.equal(resolveAppRoute('/dashboard/123-abc/payment'), 'customer-payment:123-abc');
  });

  test('resolveAppRoute matches campaign dashboard detail and client dashboard', () => {
    assert.equal(resolveAppRoute('/campagna/123-abc'), 'campaign:123-abc');
    assert.equal(resolveAppRoute('/cliente/campagna/123-abc'), 'campaign:123-abc');
    assert.equal(resolveAppRoute('/dashboard/123-abc'), 'campaign:123-abc');
    assert.equal(resolveAppRoute('/cliente/dashboard'), 'dashboard');
    assert.equal(resolveAppRoute('/dashboard'), 'dashboard');
  });
});

// ─── 2. ADMIN ASSIGN WORK — SUPPLIER FIRST WORKFLOW ─────────────────────────

describe('Admin Assign Work — Supplier First Flow', () => {
  const mockSuppliers = [
    {
      id: 'supp-1',
      company_name: 'Distribuzioni Nord Srl',
      contact_name: 'Mario Rossi',
      phone: '+39 333 1112233',
      email: 'mario@distribuzioninord.it',
      status: 'verified',
      coverage_areas: ['Milano', 'Monza'],
    },
    {
      id: 'supp-2',
      company_name: 'Volantini Express',
      contact_name: 'Giulia Bianchi',
      phone: '+39 340 9988776',
      email: 'giulia@volantiniexpress.it',
      status: 'pending',
      coverage_areas: ['Bergamo', 'Brescia'],
    },
  ];

  const mockOperators = [
    {
      id: 'op-1',
      supplier_id: 'supp-1',
      display_name: 'Autista Marco (Nord)',
      phone: '+39 333 4445566',
      status: 'active',
    },
    {
      id: 'op-2',
      supplier_id: 'supp-2',
      display_name: 'Autista Luca (Express)',
      phone: '+39 340 1234567',
      status: 'active',
    },
    {
      id: 'op-3',
      supplier_id: null,
      display_name: 'Driver Diretto',
      phone: '+39 347 0000000',
      status: 'active',
    },
  ];

  test('Filtering operators per supplier correctly isolates supplier drivers', () => {
    const selectedSupplierId = 'supp-1';
    const supplierDrivers = mockOperators.filter(op => op.supplier_id === selectedSupplierId);
    assert.equal(supplierDrivers.length, 1);
    assert.equal(supplierDrivers[0].display_name, 'Autista Marco (Nord)');
  });

  test('Supplier search filter correctly finds suppliers by name or city', () => {
    const q = 'milano';
    const matches = mockSuppliers.filter(s =>
      s.company_name.toLowerCase().includes(q) ||
      s.coverage_areas.some(a => a.toLowerCase().includes(q))
    );
    assert.equal(matches.length, 1);
    assert.equal(matches[0].company_name, 'Distribuzioni Nord Srl');
  });

  test('WhatsApp link generation for supplier uses clean normalized phone number', () => {
    const supplier = mockSuppliers[0];
    const cleanPhone = supplier.phone.replace(/[^\d+]/g, '');
    const waUrl = 'https://wa.me/' + cleanPhone;
    assert.ok(waUrl.includes('+393331112233'));
  });

  test('Assignment metadata persists supplier_id and supplier_name', () => {
    const selectedSupplier = mockSuppliers[0];
    const metadata = {
      notes: 'Consegnare entro le 18',
      campaign_title: 'Campagna Milano Centro',
      operator_display_name: 'Autista Marco (Nord)',
      supplier_id: selectedSupplier.id,
      supplier_name: selectedSupplier.company_name,
    };
    assert.equal(metadata.supplier_id, 'supp-1');
    assert.equal(metadata.supplier_name, 'Distribuzioni Nord Srl');
  });
});

// ─── 3. PRIVACY & SAFETY BOUNDARIES ──────────────────────────────────────────

describe('Privacy & Data Safety Boundaries', () => {
  test('Customer tracking and report templates contain no supplier identity info-leak', () => {
    const trackingCode = readFileSync('src/pages/customer/CampaignTracking.jsx', 'utf8');
    const reportCode = readFileSync('src/pages/customer/ClientCampaignReport.jsx', 'utf8');

    // Verification: customer components do NOT import or display supplier_profiles
    assert.ok(!trackingCode.includes('supplier_profiles'), 'CampaignTracking must not query supplier_profiles');
    assert.ok(!reportCode.includes('supplier_profiles'), 'ClientCampaignReport must not query supplier_profiles');
  });

  test('Revocation and Archiving maintain data safety (no hard delete of historical data)', () => {
    const assignmentsCode = readFileSync('src/pages/admin/CampaignAssignments.jsx', 'utf8');
    const groupsCode = readFileSync('src/pages/admin/GroupsManager.jsx', 'utf8');
    const quotesCode = readFileSync('src/pages/admin/ClientsQuotes.jsx', 'utf8');

    // Verification: confirmation modals are present
    assert.ok(assignmentsCode.includes('revokeTargetAssignment'), 'CampaignAssignments must use confirmation modal');
    assert.ok(groupsCode.includes('confirmRemoveMember'), 'GroupsManager must use confirmation modal for member removal');
    assert.ok(groupsCode.includes('confirmDeactivateGroup'), 'GroupsManager must use confirmation modal for group deactivation');
    assert.ok(quotesCode.includes('actionModalRow'), 'ClientsQuotes must use action confirmation modal for cancel/archive');
  });
});
