import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildStep2TruthModel } from "../src/lib/step2/buildStep2TruthModel.js";
import { getStep2ServiceAvailabilityMessage } from "../src/lib/step2/serviceAvailabilityMessage.js";
import {
  classifyH2HQuantity,
  getBusinessContinuationState,
  getH2HPoiAccounting,
  getH2HQuantityMessage,
} from "../src/lib/step2/nonResidentialPresentation.js";

const app = readFileSync(new URL("../volantinipro-final.jsx", import.meta.url), "utf8");
const report = readFileSync(new URL("../src/pages/TerritorialReport.jsx", import.meta.url), "utf8");

// A — 10.000 inseriti, 2.400 stimati, 7.600 eccedenza: mai "coerente".
const h2hSurplus = classifyH2HQuantity({ inserted: 10_000, requirement: 2_400 });
assert.deepEqual(h2hSurplus, { status: "surplus", inserted: 10_000, requirement: 2_400, shortage: 0, surplus: 7_600 });
const h2hSurplusMessage = getH2HQuantityMessage({ inserted: 10_000, requirement: 2_400 });
assert.match(h2hSurplusMessage.title, /superiore al fabbisogno/i);
assert.match(h2hSurplusMessage.detail, /2\.400/);
assert.match(h2hSurplusMessage.detail, /7\.600/);
assert.doesNotMatch(`${h2hSurplusMessage.title} ${h2hSurplusMessage.detail}`, /coerente/i);
assert.equal(classifyH2HQuantity({ inserted: 2_400, requirement: 2_400 }).status, "coherent");
assert.equal(classifyH2HQuantity({ inserted: 2_399, requirement: 2_400 }).status, "insufficient");

// B — l'aggregato e i record operativi restano distinti e riconciliabili.
assert.deepEqual(getH2HPoiAccounting({ detected: 34, usable: 33 }), {
  detected: 34,
  usable: 33,
  excluded: 1,
  exclusionReason: "Record aggregati senza coordinate o dettaglio sufficiente per il modello operativo.",
});
assert.deepEqual(getH2HPoiAccounting({ detected: 34, usable: 34 }), { detected: 34, usable: 34, excluded: 0, exclusionReason: null });

// C — zona prioritaria e promoter sono campi/colonne semanticamente separati.
assert.match(app, /displayZoneName:[\s\S]*operatorLabel:/);
assert.match(app, /label: "Zona prioritaria"/);
assert.match(app, /label: "Promoter assegnato"/);
assert.match(report, /Assegnazione operativa principale/);

// D/E — gate Business specifico per zona, attività e materiali.
assert.deepEqual(getBusinessContinuationState({ hasValidZone: true, selectedActivities: 0, materialsRequired: 0, materialsMissing: 0 }), {
  canContinue: false,
  reason: "missing_activities",
  label: "Seleziona almeno un’attività per continuare",
});
assert.deepEqual(getBusinessContinuationState({ hasValidZone: true, selectedActivities: 6, materialsRequired: 6, materialsMissing: 0 }), {
  canContinue: true,
  reason: "valid",
  label: "Continua allo Step 3",
});
assert.equal(getBusinessContinuationState({ hasValidZone: true, selectedActivities: 6, materialsRequired: 6, materialsMissing: 2 }).reason, "insufficient_materials");
assert.match(app, /Materiali necessari per le attività selezionate/);
assert.match(app, /businessContinuation\.canContinue && !gisLoading && \(!gisTimedOut \|\| pois\.length > 0\)/);

// F/G — timeout con risultati dichiarato stale; senza risultati nessun dato inventato.
const staleMessage = getStep2ServiceAvailabilityMessage("poi", "OVERPASS_TIMEOUT", { hasUsableData: true });
assert.match(staleMessage, /ultimi risultati disponibili/i);
assert.match(staleMessage, /aggiornamento non è riuscito/i);
const emptyMessage = getStep2ServiceAvailabilityMessage("poi", "OVERPASS_TIMEOUT", { hasUsableData: false });
assert.match(emptyMessage, /non siamo riusciti ad aggiornare/i);
assert.doesNotMatch(emptyMessage, /ultimi risultati disponibili/i);

// H — regressione D2D Saronno: il modello canonico e le formule restano invariati.
const saronno = buildStep2TruthModel({
  service: { key: "d2d", title: "Door to Door" },
  serviceData: { available: true, kpis: { families: 18_240 } },
  insertedQuantity: 10_000,
  currentQuantity: 10_000,
  baseRequirement: 18_240,
  recommendedRequirement: 20_064,
  calculationStatus: "ready",
});
assert.equal(saronno.d2d.kpis.families, 18_240);
assert.equal(saronno.quantity.recommendedRequirement, 20_064);
assert.equal(saronno.quantity.inserted, 10_000);
assert.equal(saronno.coverage.operationalPct, 49.8);
assert.equal(saronno.quantity.shortage, 10_064);

console.log("Step 2 H2H/Business manual-collation consistency: PASS");
