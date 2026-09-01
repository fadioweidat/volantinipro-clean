import assert from "node:assert/strict";
import test from "node:test";
import {
  buildExtraServicesRegistry,
  buildExtraServicesById,
  buildOptionalExtras,
  normalizeSelectedExtras,
  CONTROL_PRO_INCLUDED_IDS,
} from "../src/lib/extraServicesRegistry.js";
import { calculateQuotePricing } from "../src/lib/quotePricing.js";

// Sezione extra Step4 ("Servizi inclusi / Aggiungi servizi facoltativi al
// preventivo") — semplificazione in 3 gruppi (Controllo e Report,
// Marketing, Assistenza) e blocco doppio addebito su Controllo PRO.

function setup() {
  const registry = buildExtraServicesRegistry({ flyerQty: 10000, durationDays: 1, campaignDurationKnown: true });
  const byId = buildExtraServicesById(registry);
  return { registry, byId };
}

test("1. Tracking GPS Live selezionato singolarmente: compare da solo, prezzo €60", () => {
  const { byId } = setup();
  const selected = normalizeSelectedExtras({ extraServices: ["tracking_gps"] }, byId);
  assert.deepEqual(selected.map(s => s.id), ["tracking_gps"]);
  assert.equal(selected[0].price, 60);
});

test("2. Foto Proof Base selezionato singolarmente: compare da solo, prezzo €30", () => {
  const { byId } = setup();
  const selected = normalizeSelectedExtras({ extraServices: ["photo_proof"] }, byId);
  assert.deepEqual(selected.map(s => s.id), ["photo_proof"]);
  assert.equal(selected[0].price, 30);
});

test("3. Controllo PRO selezionato singolarmente: compare da solo, prezzo €99", () => {
  const { byId } = setup();
  const selected = normalizeSelectedExtras({ extraServices: ["control_pro"] }, byId);
  assert.deepEqual(selected.map(s => s.id), ["control_pro"]);
  assert.equal(selected[0].price, 99);
});

test("4. Controllo PRO disabilita/nasconde gli extra gia' inclusi nel bundle", () => {
  const { byId } = setup();
  const data = { extraServices: ["control_pro", "tracking_gps", "photo_proof", "photo_report_advanced"] };
  const selected = normalizeSelectedExtras(data, byId);
  const ids = selected.map(s => s.id);
  assert.deepEqual(ids, ["control_pro"]);
  for (const includedId of CONTROL_PRO_INCLUDED_IDS) {
    assert.ok(!ids.includes(includedId), `${includedId} non deve comparire come voce separata quando Controllo PRO e' selezionato`);
  }
});

test("4b. Un extra NON compreso nel bundle (Report Avanzato Copertura, gruppo Marketing) resta acquistabile insieme a Controllo PRO", () => {
  const { byId } = setup();
  const data = { extraServices: ["control_pro", "advanced_report"] };
  const selected = normalizeSelectedExtras(data, byId);
  const ids = selected.map(s => s.id);
  assert.ok(ids.includes("control_pro"));
  assert.ok(ids.includes("advanced_report"), "advanced_report non fa parte del bundle Controllo PRO e deve restare selezionabile a parte");
});

test("5. Nessun doppio conteggio: il totale con Controllo PRO + extra inclusi = totale con solo Controllo PRO", () => {
  const { byId } = setup();
  const sum = list => list.reduce((s, e) => s + e.price, 0);
  const onlyPro = normalizeSelectedExtras({ extraServices: ["control_pro"] }, byId);
  const proPlusIncluded = normalizeSelectedExtras(
    { extraServices: ["control_pro", "tracking_gps", "photo_proof", "photo_report_advanced"] },
    byId
  );
  assert.equal(sum(onlyPro), 99);
  assert.equal(sum(proPlusIncluded), 99);
});

test("6. Rimozione di Controllo PRO riabilita la selezione singola degli extra gia' presenti", () => {
  const { byId } = setup();
  const withPro = { extraServices: ["tracking_gps", "photo_proof", "control_pro"] };
  const selectedWithPro = normalizeSelectedExtras(withPro, byId).map(s => s.id);
  assert.deepEqual(selectedWithPro, ["control_pro"]);

  // Rimozione reale: control_pro tolto dall'array (comportamento di removeOptionalExtra in Step4.jsx)
  const withoutPro = { extraServices: withPro.extraServices.filter(id => id !== "control_pro") };
  const selectedWithoutPro = normalizeSelectedExtras(withoutPro, byId).map(s => s.id).sort();
  assert.deepEqual(selectedWithoutPro, ["photo_proof", "tracking_gps"]);
});

test("7. Supervisione Dedicata mantiene il prezzo per giorno (priceUnit=day, prezzo base 120 invariato)", () => {
  const { byId } = setup();
  const dedicatedSupervision = byId.dedicated_supervision;
  assert.equal(dedicatedSupervision.price, 120);
  assert.equal(dedicatedSupervision.priceUnit, "day");

  const optional = buildOptionalExtras(byId).find(e => e.id === "dedicated_supervision");
  assert.equal(optional.price, 120);
  assert.equal(optional.priceUnit, "day");

  const selected = normalizeSelectedExtras({ extraServices: ["dedicated_supervision"] }, byId);
  assert.equal(selected[0].price, 120);
  assert.equal(selected[0].priceUnit, "day");
});

test("8. Totale preventivo corretto con piu' extra selezionati, nessun doppio conteggio", () => {
  const { byId } = setup();
  const data = { extraServices: ["control_pro", "graphic_design", "account_manager"] };
  const selected = normalizeSelectedExtras(data, byId);
  const distributionExtras = selected.filter(e => e.id !== "printing");
  const pricing = calculateQuotePricing({
    quantity: 10000,
    pricePerThousand: 20,
    smartPairingDiscountPct: 0,
    urgency: "standard",
    planDiscountPct: 0,
    extras: distributionExtras,
  });
  // 99 (control_pro) + 79 (graphic_design) + 80 (account_manager) = 258
  assert.equal(pricing.extraCost, 258);
});

test("Raggruppamento UI: i 9 extra della nuova struttura sono tutti categorizzati in uno dei 3 gruppi richiesti", () => {
  const { byId } = setup();
  const optional = buildOptionalExtras(byId);
  const expectedByCategory = {
    controllo_report: ["control_pro", "tracking_gps", "photo_proof", "photo_report_advanced"],
    // graphic_design rimosso dal selettore: la grafica nuova passa dalla
    // sezione "Grafica" dello Step1 (data.printing.artwork.*).
    marketing: ["video_proof", "qr_analytics", "advanced_report"],
    assistenza: ["account_manager", "dedicated_supervision"],
  };
  for (const [category, ids] of Object.entries(expectedByCategory)) {
    for (const id of ids) {
      const ext = optional.find(e => e.id === id);
      assert.ok(ext, `${id} deve comparire tra gli extra facoltativi`);
      assert.equal(ext.category, category, `${id} deve appartenere al gruppo ${category}`);
    }
  }
  assert.equal(optional.length, 9, "9 extra facoltativi (graphic_design rimosso, gps_plus_report gia' escluso)");
  // gps_plus_report non e' piu' proposto come nuovo extra (doppione del bundle Controllo PRO)
  assert.ok(!optional.some(e => e.id === "gps_plus_report"));
  // graphic_design e design (grafica LEGACY) non sono piu' proposti nel nuovo Step4
  assert.ok(!optional.some(e => e.id === "graphic_design" || e.id === "design"));
});

test("Compatibilita': gps_plus_report resta valido per i preventivi storici gia' salvati", () => {
  const { byId } = setup();
  const selected = normalizeSelectedExtras({ extraServices: ["gps_plus_report"] }, byId);
  assert.deepEqual(selected.map(s => s.id), ["gps_plus_report"]);
  assert.equal(selected[0].price, 90);
});

test("Compatibilita': gli id/slug esistenti degli extra non sono cambiati", () => {
  const { byId } = setup();
  const expectedPrices = {
    tracking_gps: 60,
    photo_proof: 30,
    photo_report_advanced: 50,
    control_pro: 99,
    graphic_design: 79,
    video_proof: 60,
    qr_analytics: 50,
    advanced_report: 40,
    account_manager: 80,
    dedicated_supervision: 120,
  };
  for (const [id, price] of Object.entries(expectedPrices)) {
    assert.ok(byId[id], `id ${id} deve esistere nel registry`);
    assert.equal(byId[id].price, price, `${id} deve mantenere il prezzo €${price}`);
  }
});
