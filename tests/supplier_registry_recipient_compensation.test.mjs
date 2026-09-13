import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanPhoneNumber,
  resolveProgramRecipient,
} from '../src/lib/services/recipientResolver.js';
import {
  buildSupplierProgramWhatsAppMessage,
  buildDriverWhatsAppMessage,
} from '../src/lib/services/admin-api.js';

describe('Recipient Resolution Engine (resolveProgramRecipient)', () => {
  it('cleans phone numbers correctly and rejects too-short inputs', () => {
    assert.equal(cleanPhoneNumber('+39 366 734 3417'), '+393667343417');
    assert.equal(cleanPhoneNumber('366-734-3417'), '3667343417');
    assert.equal(cleanPhoneNumber('   +39 327 717 5000  '), '+393277175000');
    assert.equal(cleanPhoneNumber('12345'), '');
    assert.equal(cleanPhoneNumber(''), '');
    assert.equal(cleanPhoneNumber(null), '');
  });

  it('prioritizes manual supplier contact phone over operator and group', () => {
    const res = resolveProgramRecipient({
      assignment: {
        id: 'asg-1',
        metadata: {
          supplier_mode: 'manual',
          manual_supplier: {
            name: 'LGT Hassan',
            contact_name: 'Hassan',
            phone: '+39 366 734 3417',
          },
        },
      },
      group: { name: 'Gruppo Nord', phone: '+393331112233' },
      operator: { name: 'Admin', phone: '+393277175000' },
      adminPhone: '+393277175000',
    });

    assert.equal(res.valid, true);
    assert.equal(res.phone, '+393667343417');
    assert.equal(res.recipientType, 'manual_supplier');
    assert.equal(res.recipientName, 'Hassan');
  });

  it('uses registered supplier contact phone when available', () => {
    const res = resolveProgramRecipient({
      assignment: {
        id: 'asg-2',
        metadata: {
          supplier_name: 'Fast Distribution Srl',
        },
      },
      selectedSupplier: {
        company_name: 'Fast Distribution Srl',
        contact_name: 'Marco Rossi',
        phone: '+39 340 987 6543',
      },
      group: { name: 'Gruppo 1' },
      operator: { name: 'Admin', phone: '+393277175000' },
      adminPhone: '+393277175000',
    });

    assert.equal(res.valid, true);
    assert.equal(res.phone, '+393409876543');
    assert.equal(res.recipientType, 'registered_supplier');
    assert.equal(res.recipientName, 'Marco Rossi');
  });

  it('falls back to group phone if no supplier phone exists', () => {
    const res = resolveProgramRecipient({
      assignment: { id: 'asg-3' },
      group: { name: 'Team Alpha', phone: '+39 333 444 5566' },
      operator: { name: 'Admin', phone: '+393277175000' },
      adminPhone: '+393277175000',
    });

    assert.equal(res.valid, true);
    assert.equal(res.phone, '+393334445566');
    assert.equal(res.recipientType, 'group');
    assert.equal(res.recipientName, 'Team Alpha');
  });

  it('STRICT FIREWALL: never falls back to Admin own number (+393277175000)', () => {
    const res = resolveProgramRecipient({
      assignment: { id: 'asg-4' },
      operator: { name: 'Admin User', phone: '+39 327 717 5000' },
      adminPhone: '+393277175000',
    });

    assert.equal(res.valid, false);
    assert.equal(res.phone, null);
    assert.equal(res.recipientType, 'none');
    assert.equal(res.error, 'Numero destinatario non disponibile');
  });

  it('prioritizes explicitProgramRecipient over all other recipients', () => {
    const res = resolveProgramRecipient({
      explicitProgramRecipient: { name: 'Referente Urgente', phone: '+39 333 999 8877' },
      assignment: {
        id: 'asg-explicit',
        metadata: {
          manual_supplier: { name: 'Hassan', phone: '+39 366 734 3417' },
        },
      },
      selectedSupplier: { name: 'Supp', phone: '+39 340 000 1122' },
      operator: { name: 'Driver', phone: '+39 349 112 2334' },
      adminPhone: '+393277175000',
    });

    assert.equal(res.valid, true);
    assert.equal(res.phone, '+393339998877');
    assert.equal(res.recipientType, 'explicit');
    assert.equal(res.recipientName, 'Referente Urgente');
  });

  it('EXPLICIT HASSAN RECIPIENT SURVIVES SAVE/RELOAD even if legacy operator is present', () => {
    // Simulating save: assignment is written to DB with metadata
    const savedAssignment = {
      id: 'asg-hassan-real',
      operator_id: 'a41339f3-d0b1-4a52-95b1-aa964ba85ec5', // legacy admin account id
      group_id: 'grp-1',
      metadata: {
        supplier_mode: 'manual',
        supplier_name: 'lgt',
        supplier_compensation: 450,
        manual_supplier: {
          name: 'lgt',
          contact_name: 'hassan',
          phone: '+39 366 734 3417',
          email: 'infopostini@gmail.com',
        },
      },
    };

    // Simulating full reload from getClientsQuotesOverview
    const reloadedRow = {
      assignment: JSON.parse(JSON.stringify(savedAssignment)),
      group: { id: 'grp-1', name: 'Gruppo Hassan' },
      operator: { id: 'a41339f3-d0b1-4a52-95b1-aa964ba85ec5', name: 'Admin User', phone: '+393277175000' },
      supplierName: 'lgt',
      supplierCompensation: 450,
    };

    const res = resolveProgramRecipient({
      assignment: reloadedRow.assignment,
      manualSupplier: reloadedRow.assignment.metadata?.manual_supplier,
      group: reloadedRow.group,
      operator: reloadedRow.operator,
      adminPhone: '+393277175000',
    });

    assert.equal(res.valid, true);
    assert.equal(res.phone, '+393667343417');
    assert.equal(res.recipientType, 'manual_supplier');
    assert.equal(res.recipientName, 'hassan');
    assert.notEqual(res.phone, '+393277175000');
  });
});

describe('Supplier Program WhatsApp Message Formatting (buildSupplierProgramWhatsAppMessage)', () => {
  it('formats program rows with explicit Compenso concordato line', () => {
    const msg = buildSupplierProgramWhatsAppMessage({
      supplierName: 'Hassan LGT',
      campaignTitle: 'Campagna Volantini Milano Centro',
      service: 'Distribuzione Door-to-Door',
      date: '15/09/2026',
      startTime: '08:30',
      programRows: [
        { name: 'Duomo', quantity: 5000 },
        { name: 'Brera', quantity: 3000 },
      ],
      qty: 8000,
      supplierCompensation: 450,
      link: 'https://www.volantinipro.it/driver/prog-xyz',
    });

    assert.match(msg, /Programma di lavoro — Hassan LGT/);
    assert.match(msg, /Campagna: Campagna Volantini Milano Centro/);
    assert.match(msg, /1\. Duomo — 5[.,]?000 volantini/);
    assert.match(msg, /2\. Brera — 3[.,]?000 volantini/);
    assert.match(msg, /Totale: 8[.,]?000 volantini/);
    assert.match(msg, /Compenso concordato: € 450,00/);
    assert.match(msg, /Data: 15\/09\/2026/);
    assert.match(msg, /Inizio: 08:30/);
    assert.match(msg, /Apri programma:\nhttps:\/\/www\.volantinipro\.it\/driver\/prog-xyz/);
    assert.match(msg, /Conferma la presa in carico dal programma\./);
  });

  it('handles message without compensation gracefully when not specified', () => {
    const msg = buildSupplierProgramWhatsAppMessage({
      supplierName: 'Gruppo Fornitore',
      campaignTitle: 'Campagna Test',
      date: '16/09/2026',
      programRows: [{ name: 'Zona A', quantity: 1000 }],
      qty: 1000,
      supplierCompensation: null,
      link: 'https://www.volantinipro.it/driver/prog-123',
    });

    assert.match(msg, /Totale: 1[.,]?000 volantini/);
    assert.doesNotMatch(msg, /Compenso concordato:/);
  });
});

describe('Supplier Handoff Backend Identity & Transition Safety', () => {
  it('resolves supplier recipient when operator_id is NULL (no fake admin operator)', () => {
    // Exact schema of the corrected Hassan/LGT assignment row in production
    const prodAssignmentRow = {
      id: '4e2e7f9f-848e-4c80-8104-5666062077bf',
      operator_id: null,
      group_id: '0fa886ae-a2c4-4e13-bee0-56365c186646',
      metadata: {
        supplier_mode: 'manual',
        supplier_name: 'lgt',
        supplier_compensation: 333,
        manual_supplier: {
          name: 'lgt',
          contact_name: 'hassan',
          phone: '+39 366 734 3417',
          email: 'infopostini@gmail.com',
          source: 'admin_manual',
        },
      },
    };

    const resolved = resolveProgramRecipient({
      assignment: prodAssignmentRow,
      manualSupplier: prodAssignmentRow.metadata.manual_supplier,
      adminPhone: '+393277175000',
    });

    assert.equal(resolved.valid, true);
    assert.equal(resolved.phone, '+393667343417');
    assert.equal(resolved.recipientType, 'manual_supplier');
    assert.equal(resolved.recipientName, 'hassan');
    assert.notEqual(resolved.phone, '+393277175000');
  });

  it('preserves supplier compensation and recipient info when later transitioned to a real driver', () => {
    const initialHandoff = {
      id: 'asg-trans-1',
      operator_id: null,
      group_id: 'grp-123',
      metadata: {
        supplier_mode: 'manual',
        supplier_name: 'lgt',
        supplier_compensation: 333,
        manual_supplier: {
          name: 'lgt',
          contact_name: 'hassan',
          phone: '+39 366 734 3417',
        },
      },
    };

    // Later driver association (operator_id assigned to a real field driver)
    const realDriverUserId = 'b1111111-2222-3333-4444-555555555555';
    const transitionedAssignment = {
      ...initialHandoff,
      operator_id: realDriverUserId,
      metadata: {
        ...initialHandoff.metadata,
        assigned_driver_at: '2026-09-14T08:00:00Z',
      },
    };

    assert.equal(transitionedAssignment.operator_id, realDriverUserId);
    assert.equal(transitionedAssignment.metadata.supplier_compensation, 333);
    assert.equal(transitionedAssignment.metadata.manual_supplier.phone, '+39 366 734 3417');

    // Supplier recipient remains primary for supplier program communication
    const resolved = resolveProgramRecipient({
      assignment: transitionedAssignment,
      manualSupplier: transitionedAssignment.metadata.manual_supplier,
      operator: { id: realDriverUserId, name: 'Mario Rossi', phone: '+39 349 999 8888' },
      adminPhone: '+393277175000',
    });

    assert.equal(resolved.valid, true);
    assert.equal(resolved.phone, '+393667343417');
    assert.equal(resolved.recipientType, 'manual_supplier');
  });

  it('blocks sending when neither valid recipient nor supplier phone is present without leaking Admin', () => {
    const unassignedWithoutPhone = {
      id: 'asg-no-contact',
      operator_id: null,
      metadata: {
        supplier_mode: 'manual',
        supplier_name: 'Unknown Supplier',
      },
    };

    const resolved = resolveProgramRecipient({
      assignment: unassignedWithoutPhone,
      operator: { id: 'admin-id', name: 'Admin', phone: '+39 327 717 5000' },
      adminPhone: '+393277175000',
    });

    assert.equal(resolved.valid, false);
    assert.equal(resolved.phone, null);
    assert.equal(resolved.error, 'Numero destinatario non disponibile');
  });
});

