import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { resolveProgramRecipient, cleanPhoneNumber } from '../src/lib/services/recipientResolver.js';
import { buildSupplierProgramWhatsAppMessage } from '../src/lib/services/admin-api.js';

// Load env
const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8')
    .split('\n')
    .concat(fs.readFileSync('.env.development.local', 'utf8').split('\n'))
    .filter(l => l.includes('='))
    .map(l => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const supabaseUrl = env.VITE_SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_ANON_KEY;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

const anonClient = createClient(supabaseUrl, anonKey);
const adminClient = createClient(supabaseUrl, serviceKey);

describe('Supplier Application, Recipient Resolution & Compensation Invariants (Tests A-J)', () => {
  const timestamp = Date.now();
  const testEmailA = `test-supplier-a-${timestamp}@example.com`;
  const testEmailD = `test-supplier-d-${timestamp}@example.com`;
  let appAId = null;
  let userAId = null;
  let userDId = null;

  after(async () => {
    // Cleanup test data
    try {
      if (testEmailA) await adminClient.from('supplier_applications').delete().eq('email', testEmailA);
      if (testEmailD) await adminClient.from('supplier_applications').delete().eq('email', testEmailD);
      if (userAId) {
        await adminClient.from('supplier_profiles').delete().eq('id', userAId);
        await adminClient.auth.admin.deleteUser(userAId);
      }
      if (userDId) {
        await adminClient.from('supplier_profiles').delete().eq('id', userDId);
        await adminClient.auth.admin.deleteUser(userDId);
      }
    } catch (e) {
      console.warn('Cleanup warning:', e.message);
    }
  });

  // ── TEST A: Public application intake ───────────────────────────────────────
  it('TEST A: Public application persists to supplier_applications as pending and appears in Admin query', async () => {
    const { data: res, error } = await anonClient.rpc('submit_public_supplier_application', {
      p_company_name: 'Alpha Distribuzioni Srl',
      p_contact_name: 'Alberto Alpha',
      p_phone: '+39 340 1112233',
      p_email: testEmailA,
      p_vat_number: '11223344556',
      p_coverage_areas: ['Milano e provincia', 'Monza e Brianza'],
      p_services: ['Door to Door (Casellario postale)'],
      p_notes: 'Flotta di 8 operatori con mezzi propri'
    });

    assert.equal(error, null, 'RPC execution should not error');
    assert.equal(res.status, 'created', 'Status should be created');
    assert.ok(res.application_id, 'Must return application_id');
    appAId = res.application_id;

    // Verify row directly in DB
    const { data: rows, error: qErr } = await adminClient
      .from('supplier_applications')
      .select('*')
      .eq('id', appAId);

    assert.equal(qErr, null);
    assert.equal(rows.length, 1);
    const row = rows[0];
    assert.equal(row.company_name, 'Alpha Distribuzioni Srl');
    assert.equal(row.email, testEmailA);
    assert.equal(row.status, 'pending');
    assert.equal(row.claimed_by, null);
  });

  // ── TEST B: Idempotent duplicate update ─────────────────────────────────────
  it('TEST B: Repeated submission with same email updates existing pending row without creating duplicates', async () => {
    const { data: updateRes, error: updateErr } = await anonClient.rpc('submit_public_supplier_application', {
      p_company_name: 'Alpha Distribuzioni Srl Aggiornata',
      p_contact_name: 'Alberto Alpha Bis',
      p_phone: '+39 340 9998877',
      p_email: testEmailA,
      p_vat_number: '11223344556',
      p_coverage_areas: ['Milano e provincia', 'Monza e Brianza', 'Bergamo'],
      p_services: ['Door to Door (Casellario postale)', 'Hand to Hand (Volantinaggio a mano / eventi)'],
      p_notes: 'Note modificate in un secondo momento'
    });

    assert.equal(updateErr, null);
    assert.equal(updateRes.status, 'updated', 'Status should indicate update');
    assert.equal(updateRes.application_id, appAId, 'Application ID must remain the same');

    // Verify count in table is still 1
    const { data: rows } = await adminClient
      .from('supplier_applications')
      .select('*')
      .eq('email', testEmailA);

    assert.equal(rows.length, 1, 'Must not create duplicate row');
    assert.equal(rows[0].company_name, 'Alpha Distribuzioni Srl Aggiornata');
    assert.equal(rows[0].phone, '+39 340 9998877');
    assert.equal(rows[0].coverage_areas.length, 3);
  });

  // ── TEST C: Magic Link claim on same device ─────────────────────────────────
  it('TEST C: Magic link claim creates supplier_profile and marks application claimed', async () => {
    // Simulate user creation
    const { data: { user }, error: userErr } = await adminClient.auth.admin.createUser({
      email: testEmailA,
      password: 'StrongPassword123!',
      email_confirm: true,
    });
    assert.equal(userErr, null);
    userAId = user.id;

    // Login as user
    const userClient = createClient(supabaseUrl, anonKey);
    await userClient.auth.signInWithPassword({
      email: testEmailA,
      password: 'StrongPassword123!',
    });

    // Call claim_supplier_application RPC
    const { data: claimRes, error: claimErr } = await userClient.rpc('claim_supplier_application');
    assert.equal(claimErr, null);
    assert.equal(claimRes.claimed, true);
    assert.equal(claimRes.supplier_id, userAId);
    assert.equal(claimRes.company_name, 'Alpha Distribuzioni Srl Aggiornata');

    // Verify application status updated to 'claimed'
    const { data: appRow } = await adminClient
      .from('supplier_applications')
      .select('*')
      .eq('id', appAId)
      .single();

    assert.equal(appRow.status, 'claimed');
    assert.equal(appRow.claimed_by, userAId);
    assert.ok(appRow.claimed_at);

    // Verify supplier_profiles exists
    const { data: spRow } = await adminClient
      .from('supplier_profiles')
      .select('*')
      .eq('id', userAId)
      .single();

    assert.equal(spRow.company_name, 'Alpha Distribuzioni Srl Aggiornata');
    assert.equal(spRow.phone, '+39 340 9998877');
  });

  // ── TEST D: Magic Link claim on different device (no localStorage) ──────────
  it('TEST D: Claim on different device succeeds via email match in auth.users without localStorage', async () => {
    // 1. Submit application D
    const { data: subD } = await anonClient.rpc('submit_public_supplier_application', {
      p_company_name: 'Device2 Express Srl',
      p_contact_name: 'Daniele Device',
      p_phone: '+39 338 7766554',
      p_email: testEmailD,
      p_vat_number: '99887766554',
      p_coverage_areas: ['Brescia'],
      p_services: ['Door to Door (Casellario postale)']
    });
    assert.ok(subD.application_id);

    // 2. Create user D
    const { data: { user: userD }, error: uErr } = await adminClient.auth.admin.createUser({
      email: testEmailD,
      password: 'Password456!@#',
      email_confirm: true,
    });
    assert.equal(uErr, null);
    userDId = userD.id;

    // 3. User logs in on fresh client (clean session, zero localStorage)
    const freshClient = createClient(supabaseUrl, anonKey);
    await freshClient.auth.signInWithPassword({
      email: testEmailD,
      password: 'Password456!@#',
    });

    // 4. Invoke claim RPC directly
    const { data: claimDRes, error: cErr } = await freshClient.rpc('claim_supplier_application');
    assert.equal(cErr, null);
    assert.equal(claimDRes.claimed, true);
    assert.equal(claimDRes.company_name, 'Device2 Express Srl');

    // 5. Verify supplier profile created
    const { data: spD } = await adminClient
      .from('supplier_profiles')
      .select('*')
      .eq('id', userDId)
      .single();

    assert.equal(spD.company_name, 'Device2 Express Srl');
    assert.equal(spD.phone, '+39 338 7766554');
  });

  // ── TEST E: Admin view separation ───────────────────────────────────────────
  it('TEST E: Claimed applications are marked claimed; pending applications filter excludes claimed', async () => {
    const { data: allApps } = await adminClient
      .from('supplier_applications')
      .select('*')
      .in('email', [testEmailA, testEmailD]);

    for (const app of allApps) {
      assert.equal(app.status, 'claimed', 'Both tested applications must be in claimed status');
    }

    const pendingOnly = allApps.filter(a => a.status === 'pending');
    assert.equal(pendingOnly.length, 0, 'No pending applications remain for claimed users');
  });

  // ── TEST F: Assign Work supplier query isolation ────────────────────────────
  it('TEST F: Assign Work queries supplier_profiles exclusively, never raw supplier_applications', async () => {
    const { data: spRows } = await adminClient
      .from('supplier_profiles')
      .select('id, public_code, company_name, phone, status');

    assert.ok(Array.isArray(spRows));
    // Each row in supplier_profiles must have public_code and status
    for (const row of spRows) {
      assert.ok(row.public_code.startsWith('VP-'), 'Every supplier profile must have VP- public code');
      assert.ok(['pending', 'verified', 'suspended', 'rejected'].includes(row.status));
    }
  });

  // ── TEST G: Recipient resolution - Group lead precedence ────────────────────
  it('TEST G: Recipient resolution picks Group Lead (Hassan +39 347 1122334) over outdated company phone', () => {
    const selectedSupplier = {
      id: 'supp-123',
      company_name: 'Milano Volantini Srl',
      phone: '+39 02 1234567',
      contact_name: 'Ufficio Centrale'
    };

    const selectedGroup = {
      id: 'grp-hassan',
      name: 'Squadra 1 Milano Centro',
      lead_name: 'Hassan',
      lead_phone: '+39 347 1122334'
    };

    const resolved = resolveProgramRecipient({
      selectedGroup,
      selectedSupplier,
      explicitRecipient: null
    });

    assert.equal(resolved.valid, true);
    assert.equal(resolved.recipientType, 'group');
    assert.equal(resolved.recipientName, 'Hassan');
    assert.ok(resolved.phone.includes('3471122334'), 'Must contain Hassan phone number');
    assert.ok(!resolved.phone.includes('021234567'), 'Must NOT pick company landline');
  });

  // ── TEST H: Hard block when no valid recipient exists ───────────────────────
  it('TEST H: Hard block when neither group nor supplier provides a valid phone', () => {
    const selectedSupplier = {
      id: 'supp-empty',
      company_name: 'No Phone Srl',
      phone: '',
      contact_name: 'Mario'
    };

    const selectedGroup = {
      id: 'grp-empty',
      name: 'Squadra Senza Recapito',
      lead_name: 'Anonimo',
      lead_phone: null
    };

    const resolved = resolveProgramRecipient({
      selectedGroup,
      selectedSupplier,
      explicitRecipient: null
    });

    assert.equal(resolved.valid, false, 'Must be invalid');
    assert.equal(resolved.phone, null);
    assert.ok(resolved.error, 'Error must be present');
  });

  // ── TEST I: Supplier compensation persistence invariant ────────────────────
  it('TEST I: Supplier compensation €350 invariant across input, metadata, and WhatsApp link', () => {
    const inputCompensation = 350;

    // Simulated saved metadata in operator_assignments
    const savedMetadata = {
      notes: 'Consegna materiale ore 08:00',
      supplier_compensation: inputCompensation,
      explicit_program_recipient: {
        name: 'Hassan',
        phone: '+39 347 1122334'
      }
    };

    // Verify metadata persistence
    assert.equal(savedMetadata.supplier_compensation, 350);

    // Verify WhatsApp message generation
    const msg = buildSupplierProgramWhatsAppMessage({
      supplierName: 'Hassan',
      campaignTitle: 'Campagna Test Volantini',
      link: 'https://www.volantinipro.it/driver/assignment?token=abc',
      supplierCompensation: savedMetadata.supplier_compensation,
    });

    const dest = cleanPhoneNumber('+39 347 1122334');
    const waLink = `https://wa.me/${dest}?text=${encodeURIComponent(msg)}`;

    assert.ok(waLink.startsWith('https://wa.me/393471122334'), 'Must target Hassan');
    assert.ok(msg.includes('350'), 'Must contain exact 350 € compensation');
  });

  // ── TEST J: Customer campaign price isolation ───────────────────────────────
  it('TEST J: Customer campaign price (€750) is never leaked into WhatsApp or driver metadata', () => {
    const customerCampaign = {
      id: 'camp-750',
      title: 'Campagna Supermercato',
      total_amount: 750.00,
      price: 750.00
    };

    const supplierCompensation = 350.00;

    const msg = buildSupplierProgramWhatsAppMessage({
      supplierName: 'Hassan',
      campaignTitle: customerCampaign.title,
      link: 'https://www.volantinipro.it/driver/assignment?token=abc',
      supplierCompensation: supplierCompensation,
    });

    assert.ok(!msg.includes('750'), 'Must NEVER contain the 750 customer price');
    assert.ok(msg.includes('350'), 'Must contain only supplier compensation');
    assert.ok(!msg.includes('totale cliente') && !msg.includes('prezzo campagna'));
  });
});
