// Fix 2026-11-22 (collaudo preview-qa, punto 10): Door to Door -> Hand to Hand
// -> Door to Door lasciava il comune selezionato ma famiglie, quantita'
// consigliata e comuni a "Dato non disponibile" (anche in produzione).
// Causa: il ramo H2H/B2B di useServiceAnalysis non aggiornava appliedKeyRef,
// quindi la richiesta D2D veniva saltata come duplicato con in memoria il dato
// H2H. Ora il duplicato richiede dataKey === fetchKey.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const hook = fs.readFileSync(new URL("../src/hooks/useServiceAnalysis.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("duplicato solo se il dato in memoria e' quello della richiesta corrente", () => {
  assert.match(hook, /if \(appliedKeyRef\.current === fetchKey && dataKey === fetchKey && data !== null && error === null\) \{\n\s*debugStep2\("\[ZONE_ANALYSIS_SKIPPED_DUPLICATE\]"/);
  assert.doesNotMatch(hook, /if \(appliedKeyRef\.current === fetchKey && data !== null && error === null\)/);
});

test("il ramo H2H/B2B aggiorna la chiave applicata", () => {
  assert.match(hook, /appliedKeyRef\.current = analysis\.error \? "" : fetchKey;\n\s*setData\(analysis\);/);
});

test("'pending' usa la stessa regola", () => {
  assert.match(hook, /!\(appliedKeyRef\.current === fetchKey && dataKey === fetchKey && data !== null && error === null\)/);
});
