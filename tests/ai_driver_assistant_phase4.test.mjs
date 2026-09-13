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
  deterministicDriverResponse,
  driverNumbersAreGrounded,
  keysAreDriverSafe,
  validateDriverAiResult,
  validateDriverSnapshot,
  DRIVER_SOURCE_ALLOWLIST,
  FORBIDDEN_DRIVER_KEYS,
} from "../supabase/functions/ai-core/driverAssignment.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

test("Route Registry: abilita il Global Assistant per le route Driver (programma e mappa)", () => {
  const assignConfig = getAssistantRouteConfig("driver-assignment:assign-uuid-123");
  assert.equal(assignConfig.enabled, true);
  assert.equal(assignConfig.role, ASSISTANT_ROLES.DRIVER);
  assert.equal(assignConfig.assignmentId, "assign-uuid-123");
  assert.equal(assignConfig.contextType, "driver_assignment");
  assert.equal(isAssistantEnabledForRoute("driver-assignment:assign-uuid-123"), true);

  const mapConfig = getAssistantRouteConfig("driver-map:assign-uuid-123");
  assert.equal(mapConfig.enabled, true);
  assert.equal(mapConfig.role, ASSISTANT_ROLES.DRIVER);
  assert.equal(mapConfig.assignmentId, "assign-uuid-123");
  assert.equal(mapConfig.contextType, "driver_assignment");
  assert.equal(isAssistantEnabledForRoute("driver-map:assign-uuid-123"), true);
});

test("ai-core contextTypes: driver_assignment è riconosciuto e implementato", () => {
  assert.equal(isKnownContextType("driver_assignment"), true);
  assert.equal(isImplementedContextType("driver_assignment"), true);
});

test("Privacy & Sanitization: keysAreDriverSafe blocca token, customer price e raw GPS", () => {
  assert.equal(keysAreDriverSafe({ ok: "val", zone_name: "Centro", quantity: 500 }), true);
  assert.equal(keysAreDriverSafe({ access_token: "secret_token_123" }), false);
  assert.equal(keysAreDriverSafe({ total_amount: 1500 }), false);
  assert.equal(keysAreDriverSafe({ customer_amount: 999 }), false);
  assert.equal(keysAreDriverSafe({ raw_gps: [45.1, 9.2] }), false);
  assert.equal(keysAreDriverSafe({ admin_notes: "internal" }), false);
});

test("Snapshot Validation: accetta snapshot puliti e rifiuta dati sensibili", () => {
  const cleanSnapshot = {
    scope: "driver_assignment",
    assignmentId: "assign-uuid-123",
    campaignTitle: "Distribuzione Monza",
    municipality: "Monza",
    quantityAssigned: 5000,
    status: "active",
    zones: [
      { id: "z1", zone_name: "Centro", quantity: 2500, status: "In corso", priority: 1 },
      { id: "z2", zone_name: "San Biagio", quantity: 2500, status: "Da iniziare", priority: 2 },
    ],
    activeZone: { id: "z1", zone_name: "Centro", quantity: 2500, status: "In corso", priority: 1 },
    isGpsSessionActive: true,
    gpsStatus: "started",
    verifiedDistanceMeters: 2400,
    isInsideZone: null,
  };

  assert.equal(validateDriverSnapshot(cleanSnapshot), true);

  const polluted = { ...cleanSnapshot, access_token: "leaked_token" };
  assert.equal(validateDriverSnapshot(polluted), false);
});

test("Deterministic Responses: zona attiva restituisce la zona e suggerisce azione mappa", () => {
  const snapshot = {
    scope: "driver_assignment",
    assignmentId: "assign-uuid-123",
    quantityAssigned: 5000,
    zones: [
      { id: "z1", zone_name: "Centro", quantity: 2500, status: "In corso", priority: 1 },
      { id: "z2", zone_name: "San Biagio", quantity: 2500, status: "Da iniziare", priority: 2 },
    ],
    activeZone: { id: "z1", zone_name: "Centro", quantity: 2500, status: "In corso", priority: 1 },
  };

  const res = deterministicDriverResponse(snapshot, "Qual è la mia zona?");
  assert.ok(res);
  assert.ok(res.answer.includes("Centro"));
  assert.equal(res.action?.type, "navigate");
  assert.equal(res.action?.route, "driver-map");
  assert.equal(res.action?.targetZoneId, "z1");
});

test("Deterministic Responses: quantitativo volantini esatto e breakdown", () => {
  const snapshot = {
    scope: "driver_assignment",
    assignmentId: "assign-uuid-123",
    quantityAssigned: 5000,
    zones: [
      { id: "z1", zone_name: "Centro", quantity: 2500, status: "In corso" },
      { id: "z2", zone_name: "San Biagio", quantity: 2500, status: "Da iniziare" },
    ],
  };

  const res = deterministicDriverResponse(snapshot, "quanti volantini devo distribuire?");
  assert.ok(res);
  assert.ok(res.answer.includes("5000"));
  assert.ok(res.answer.includes("Centro: 2500"));
});

test("Deterministic Responses: stato GPS attivo vs in pausa vs non attivo", () => {
  const activeSnap = {
    scope: "driver_assignment",
    assignmentId: "assign-uuid-123",
    isGpsSessionActive: true,
    gpsStatus: "started",
    verifiedDistanceMeters: 3500,
    zones: [],
  };
  const activeRes = deterministicDriverResponse(activeSnap, "il gps sta funzionando?");
  assert.ok(activeRes);
  assert.ok(activeRes.answer.includes("GPS è attivo"));
  assert.ok(activeRes.answer.includes("3.5 km"));

  const pausedSnap = {
    scope: "driver_assignment",
    assignmentId: "assign-uuid-123",
    isGpsSessionActive: false,
    gpsStatus: "paused",
    zones: [],
  };
  const pausedRes = deterministicDriverResponse(pausedSnap, "gps ok?");
  assert.ok(pausedRes);
  assert.ok(pausedRes.answer.includes("in pausa"));
});

test("Deterministic Responses: procedura chiusura lavoro e caricamento prova POD", () => {
  const snapshot = {
    scope: "driver_assignment",
    assignmentId: "assign-uuid-123",
    zones: [
      { id: "z1", zone_name: "Centro", status: "Completata" },
      { id: "z2", zone_name: "San Biagio", status: "In corso" },
    ],
  };

  const res = deterministicDriverResponse(snapshot, "cosa devo fare per chiudere il lavoro?");
  assert.ok(res);
  assert.ok(res.answer.includes("POD"));
  assert.ok(res.answer.includes("Termina Turno"));
  assert.equal(res.action?.type, "navigate");
  assert.equal(res.action?.route, "driver-pod");
});

test("Deterministic Responses: zone residue", () => {
  const snapshot = {
    scope: "driver_assignment",
    assignmentId: "assign-uuid-123",
    zones: [
      { id: "z1", zone_name: "Zona A", status: "Completata" },
      { id: "z2", zone_name: "Zona B", status: "Da iniziare" },
      { id: "z3", zone_name: "Zona C", status: "Da iniziare" },
    ],
  };

  const res = deterministicDriverResponse(snapshot, "quante zone mi restano?");
  assert.ok(res);
  assert.ok(res.answer.includes("2 zone"));
  assert.ok(res.answer.includes("Zona B"));
  assert.ok(res.answer.includes("Zona C"));
});

test("Deterministic Responses: rifiuto categorico mutazioni (read-only)", () => {
  const snapshot = { scope: "driver_assignment", assignmentId: "assign-uuid-123", zones: [] };
  const mutationQuestions = [
    "avvia il gps per favore",
    "stop gps adesso",
    "termina il lavoro e chiudi",
    "carica la foto di prova",
    "modifica la quantita a 10000",
  ];

  for (const q of mutationQuestions) {
    const res = deterministicDriverResponse(snapshot, q);
    assert.ok(res, `Dovrebbe gestire la domanda di mutazione: ${q}`);
    assert.ok(res.answer.includes("sola lettura") || res.answer.includes("read-only"));
    assert.ok(res.warnings.includes("READ_ONLY"));
  }
});

test("Numerical Grounding: verifica numeri autorizzati vs numeri inventati", () => {
  const snapshot = {
    scope: "driver_assignment",
    assignmentId: "assign-uuid-123",
    quantityAssigned: 3000,
    verifiedDistanceMeters: 2500,
    zones: [
      { id: "z1", zone_name: "Centro", quantity: 3000, priority: 1, status: "In corso" },
    ],
  };

  const groundedResult = {
    answer: "Devi distribuire 3000 volantini. Hai percorso 2.5 km.",
    summary: "Riepilogo: 3000 volantini.",
    priorities: [],
    warnings: [],
    sources: ["operator_assignments"],
  };
  assert.equal(driverNumbersAreGrounded(groundedResult, snapshot), true);

  const ungroundedResult = {
    answer: "Ci sono 99999 volantini e 88 zone.",
    summary: "Inventati 99999.",
    priorities: [],
    warnings: [],
    sources: ["operator_assignments"],
  };
  assert.equal(driverNumbersAreGrounded(ungroundedResult, snapshot), false);
});

test("Security Architecture: verifica statica di isolamento del token in index.ts", () => {
  const indexSource = fs.readFileSync(path.resolve(ROOT, "supabase/functions/ai-core/index.ts"), "utf8");

  // Verifica che esista il controllo incrociato su operator_assignments con id AND access_token
  assert.ok(indexSource.includes('.eq("id", assignmentId)'));
  assert.ok(indexSource.includes('.eq("access_token", accessToken)'));
  assert.ok(indexSource.includes('error: "FORBIDDEN"'));

  // Verifica che il token non sia mai inserito nello snapshot
  assert.ok(!indexSource.includes('accessToken: assignment.access_token'));
  assert.ok(!indexSource.includes('accessToken: accessToken'));
});
