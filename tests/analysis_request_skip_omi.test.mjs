// A3 (2026-10-23): homepage hero, calculator and Preventivo Rapido never show OMI values, so their
// analysis-istat request carries omi=0; Step 2 keeps the full request.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildServiceAnalysisRequest } from "../src/lib/step2/buildServiceAnalysisRequest.js";
import { buildHomeCalculatorAnalysisArgs, buildQuickQuoteAnchorAnalysisArgs } from "../src/lib/quote/homeCalculatorAnalysis.js";

process.env.VITE_SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://example.supabase.co";
const base = { lat: 45.6, lng: 9.1, radius: 3, service: "d2d", municipality: "Seveso", selectionScope: "municipality" };

test("includeOmi=false adds omi=0 (d2d only) and changes the fetch identity", () => {
  const full = buildServiceAnalysisRequest(base);
  const lean = buildServiceAnalysisRequest({ ...base, includeOmi: false });
  assert.doesNotMatch(full.url, /omi=0/);
  assert.match(lean.url, /&omi=0$/);
  assert.notEqual(full.fetchKey, lean.fetchKey);
  assert.doesNotMatch(buildServiceAnalysisRequest({ ...base, service: "h2h", includeOmi: false }).url || "", /omi=0/);
});

test("hero, calculator and Preventivo Rapido pass includeOmi=false; useServiceAnalysis forwards it", () => {
  assert.equal(buildHomeCalculatorAnalysisArgs({ name: "Seveso", lat: 45.6, lng: 9.1 }).at(-1), false);
  assert.equal(buildHomeCalculatorAnalysisArgs({ name: "Milano", lat: 45.46, lng: 9.19 }).at(-1), false);
  assert.equal(buildQuickQuoteAnchorAnalysisArgs([{ name: "Seveso", lat: 45.6, lng: 9.1 }], "d2d", 5000).at(-1), false);
  const hero = readFileSync(new URL("../src/components/home/VolantiniProHeroMap.jsx", import.meta.url), "utf8");
  assert.match(hero, /'radius',\s*null,\s*null,\s*false \/\/ the hero never shows OMI values/);
  const hook = readFileSync(new URL("../src/hooks/useServiceAnalysis.js", import.meta.url), "utf8");
  assert.match(hook, /targetSelection = null, includeOmi = true\) \{/);
  assert.match(hook, /selectionScope, selectedMunicipalityCodes, targetSelection, includeOmi\r?\n/);
});
