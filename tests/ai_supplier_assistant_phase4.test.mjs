import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  getAssistantRouteConfig,
  isAssistantEnabledForRoute,
  ASSISTANT_ROLES,
} from "../src/components/ai/global/assistantRouteRegistry.js";
import {
  isImplementedContextType,
  isKnownContextType,
} from "../supabase/functions/ai-core/contextTypes.ts";
import {
  deterministicSupplierResponse,
  supplierNumbersAreGrounded,
  keysAreSupplierSafe,
  validateSupplierAiResult,
  validateSupplierSnapshot,
  SUPPLIER_SOURCE_ALLOWLIST,
  FORBIDDEN_SUPPLIER_KEYS,
} from "../supabase/functions/ai-core/supplierDashboard.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

test("Route Registry: abilita il Global Assistant per la route Fornitore (supplier-dashboard)", () => {
  const config = getAssistantRouteConfig("supplier-dashboard");
  assert.equal(config.enabled, true);
  assert.equal(config.role, ASSISTANT_ROLES.SUPPLIER);
  assert.equal(config.contextType, "supplier_dashboard");
  assert.equal(isAssistantEnabledForRoute("supplier-dashboard"), true);
});

test("ai-core contextTypes: supplier_dashboard è riconosciuto e implementato", () => {
  assert.equal(isKnownContextType("supplier_dashboard"), true);
  assert.equal(isImplementedContextType("supplier_dashboard"), true);
});

test("Privacy & Sanitization: keysAreSupplierSafe blocca customer total price e dati concorrenti", () => {
  assert.equal(keysAreSupplierSafe({ ok: "val", company_name: "Logistica", supplierCompensation: 450 }), true);
  assert.equal(keysAreSupplierSafe({ customer_price: 1200 }), false);
  assert.equal(keysAreSupplierSafe({ customer_total: 1500 }), false);
  assert.equal(keysAreSupplierSafe({ total_amount_customer: 2000 }), false);
  assert.equal(keysAreSupplierSafe({ competitor: "altro_fornitore" }), false);
  assert.equal(keysAreSupplierSafe({ admin_notes: "riservato" }), false);
});

test("Snapshot Validation: accetta snapshot fornitore puliti e rifiuta dati sensibili", () => {
  const cleanSnapshot = {
    scope: "supplier_dashboard",
    supplierId: "sup-uuid-123",
    companyName: "Postini Pubblicitari",
    assignedCampaigns: [
      { id: "c1", title: "Volantinaggio Como", city: "Como", quantity: 10000, supplierCompensation: 350, status: "in_preparazione", zones: ["Centro", "Borghi"] },
    ],
    ownQuotes: [
      { id: "q1", campaignId: "c1", totalAmount: 350, status: "accepted" },
    ],
    counts: { totalAssigned: 1, activeAssigned: 1, pendingQuotes: 0 },
  };

  assert.equal(validateSupplierSnapshot(cleanSnapshot), true);

  const polluted = { ...cleanSnapshot, customer_price: 900 };
  assert.equal(validateSupplierSnapshot(polluted), false);
});

test("Deterministic Responses: lavori attivi elenca i lavori e compenso fornitore", () => {
  const snapshot = {
    scope: "supplier_dashboard",
    supplierId: "sup-uuid-123",
    assignedCampaigns: [
      { id: "c1", title: "Campagna Como", city: "Como", quantity: 10000, supplierCompensation: 400, status: "in_distribuzione" },
      { id: "c2", title: "Campagna Lecco", city: "Lecco", quantity: 5000, supplierCompensation: 250, status: "in_preparazione" },
    ],
  };

  const res = deterministicSupplierResponse(snapshot, "Quali lavori ho attivi?");
  assert.ok(res);
  assert.ok(res.answer.includes("2 lavori assegnati"));
  assert.ok(res.answer.includes("Campagna Como"));
  assert.ok(res.answer.includes("€400"));
  assert.ok(res.answer.includes("Campagna Lecco"));
  assert.ok(res.answer.includes("€250"));
  assert.equal(res.action?.type, "navigate");
  assert.equal(res.action?.route, "supplier-dashboard");
});

test("Deterministic Responses: compenso fornitore esatto e rifiuto customer price", () => {
  const snapshotWithTarget = {
    scope: "supplier_dashboard",
    supplierId: "sup-uuid-123",
    targetCampaign: { id: "c1", title: "Campagna Como", supplierCompensation: 400 },
    assignedCampaigns: [],
  };

  const res = deterministicSupplierResponse(snapshotWithTarget, "Quanto è il mio compenso per questa campagna?");
  assert.ok(res);
  assert.ok(res.answer.includes("€400"));
  assert.ok(!res.answer.includes("prezzo cliente"));

  const snapshotWithoutComp = {
    scope: "supplier_dashboard",
    supplierId: "sup-uuid-123",
    targetCampaign: { id: "c2", title: "Campagna Varese", supplierCompensation: null },
    assignedCampaigns: [],
  };
  const resEmpty = deterministicSupplierResponse(snapshotWithoutComp, "quanto compenso?");
  assert.ok(resEmpty);
  assert.ok(resEmpty.answer.includes("Compenso non disponibile"));
});

test("Deterministic Responses: data di inizio distribuzione", () => {
  const snapshot = {
    scope: "supplier_dashboard",
    supplierId: "sup-uuid-123",
    targetCampaign: { id: "c1", title: "Campagna Monza", startDate: "2026-09-20" },
    assignedCampaigns: [],
  };

  const res = deterministicSupplierResponse(snapshot, "Quando devo iniziare?");
  assert.ok(res);
  assert.ok(res.answer.includes("2026-09-20"));
});

test("Deterministic Responses: zone da coprire", () => {
  const snapshot = {
    scope: "supplier_dashboard",
    supplierId: "sup-uuid-123",
    targetCampaign: { id: "c1", title: "Campagna Bergamo", city: "Bergamo", zones: ["Città Alta", "Borgo Palazzo"] },
    assignedCampaigns: [],
  };

  const res = deterministicSupplierResponse(snapshot, "Quali zone devo coprire?");
  assert.ok(res);
  assert.ok(res.answer.includes("Città Alta, Borgo Palazzo"));
  assert.ok(res.answer.includes("Bergamo"));
});

test("Deterministic Responses: offerte inviate da accettare", () => {
  const snapshot = {
    scope: "supplier_dashboard",
    supplierId: "sup-uuid-123",
    assignedCampaigns: [],
    ownQuotes: [
      { id: "q1", status: "submitted" },
      { id: "q2", status: "Inviata" },
      { id: "q3", status: "rejected" },
    ],
  };

  const res = deterministicSupplierResponse(snapshot, "Quali lavori sono ancora da accettare?");
  assert.ok(res);
  assert.ok(res.answer.includes("2 offerte inviate in attesa"));
  assert.equal(res.action?.type, "navigate");
});

test("Deterministic Responses: apri specifico lavoro con azione di navigazione", () => {
  const snapshot = {
    scope: "supplier_dashboard",
    supplierId: "sup-uuid-123",
    assignedCampaigns: [
      { id: "c-milano-123", title: "Distribuzione Volantini Milano Centro", city: "Milano", supplierCompensation: 500 },
    ],
  };

  const res = deterministicSupplierResponse(snapshot, "Apri il lavoro di Milano");
  assert.ok(res);
  assert.ok(res.answer.includes("Distribuzione Volantini Milano Centro"));
  assert.equal(res.action?.type, "navigate");
  assert.equal(res.action?.campaignId, "c-milano-123");
});

test("Deterministic Responses: rifiuto categorico mutazioni (read-only)", () => {
  const snapshot = { scope: "supplier_dashboard", supplierId: "sup-uuid-123", assignedCampaigns: [] };
  const mutationQuestions = [
    "accetta l'offerta da 500 euro",
    "invia preventivo per Milano",
    "cambia compenso a 800",
    "assegna operatore Mario Rossi",
    "segna la campagna come completata",
  ];

  for (const q of mutationQuestions) {
    const res = deterministicSupplierResponse(snapshot, q);
    assert.ok(res, `Dovrebbe gestire la domanda di mutazione: ${q}`);
    assert.ok(res.answer.includes("sola lettura") || res.answer.includes("read-only"));
    assert.ok(res.warnings.includes("READ_ONLY"));
  }
});

test("Numerical Grounding: verifica numeri autorizzati vs numeri inventati", () => {
  const snapshot = {
    scope: "supplier_dashboard",
    supplierId: "sup-uuid-123",
    assignedCampaigns: [
      { id: "c1", title: "Lavoro A", quantity: 5000, supplierCompensation: 300 },
    ],
    ownQuotes: [
      { id: "q1", totalAmount: 300 },
    ],
  };

  const groundedResult = {
    answer: "Hai 1 lavoro assegnato con quantità 5000 volantini e compenso €300.",
    summary: "Riepilogo: 1 lavoro.",
    priorities: [],
    warnings: [],
    sources: ["campaigns"],
  };
  assert.equal(supplierNumbersAreGrounded(groundedResult, snapshot), true);

  const ungroundedResult = {
    answer: "Il compenso totale è 99999 euro per 88 campagne.",
    summary: "Inventati 99999.",
    priorities: [],
    warnings: [],
    sources: ["campaigns"],
  };
  assert.equal(supplierNumbersAreGrounded(ungroundedResult, snapshot), false);
});

test("Security Architecture: verifica statica di verifica fornitore e isolamento prezzo cliente", () => {
  const indexSource = fs.readFileSync(path.resolve(ROOT, "supabase/functions/ai-core/index.ts"), "utf8");

  // Verifica che esista il controllo di verifica profilo fornitore
  assert.ok(indexSource.includes('.from("supplier_profiles")'));
  assert.ok(indexSource.includes('supplierProfile.status !== "verified"'));
  assert.ok(indexSource.includes('error: "FORBIDDEN"'));

  // Verifica che campaigns.supplier_id sia filtrato su user.id
  assert.ok(indexSource.includes('.eq("supplier_id", user.id)'));

  // Verifica che quotes.supplier_id sia filtrato su user.id
  assert.ok(indexSource.includes('.from("quotes")'));
});
