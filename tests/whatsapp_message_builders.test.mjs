import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSupplierProgramWhatsAppMessage,
  buildDriverWhatsAppMessage,
  formatServiceLabel,
  formatZonesList,
} from '../src/lib/services/admin-api.js';

import {
  buildCampaignContactWhatsAppText,
  buildCampaignContactWhatsAppUrl,
} from '../src/lib/paymentMode.js';

import {
  buildAdminClientWhatsAppMessage,
  buildWhatsAppUrl,
} from '../src/lib/admin/clientsQuotesView.js';

describe('WhatsApp Message Builders — Supplier Assignment & Customer Payment', () => {

  // =========================================================================
  // 1. SUPPLIER WORK / ASSIGNMENT PROGRAM WHATSAPP
  // =========================================================================
  describe('Supplier Program WhatsApp Builder', () => {
    test('formats full supplier message with service, zones, program rows, compensation, date, and link', () => {
      const msg = buildSupplierProgramWhatsAppMessage({
        supplierName: 'Distribuzione Nord Srl',
        groupName: 'Squadra 1',
        campaignTitle: 'Campagna Promo Primavera',
        service: 'd2d',
        comuni: ['Milano', 'Sesto San Giovanni'],
        date: '15/10/2026',
        startTime: '08:30',
        programRows: [
          { name: 'Milano Centro', quantity: 5000 },
          { name: 'Sesto Rondò', quantity: 3000 },
        ],
        qty: 8000,
        supplierCompensation: 480,
        notes: 'Ritirare i colli al magazzino entro le 08:00',
        link: 'https://app.volantinipro.it/driver/assignment/assign-999',
        mapLink: 'https://maps.google.com/?q=45.4642,9.1900',
      });

      assert.match(msg, /Programma di lavoro — Distribuzione Nord Srl \(Squadra 1\)/);
      assert.match(msg, /Campagna: Campagna Promo Primavera/);
      assert.match(msg, /Servizio: Door to Door/);
      assert.match(msg, /1\. Milano Centro — 5\.?000 volantini/);
      assert.match(msg, /2\. Sesto Rondò — 3\.?000 volantini/);
      assert.match(msg, /Totale: 8\.?000 volantini/);
      assert.match(msg, /Compenso concordato: € 480,00/);
      assert.match(msg, /Data: 15\/10\/2026/);
      assert.match(msg, /Inizio: 08:30/);
      assert.match(msg, /Note: Ritirare i colli al magazzino entro le 08:00/);
      assert.match(msg, /Apri programma:\nhttps:\/\/app\.volantinipro\.it\/driver\/assignment\/assign-999/);
      assert.match(msg, /Apri mappa:\nhttps:\/\/maps\.google\.com\/\?q=45\.4642,9\.1900/);
      assert.match(msg, /Conferma la presa in carico dal programma\./);

      // Verify no leaked customer retail pricing
      assert.doesNotMatch(msg, /prezzo cliente|margine|totale cliente/i);
    });

    test('formats single-zone / fallback without programRows array', () => {
      const msg = buildSupplierProgramWhatsAppMessage({
        supplierName: 'Distribuzione Rapida',
        campaignTitle: 'Volantinaggio Bresso',
        service: 'h2h',
        comuni: [{ name: 'Bresso' }, { name: 'Cusano Milanino' }],
        date: '20/10/2026',
        startTime: '09:00',
        qty: 4000,
        supplierCompensation: 320,
        link: 'https://app.volantinipro.it/driver/assignment/assign-100',
      });

      assert.match(msg, /Programma di lavoro — Distribuzione Rapida/);
      assert.match(msg, /Campagna: Volantinaggio Bresso/);
      assert.match(msg, /Servizio: Hand to Hand/);
      assert.match(msg, /Zona: Bresso, Cusano Milanino/);
      assert.match(msg, /Totale: 4\.?000 volantini/);
      assert.match(msg, /Compenso concordato: € 320,00/);
      assert.match(msg, /Data: 20\/10\/2026/);
      assert.match(msg, /Inizio: 09:00/);
      assert.match(msg, /Apri il link per vedere il lavoro:\nhttps:\/\/app\.volantinipro\.it\/driver\/assignment\/assign-100/);
    });

    test('omits compensation line when compensation is null/undefined', () => {
      const msg = buildSupplierProgramWhatsAppMessage({
        supplierName: 'Fornitore Express',
        campaignTitle: 'Lancio Bar',
        qty: 2000,
        supplierCompensation: null,
        link: 'https://app.volantinipro.it/assignment/1',
      });

      assert.doesNotMatch(msg, /Compenso concordato/);
      assert.doesNotMatch(msg, /undefined|null|NaN|\[object Object\]/);
    });
  });

  // =========================================================================
  // 2. DRIVER WHATSAPP BUILDER
  // =========================================================================
  describe('Driver WhatsApp Builder', () => {
    test('formats driver message with service and clean zone names without [object Object]', () => {
      const msg = buildDriverWhatsAppMessage({
        operatorName: 'Marco Rossi',
        campaignTitle: 'Consegna Volantini Monza',
        service: 'b2b',
        date: '12/10/2026',
        comuni: [{ name: 'Monza' }, { name: 'Villasanta' }],
        zone: ['Centro', 'Stazione'],
        qty: 3500,
        link: 'https://app.volantinipro.it/driver/assignment/assign-77',
      });

      assert.match(msg, /Ciao Marco Rossi,/);
      assert.match(msg, /Campagna: Consegna Volantini Monza/);
      assert.match(msg, /Servizio: Business to Business/);
      assert.match(msg, /Comuni: Monza, Villasanta/);
      assert.match(msg, /Ordine: Centro, Stazione/);
      assert.match(msg, /Quantita: 3\.?500 volantini/);
      assert.match(msg, /Apri il link per vedere il lavoro e avviare il GPS:/);
      assert.doesNotMatch(msg, /\[object Object\]/);
    });
  });

  // =========================================================================
  // 3. CUSTOMER PAYMENT WHATSAPP BUILDER (paymentMode.js)
  // =========================================================================
  describe('Customer Payment WhatsApp Builder (Customer -> VolantiniPro)', () => {
    test('formats rich message from full campaign detail object', () => {
      const campaign = {
        id: 'camp-2026-001',
        service: 'd2d',
        comuni: ['Milano', 'Corsico'],
        flyers_count: 15000,
        starts_at: '2026-11-01',
        total: 750.50,
      };

      const text = buildCampaignContactWhatsAppText(campaign);
      assert.match(text, /Buongiorno, ho confermato la mia campagna VolantiniPro\./);
      assert.match(text, /ID campagna: camp-2026-001/);
      assert.match(text, /Servizio: Door to Door/);
      assert.match(text, /Zona: Milano, Corsico/);
      assert.match(text, /Quantità: 15\.000 volantini/);
      assert.match(text, /Data campagna: 01\/11\/2026/);
      assert.match(text, /Totale da pagare: € 750,50/);
      assert.match(text, /Vorrei ricevere le istruzioni per completare il pagamento tramite bonifico\. Grazie\./);
    });

    test('supports settlement amount due override when settlement is active', () => {
      const campaign = {
        id: 'camp-credit-002',
        service: 'h2h',
        zone: 'Bologna Centro',
        qty: 5000,
        total: 400.00,
        settlement: {
          settlement_status: 'partial_credit_applied',
          original_total_cents: 40000,
          credit_cents: 15000,
          amount_due_cents: 25000,
        },
      };

      const text = buildCampaignContactWhatsAppText(campaign);
      assert.match(text, /ID campagna: camp-credit-002/);
      assert.match(text, /Servizio: Hand to Hand/);
      assert.match(text, /Zona: Bologna Centro/);
      assert.match(text, /Totale da pagare: € 250,00/);
      assert.doesNotMatch(text, /Totale da pagare: € 400,00/);
    });

    test('gracefully handles legacy string campaign ID', () => {
      const text = buildCampaignContactWhatsAppText('camp-legacy-123');
      assert.match(text, /Buongiorno, ho confermato la mia campagna VolantiniPro\./);
      assert.match(text, /ID campagna: camp-legacy-123/);
      assert.match(text, /Vorrei ricevere le istruzioni per completare il pagamento tramite bonifico\. Grazie\./);
    });

    test('gracefully handles null or undefined campaign', () => {
      const text = buildCampaignContactWhatsAppText(null);
      assert.match(text, /Buongiorno, ho confermato la mia campagna VolantiniPro\./);
      assert.match(text, /Vorrei ricevere le istruzioni per completare il pagamento tramite bonifico\. Grazie\./);
      assert.doesNotMatch(text, /ID campagna:/);
    });
  });

  // =========================================================================
  // 4. ADMIN CLIENT WHATSAPP BUILDER (clientsQuotesView.js)
  // =========================================================================
  describe('Admin Client WhatsApp Builder (Admin -> Customer)', () => {
    test('formats admin message for DA_PAGARE state with ID, service, zone, qty, and total', () => {
      const row = {
        id: '4894d988-1234-5678',
        client: 'Mario Bianchi',
        phone: '+39 333 1234567',
        service: 'd2d',
        comuni: ['Monza'],
        qty: 10000,
        total: 550,
        paymentStatus: 'da_pagare',
      };

      const msg = buildAdminClientWhatsAppMessage(row);
      assert.match(msg, /^Buongiorno Mario Bianchi,/);
      assert.match(msg, /ID campagna: 4894d988/);
      assert.match(msg, /Servizio: Door to Door/);
      assert.match(msg, /Zona: Monza/);
      assert.match(msg, /Quantita: 10\.000 volantini/);
      assert.match(msg, /Totale: € 550,00/);
      assert.match(msg, /La campagna risulta in attesa di pagamento\./);

      const url = buildWhatsAppUrl(row.phone, msg);
      assert.match(url, /^https:\/\/wa\.me\/393331234567\?text=/);
    });

    test('formats admin message for PAGATO state', () => {
      const row = {
        id: '99887766-1234',
        client: 'Studio Legale Rossi',
        phone: '02 1234567',
        service: 'direct_mail',
        zone: 'Milano',
        qty: 2500,
        paymentStatus: 'pagato',
      };

      const msg = buildAdminClientWhatsAppMessage(row);
      assert.match(msg, /^Buongiorno Studio Legale Rossi,/);
      assert.match(msg, /abbiamo registrato correttamente il pagamento della campagna 99887766\./);
      assert.match(msg, /Zona: Milano/);
      assert.match(msg, /Quantita: 2\.?500 volantini/);
      assert.match(msg, /Procediamo ora con l'organizzazione operativa\./);
    });

    test('formats admin message with active settlement breakdown', () => {
      const row = {
        id: 'settle-1111',
        client: 'Pizzeria Bella Napoli',
        phone: '3401122334',
        service: 'd2d',
        zone: 'Napoli Centro',
        qty: 8000,
        settlement: {
          settlement_status: 'partial_credit_applied',
          original_total_cents: 60000,
          credit_cents: 20000,
          amount_due_cents: 40000,
        },
      };

      const msg = buildAdminClientWhatsAppMessage(row);
      assert.match(msg, /^Buongiorno Pizzeria Bella Napoli,/);
      assert.match(msg, /ID campagna: settle-1/);
      assert.match(msg, /Totale verificato: € 600,00/);
      assert.match(msg, /Credito Studio: € 200,00/);
      assert.match(msg, /Importo da versare: € 400,00/);
    });
  });

  // =========================================================================
  // 5. HELPER ENUM / SANITIZATION TESTS
  // =========================================================================
  describe('Helper formatting & sanitization', () => {
    test('formatServiceLabel formats all known variants', () => {
      assert.equal(formatServiceLabel('d2d'), 'Door to Door');
      assert.equal(formatServiceLabel('door-to-door'), 'Door to Door');
      assert.equal(formatServiceLabel('h2h'), 'Hand to Hand');
      assert.equal(formatServiceLabel('hand-to-hand'), 'Hand to Hand');
      assert.equal(formatServiceLabel('b2b'), 'Business to Business');
      assert.equal(formatServiceLabel('direct_mail'), 'Direct Mail');
      assert.equal(formatServiceLabel(null), null);
    });

    test('formatZonesList handles strings, string arrays, and object arrays safely', () => {
      assert.equal(formatZonesList('Milano'), 'Milano');
      assert.equal(formatZonesList(['Milano', 'Monza']), 'Milano, Monza');
      assert.equal(formatZonesList([{ name: 'Milano' }, { name: 'Monza' }]), 'Milano, Monza');
      assert.equal(formatZonesList([{ municipality_name: 'Bresso' }]), 'Bresso');
      assert.equal(formatZonesList([]), null);
      assert.equal(formatZonesList(null), null);
    });
  });
});
