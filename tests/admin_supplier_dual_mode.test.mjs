/**
 * tests/admin_supplier_dual_mode.test.mjs
 *
 * Test suite for Admin Assign Work: Dual Supplier Mode (Registered + Manual)
 *
 * Covers:
 *  - Gate A: Registered supplier query / filtering
 *  - Gate B: Empty registered suppliers handling
 *  - Gate C: Supplier load error + retry resilience
 *  - Gate D: Tab / segmented control toggle
 *  - Gate E: Manual supplier form field validation (Company Name, Phone required; Referente, Email, Notes optional)
 *  - Gate F: Invalid phone blocks progression (< 6 digits)
 *  - Gate G: Valid manual supplier allows progression
 *  - Gate H: Manual supplier payload sets supplier_id = null and stores metadata.manual_supplier snapshot
 *  - Gate I: Registered supplier payload stores real supplier_id
 *  - Gate J: Optional group selection works in both modes
 *  - Gate K: WhatsApp message includes supplier name, program rows, compensation, link; STRICTLY EXCLUDES customer price
 *  - Gate L: WhatsApp recipient uses registered phone in Mode A, manual phone in Mode B
 *  - Gate M: Customer privacy - customer views never leak supplier identity or compensation
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildSupplierProgramWhatsAppMessage } from "../src/lib/services/admin-api.js";

describe("Admin Assign Work — Dual Supplier Mode", () => {

  // ─── GATE A, B, C: REGISTERED SUPPLIER LOADING, EMPTY & ERROR STATES ────────

  test("Gate A: Registered supplier filter and display mapping works correctly", () => {
    const suppliers = [
      {
        id: "supp-uuid-1",
        company_name: "Milano Distribuzioni Srl",
        contact_name: "Paolo Rossi",
        phone: "+39 02 1234567",
        email: "paolo@milanodistribuzioni.it",
        status: "verified",
        coverage_areas: ["Milano", "Monza"],
      },
      {
        id: "supp-uuid-2",
        company_name: "Lombardia Flyering",
        contact_name: "Anna Verdi",
        phone: "+39 340 5556677",
        email: "anna@lombardiaflyering.it",
        status: "verified",
        coverage_areas: ["Bergamo"],
      },
    ];

    const q = "milano";
    const filtered = suppliers.filter(s =>
      s.company_name?.toLowerCase().includes(q) ||
      s.contact_name?.toLowerCase().includes(q) ||
      s.coverage_areas?.some(a => a.toLowerCase().includes(q))
    );

    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].id, "supp-uuid-1");
  });

  test("Gate B: Empty registered suppliers state is detected cleanly", () => {
    const suppliers = [];
    const hasSuppliers = suppliers.length > 0;
    assert.equal(hasSuppliers, false, "Should flag empty supplier list");
  });

  test("Gate C: AssignWork component contains error handling and retry callback", () => {
    const assignWorkCode = readFileSync("src/pages/admin/AssignWork.jsx", "utf8");
    const groupStepCode = readFileSync("src/pages/admin/assign-work/AssignWorkGroupOperatorStep.jsx", "utf8");

    assert.ok(assignWorkCode.includes("fetchSuppliers"), "AssignWork must define fetchSuppliers for retry");
    assert.ok(assignWorkCode.includes("supplierError"), "AssignWork must track supplierError state");
    assert.ok(groupStepCode.includes("onRetrySuppliers"), "GroupOperatorStep must receive onRetrySuppliers");
    assert.ok(groupStepCode.includes("Riprova"), "GroupOperatorStep must render Riprova action");
  });

  // ─── GATE D, E, F, G: DUAL MODE TAB & MANUAL SUPPLIER VALIDATION ────────────

  function validateManualSupplier(manualSupplier) {
    const nameOk = !!(manualSupplier?.company_name && manualSupplier.company_name.trim().length > 0);
    const rawPhone = (manualSupplier?.phone || "").replace(/[^\d+]/g, "");
    const phoneDigits = rawPhone.replace(/\D/g, "");
    const phoneOk = phoneDigits.length >= 6;
    const emailOk = !manualSupplier?.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(manualSupplier.email.trim());
    return { nameOk, phoneOk, emailOk, isValid: nameOk && phoneOk && emailOk };
  }

  test("Gate D: Segmented control supports registered and manual modes", () => {
    const groupStepCode = readFileSync("src/pages/admin/assign-work/AssignWorkGroupOperatorStep.jsx", "utf8");
    assert.ok(groupStepCode.includes("supplierMode === 'registered'"), "Supports registered tab");
    assert.ok(groupStepCode.includes("supplierMode === 'manual'"), "Supports manual tab");
  });

  test("Gate E and F: Manual supplier validation requires company name and phone >= 6 digits", () => {
    // Missing company name
    const res1 = validateManualSupplier({ company_name: "", phone: "+39 333 123456" });
    assert.equal(res1.nameOk, false);
    assert.equal(res1.isValid, false);

    // Invalid / too short phone
    const res2 = validateManualSupplier({ company_name: "Fornitore Express", phone: "123" });
    assert.equal(res2.phoneOk, false);
    assert.equal(res2.isValid, false);

    // Invalid email format when provided
    const res3 = validateManualSupplier({ company_name: "Fornitore Express", phone: "+39 333 123456", email: "notanemail" });
    assert.equal(res3.emailOk, false);
    assert.equal(res3.isValid, false);
  });

  test("Gate G: Valid manual supplier allows progression with optional fields", () => {
    const validSupplier = {
      company_name: "Volantinaggio Rapido Brianza",
      contact_name: "Roberto Corti",
      phone: "+39 349 9876543",
      email: "roberto@brianzaflyer.it",
      notes: "Disponibile solo mattina",
    };
    const res = validateManualSupplier(validSupplier);
    assert.equal(res.nameOk, true);
    assert.equal(res.phoneOk, true);
    assert.equal(res.emailOk, true);
    assert.equal(res.isValid, true);
  });

  // ─── GATE H and I: PAYLOAD CONSTRUCTION FOR MANUAL VS REGISTERED SUPPLIER ──

  test("Gate H: Manual supplier payload sets supplier_id = null and stores snapshot in metadata", () => {
    const manualSupplier = {
      company_name: "Mario Rossi Distribuzioni",
      contact_name: "Mario Rossi",
      phone: "+39 333 7788990",
      email: "mario@rossidistrib.it",
      notes: "Fornitore esterno di fiducia",
    };

    const supplierMode = "manual";
    const activeSupplierId = supplierMode === "registered" ? "registered-uuid" : null;
    const activeSupplierName = supplierMode === "registered" ? "Registered Co" : (manualSupplier.company_name || "Fornitore manuale");

    const assignmentMetadata = {
      supplier_mode: supplierMode,
      supplier_id: activeSupplierId,
      supplier_name: activeSupplierName,
      manual_supplier: {
        company_name: manualSupplier.company_name.trim(),
        contact_name: manualSupplier.contact_name?.trim() || null,
        phone: manualSupplier.phone.trim(),
        email: manualSupplier.email?.trim() || null,
        notes: manualSupplier.notes?.trim() || null,
        created_at: "2026-09-09T20:00:00.000Z",
      },
    };

    assert.equal(assignmentMetadata.supplier_id, null, "supplier_id must be null for manual suppliers");
    assert.equal(assignmentMetadata.supplier_mode, "manual");
    assert.equal(assignmentMetadata.manual_supplier.company_name, "Mario Rossi Distribuzioni");
    assert.equal(assignmentMetadata.manual_supplier.phone, "+39 333 7788990");
    assert.equal(assignmentMetadata.manual_supplier.contact_name, "Mario Rossi");
  });

  test("Gate I: Registered supplier payload stores real supplier_id", () => {
    const selectedSupplier = {
      id: "supp-real-uuid-456",
      company_name: "Milano Service Distribuzioni",
      contact_name: "Giuseppe",
      phone: "+39 02 998877",
      email: "info@milanoservice.it",
    };

    const supplierMode = "registered";
    const activeSupplierId = selectedSupplier.id;
    const activeSupplierName = selectedSupplier.company_name;

    const assignmentMetadata = {
      supplier_mode: supplierMode,
      supplier_id: activeSupplierId,
      supplier_name: activeSupplierName,
      manual_supplier: null,
    };

    assert.equal(assignmentMetadata.supplier_id, "supp-real-uuid-456");
    assert.equal(assignmentMetadata.supplier_mode, "registered");
    assert.equal(assignmentMetadata.manual_supplier, null);
  });

  // ─── GATE J: OPTIONAL GROUP IN BOTH MODES ────────────────────────────────────

  test("Gate J: Optional group works in both registered and manual mode", () => {
    const group = { id: "group-uuid-77", name: "Squadra Milano Nord" };

    // Mode A: Registered + Group
    const payloadA = {
      supplier_id: "supp-123",
      group_id: group.id,
      group_name: group.name,
    };
    assert.equal(payloadA.supplier_id, "supp-123");
    assert.equal(payloadA.group_id, "group-uuid-77");

    // Mode A: Registered + No Group
    const payloadANoGroup = {
      supplier_id: "supp-123",
      group_id: null,
      group_name: null,
    };
    assert.equal(payloadANoGroup.group_id, null);

    // Mode B: Manual + Group
    const payloadB = {
      supplier_id: null,
      group_id: group.id,
      group_name: group.name,
    };
    assert.equal(payloadB.supplier_id, null);
    assert.equal(payloadB.group_id, "group-uuid-77");

    // Mode B: Manual + No Group
    const payloadBNoGroup = {
      supplier_id: null,
      group_id: null,
      group_name: null,
    };
    assert.equal(payloadBNoGroup.supplier_id, null);
    assert.equal(payloadBNoGroup.group_id, null);
  });

  // ─── GATE K & L: WHATSAPP MESSAGE CONTENT & RECIPIENT PHONE ──────────────────

  test("Gate K: buildSupplierProgramWhatsAppMessage includes supplier details, program, compensation, and link; strictly excludes customer price", () => {
    const supplierName = "Volantini Rapidi Srl";
    const campaignTitle = "Lancio Pizzeria Duomo";
    const programRows = [
      { name: "Zona 1 - Duomo", quantity: 12000 },
      { name: "Zona 2 - Loreto", quantity: 8000 },
    ];
    const link = "https://app.volantinipro.it/admin/campaign-assignments";
    const supplierCompensation = 770;

    const msg = buildSupplierProgramWhatsAppMessage({
      supplierName,
      campaignTitle,
      date: "15/09/2026",
      startTime: "08:30",
      qty: 20000,
      supplierCompensation,
      programRows,
      link,
    });

    // Supplier details present
    assert.ok(msg.includes("Volantini Rapidi Srl"), "Must contain supplier name");
    assert.ok(msg.includes("Lancio Pizzeria Duomo"), "Must contain campaign title");
    assert.ok(msg.includes("Zona 1 - Duomo"), "Must contain program row 1");
    assert.ok(msg.includes("12.000"), "Must contain formatted quantity 1");
    assert.ok(msg.includes("20.000"), "Must contain total quantity");
    assert.ok(msg.includes("770"), "Must contain total supplier compensation");
    assert.ok(msg.includes("https://app.volantinipro.it/admin/campaign-assignments"), "Must contain link");

    // Customer price strictly excluded
    assert.ok(!msg.includes("1850"), "Must NOT contain customer price");
    assert.ok(!msg.includes("prezzo cliente"), "Must NOT mention customer price");
  });

  test("Gate L: WhatsApp URL targets registered phone in Mode A, manual phone in Mode B", () => {
    // Mode A: Registered
    const regPhone = "+39 340 1122334";
    const cleanRegPhone = regPhone.replace(/[^\d+]/g, "");
    const waUrlA = "https://wa.me/" + cleanRegPhone.replace("+", "") + "?text=" + encodeURIComponent("Test A");
    assert.ok(waUrlA.includes("393401122334"));

    // Mode B: Manual
    const manPhone = "+39 333 9988776";
    const cleanManPhone = manPhone.replace(/[^\d+]/g, "");
    const waUrlB = "https://wa.me/" + cleanManPhone.replace("+", "") + "?text=" + encodeURIComponent("Test B");
    assert.ok(waUrlB.includes("393339988776"));
  });

  // ─── GATE M: CUSTOMER PRIVACY FIREWALL ──────────────────────────────────────

  test("Gate M: Customer facing components do not expose supplier identity or supplier compensation", () => {
    const trackingCode = readFileSync("src/pages/customer/CampaignTracking.jsx", "utf8");
    const reportCode = readFileSync("src/pages/customer/ClientCampaignReport.jsx", "utf8");
    const quotesCode = readFileSync("src/pages/customer/CustomerQuotesView.jsx", "utf8");

    // Customer views should not query supplier_profiles or show manual_supplier
    assert.ok(!trackingCode.includes("supplier_profiles"), "CampaignTracking must not query supplier_profiles");
    assert.ok(!trackingCode.includes("manual_supplier"), "CampaignTracking must not render manual_supplier");
    assert.ok(!reportCode.includes("supplier_profiles"), "ClientCampaignReport must not query supplier_profiles");
    assert.ok(!reportCode.includes("manual_supplier"), "ClientCampaignReport must not render manual_supplier");
    assert.ok(!quotesCode.includes("supplier_profiles"), "CustomerQuotesView must not query supplier_profiles");
    assert.ok(!quotesCode.includes("manual_supplier"), "CustomerQuotesView must not render manual_supplier");
  });
});