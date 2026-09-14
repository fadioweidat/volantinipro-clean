import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanPhoneNumber, resolveProgramRecipient, prefillSupplierCompensation, savedSupplierCompensation } from '../src/lib/services/recipientResolver.js';
import { buildSupplierProgramWhatsAppMessage } from '../src/lib/services/admin-api.js';

const hassan = { type: 'operator', id: 'real-contact-fixture', name: 'Hassan', phone: '3511234567' };
test('Italian representations share canonical wa.me digits', () => {
  for (const raw of ['3511234567', '+393511234567', '393511234567', '+39 351 123 4567', '00393511234567']) assert.equal(cleanPhoneNumber(raw), '393511234567');
  for (const raw of ['+44 7700 900123', '+1 (202) 555-0123', '02 1234567']) {
    const phone = cleanPhoneNumber(raw);
    assert.ok(phone); assert.equal(cleanPhoneNumber(phone), phone);
  }
  for (const raw of ['', null, '12345', 'call 3511234567', '+39+3511234567']) assert.equal(cleanPhoneNumber(raw), '');
});
test('only explicit selection resolves; legacy supplier/group/operator never substitute', () => {
  const legacy = { manualSupplier: { phone: hassan.phone }, selectedSupplier: { phone: hassan.phone }, group: { phone: hassan.phone }, operator: { phone: hassan.phone } };
  assert.equal(resolveProgramRecipient(legacy).valid, false);
  assert.equal(resolveProgramRecipient({ ...legacy, explicitProgramRecipient: { ...hassan, phone: 'bad' } }).valid, false);
  assert.equal(resolveProgramRecipient({ ...legacy, explicitProgramRecipient: hassan }).phone, '393511234567');
});
test('saved explicit recipient survives JSON reload and stale supplier/operator data', () => {
  const chosen = resolveProgramRecipient({ explicitProgramRecipient: hassan }).recipient;
  const assignment = JSON.parse(JSON.stringify({ metadata: { explicit_program_recipient: chosen, supplier_compensation: 250, manual_supplier: { phone: '+393277175000' } }, operator_id: 'legacy-admin' }));
  for (const metadata of [assignment.metadata, JSON.stringify(assignment.metadata)]) {
    const resolved = resolveProgramRecipient({ assignment: { ...assignment, metadata } });
    assert.equal(resolved.recipientName, 'Hassan'); assert.equal(resolved.phone, '393511234567');
  }
  assert.equal(resolveProgramRecipient({ assignment, explicitProgramRecipient: null }).valid, false);
});
test('self contact is blocked unless deliberately selected', () => {
  for (const phone of ['3511234567', '+393511234567', '393511234567', '+39 351 123 4567']) {
    assert.equal(resolveProgramRecipient({ operator: { phone }, adminPhone: hassan.phone }).valid, false);
    assert.equal(resolveProgramRecipient({ explicitProgramRecipient: { ...hassan, phone }, adminPhone: hassan.phone }).valid, true);
  }
});
test('accepted supplier quote is the only quote prefill', () => {
  const quotes = [{ supplier_id: 's', quote_status: 'submitted', total_amount: 999 }, { supplier_id: 's', quote_status: 'rejected', total_amount: 888 }];
  assert.equal(prefillSupplierCompensation({ quotes, supplierId: 's', campaign: { total_amount: 5000 } }), null);
  assert.equal(prefillSupplierCompensation({ quotes: [...quotes, { supplier_id: 's', quote_status: 'accepted', total_amount: 250 }], supplierId: 's', campaign: { metadata: { supplier_compensation: 200 } } }), 250);
  assert.equal(prefillSupplierCompensation({ quotes: [{ supplier_id: 'other', quote_status: 'accepted', total_amount: 300 }], supplierId: 's' }), null);
});
test('saved manual amount and explicit empty survive later quote changes', () => {
  for (const amount of [250, 0, null]) {
    const assignment = { metadata: { supplier_compensation: amount } };
    assert.equal(prefillSupplierCompensation({ assignment, quotes: [{ supplier_id: 's', quote_status: 'accepted', total_amount: 999 }] }), amount);
    assert.equal(savedSupplierCompensation(assignment, { metadata: { supplier_compensation: 999 }, total_amount: 9999 }), amount);
  }
});
test('no customer price, invalid amounts or ambiguous accepted offers are selected', () => {
  assert.equal(savedSupplierCompensation(null, { total_amount: 5000 }), null);
  for (const value of [-1, 'bad', Infinity]) assert.equal(savedSupplierCompensation({ metadata: { supplier_compensation: value } }), null);
  assert.equal(prefillSupplierCompensation({ quotes: [{ supplier_id: 'a', quote_status: 'accepted', total_amount: 100 }, { supplier_id: 'b', quote_status: 'accepted', total_amount: 200 }] }), null);
});
test('reloaded supplier message uses the same compensation, never customer total', () => {
  const assignment = { metadata: { explicit_program_recipient: hassan, supplier_compensation: 250 } };
  const resolved = resolveProgramRecipient({ assignment });
  const msg = buildSupplierProgramWhatsAppMessage({ supplierName: resolved.recipientName, supplierCompensation: savedSupplierCompensation(assignment, { total_amount: 9999 }), campaignTitle: 'Test locale', link: 'https://example.test/program' });
  assert.match(msg, /Hassan/); assert.match(msg, /250/); assert.doesNotMatch(msg, /9999/);
  const url = new URL(`https://wa.me/${resolved.phone}?text=${encodeURIComponent(msg)}`);
  assert.equal(url.pathname, '/393511234567'); assert.equal(url.searchParams.get('text'), msg);
});
