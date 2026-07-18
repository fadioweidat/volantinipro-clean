// Configurazione esplicita dell'ambiente di test
process.env.VITE_SUPABASE_URL = "https://mqkelrsvksrzrpmbstvd.supabase.co";

import React from 'react';
import { createRoot } from 'react-dom/client';
import assert from 'assert';
import { normalizeMunicipalityCodes as normalizeFrontend } from '../src/lib/step2/normalizeMunicipalityCodes.js';
import { normalizeMunicipalityCodes as normalizeServer } from '../supabase/functions/_shared/normalizeMunicipalityCodes.ts';
import { buildServiceAnalysisRequest } from '../src/lib/step2/buildServiceAnalysisRequest.js';
import { useServiceAnalysis } from '../src/hooks/useServiceAnalysis.js';
import { resolveTerritorialRpcPlan, runTerritorialPipeline } from '../supabase/functions/analysis-istat/resolveTerritorialRpcPlan.ts';
import { resolveTerritorialBreakdown } from '../supabase/functions/analysis-istat/territorialResolver.ts';


let passCount = 0;
let failCount = 0;

function runAssert(name, fn) {
  try {
    fn();
    passCount++;
    console.log(`[PASS] ${name}`);
  } catch (err) {
    failCount++;
    console.error(`[FAIL] ${name}:`, err.message);
    throw err;
  }
}

async function runAsyncAssert(name, fn) {
  try {
    await fn();
    passCount++;
    console.log(`[PASS] ${name}`);
  } catch (err) {
    failCount++;
    console.error(`[FAIL] ${name}:`, err.message);
    throw err;
  }
}

console.log("=== SUITE PERMANENTE STEP 2: TERRITORIAL PIPELINE & HOOKS ===");

// -------------------------------------------------------------
// PART 1: CONTRACT TEST DI PARITA' (FRONTEND vs SERVER NORMALIZER)
// -------------------------------------------------------------
console.log("\n--- PART 1: Parity Contract Test (src/lib/step2 vs supabase/functions/_shared) ---");

const testCases = [
  { input: "015086,015032", label: "validi 2 comuni normali" },
  { input: "015146,015086", label: "validi incluso Milano" },
  { input: "00151460", label: "invalido 8 cifre" },
  { input: "ABC015146XYZ", label: "invalido alfanumerico" },
  { input: "015146-test", label: "invalido con trattino" },
  { input: "015146,015146", label: "duplicati identici" },
  { input: "015086, 015146 ", label: "ordine A con spazi" },
  { input: "015146,015086", label: "ordine B inverso" },
  { input: 15146, label: "numero intero 5 cifre (< 6 cifre ISTAT)" },
  { input: "15146", label: "stringa 5 cifre (< 6 cifre ISTAT)" },
  { input: null, label: "input null" },
  { input: undefined, label: "input undefined" },
  { input: ["015032", " 015086 "], label: "array di stringhe" }
];

for (const tc of testCases) {
  runAssert(`Parity Normalizer: ${tc.label}`, () => {
    const fNorm = normalizeFrontend(tc.input);
    const sNorm = normalizeServer(tc.input);
    assert.strictEqual(fNorm.canonical, sNorm.canonical, "canonical non corrisponde");
    assert.strictEqual(fNorm.hasMilano, sNorm.hasMilano, "hasMilano non corrisponde");
    assert.strictEqual(JSON.stringify(fNorm.codes), JSON.stringify(sNorm.codes), "codes non corrisponde");
  });
}


// -------------------------------------------------------------
// PART 2: RERENDER useServiceAnalysis (MUNICIPALITY -> RADIUS)
// -------------------------------------------------------------
console.log("\n--- PART 2: Rerender useServiceAnalysis (municipality -> radius) ---");

await runAsyncAssert("Rerender useServiceAnalysis (municipality -> radius)", async () => {
  class Element {}
  class HTMLElement extends Element {}
  class HTMLIFrameElement extends HTMLElement {}

  class FakeNode extends Element {
    constructor(nodeType, nodeName) {
      super();
      this.nodeType = nodeType;
      this.nodeName = nodeName;
      this.tagName = nodeName;
      this.childNodes = [];
      this.parentNode = null;
      this.style = {};
      this._attributes = new Map();
    }
    appendChild(child) {
      child.parentNode = this;
      this.childNodes.push(child);
      return child;
    }
    removeChild(child) {
      const idx = this.childNodes.indexOf(child);
      if (idx !== -1) {
        child.parentNode = null;
        this.childNodes.splice(idx, 1);
      }
      return child;
    }
    insertBefore(newNode, referenceNode) {
      newNode.parentNode = this;
      if (!referenceNode) {
        this.childNodes.push(newNode);
      } else {
        const idx = this.childNodes.indexOf(referenceNode);
        if (idx !== -1) this.childNodes.splice(idx, 0, newNode);
        else this.childNodes.push(newNode);
      }
      return newNode;
    }
    setAttribute(k, v) { this._attributes.set(k, v); }
    getAttribute(k) { return this._attributes.get(k); }
    removeAttribute(k) { this._attributes.delete(k); }
    addEventListener() {}
    removeEventListener() {}
    dispatchEvent() { return true; }
  }

  const doc = new FakeNode(9, "#document");
  doc.createElement = (tag) => {
    const n = new FakeNode(1, tag.toUpperCase());
    n.ownerDocument = doc;
    return n;
  };
  doc.createTextNode = (text) => new FakeNode(3, "#text");
  doc.createComment = (text) => new FakeNode(8, "#comment");
  doc.createDocumentFragment = () => new FakeNode(11, "#document-fragment");

  global.Element = Element;
  global.HTMLElement = HTMLElement;
  global.HTMLIFrameElement = HTMLIFrameElement;

  const win = {
    ...global,
    Element,
    HTMLElement,
    HTMLIFrameElement,
    document: doc,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true
  };
  doc.defaultView = win;
  global.window = win;
  global.document = doc;

  let fetchedUrls = [];
  global.fetch = async (url, options) => {
    fetchedUrls.push(url);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        values: { famiglie_stimate: 850000 },
        comuni_breakdown: [],
        nil_breakdown: [],
        metadata: { isEstimated: false, municipality: "Milano" },
        sources: ["postgis"]
      })
    };
  };

  const container = doc.createElement("div");

  function HookTesterComponent({ props }) {
    useServiceAnalysis(
      props.lat,
      props.lng,
      props.radius,
      props.service,
      props.municipality,
      props.quantity,
      props.scope,
      props.analysisLevel,
      props.selectionScope,
      props.selectedMunicipalityCodes
    );
    return null;
  }

  const root = createRoot(container);

  // Render 1
  root.render(React.createElement(HookTesterComponent, {
    props: {
      lat: 45.4642,
      lng: 9.1900,
      radius: 15,
      service: "d2d",
      municipality: "Milano",
      quantity: 10000,
      scope: "municipality",
      analysisLevel: "nil",
      selectionScope: "municipality",
      selectedMunicipalityCodes: "015146"
    }
  }));

  await new Promise(r => setTimeout(r, 650));
  assert.strictEqual(fetchedUrls.length, 1);
  assert.ok(fetchedUrls[0].includes("selectionScope=municipality"));
  assert.ok(fetchedUrls[0].includes("selectedMunicipalityCodes=015146"));

  // Render 2 sullo STESSO root
  root.render(React.createElement(HookTesterComponent, {
    props: {
      lat: 45.4642,
      lng: 9.1900,
      radius: 15,
      service: "d2d",
      municipality: "Milano",
      quantity: 10000,
      scope: "municipality",
      analysisLevel: "nil",
      selectionScope: "radius",
      selectedMunicipalityCodes: null
    }
  }));

  await new Promise(r => setTimeout(r, 650));
  assert.strictEqual(fetchedUrls.length, 2);
  assert.ok(fetchedUrls[1].includes("selectionScope=radius"));
  assert.ok(!fetchedUrls[1].includes("selectedMunicipalityCodes="));
});


// -------------------------------------------------------------
// PART 3: runTerritorialPipeline (Cormano piccolo / intersezione Milano)
// -------------------------------------------------------------
console.log("\n--- PART 3: Orchestrazione runTerritorialPipeline ---");

await runAsyncAssert("runTerritorialPipeline: Cormano piccolo", async () => {
  let queryComuniCalls = 0;
  let queryNilsCalls = 0;
  const res = await runTerritorialPipeline({
    params: {
      lat: 45.545,
      lng: 9.171,
      radiusKm: 2,
      service: "d2d",
      selectionScope: "radius"
    },
    queryComuni: async () => {
      queryComuniCalls++;
      return { data: [{ municipality_code: "015086", comune_name: "Cormano", households: 5000 }], error: null };
    },
    queryNils: async () => {
      queryNilsCalls++;
      return { data: [], error: null };
    }
  });
  assert.strictEqual(queryComuniCalls, 1);
  assert.strictEqual(queryNilsCalls, 0);
  assert.strictEqual(res.analysisLevel, "comune");
});

await runAsyncAssert("runTerritorialPipeline: Intersezione Milano", async () => {
  let queryComuniCalls = 0;
  let queryNilsCalls = 0;
  const res = await runTerritorialPipeline({
    params: {
      lat: 45.545,
      lng: 9.171,
      radiusKm: 8,
      service: "d2d",
      selectionScope: "radius"
    },
    queryComuni: async () => {
      queryComuniCalls++;
      return {
        data: [
          { municipality_code: "015086", comune_name: "Cormano", households: 5000 },
          { municipality_code: "015146", comune_name: "Milano", households: 600000 }
        ],
        error: null
      };
    },
    queryNils: async () => {
      queryNilsCalls++;
      return {
        data: [{ nil_code: "9", nil_name: "Bruzzano", households: 12000 }],
        error: null
      };
    }
  });
  assert.strictEqual(queryComuniCalls, 1);
  assert.strictEqual(queryNilsCalls, 1);
  assert.strictEqual(res.analysisLevel, "mixed");
  assert.ok(res.territorialRows.some(r => r.nil_name === "Bruzzano"));
  assert.ok(res.territorialRows.some(r => r.comune_name === "Cormano"));
});


// -------------------------------------------------------------
// PART 4: ASSERT DEL WARNING TERRITORIO VUOTO
// -------------------------------------------------------------
console.log("\n--- PART 4: Assert Warning Territorio Vuoto ---");

runAssert("resolveTerritorialBreakdown: nilRows=[] e comuni=[] -> NO_TERRITORIAL_DATA_IN_RADIUS", () => {
  const warnings = [];
  const res = resolveTerritorialBreakdown({
    rawSelectionScope: "radius",
    requestedAnalysisLevel: null,
    specificMunicipality: "Monza",
    nilRows: [],
    comuni: [],
    warnings
  });
  assert.strictEqual(res.territorialRows.length, 0);
  assert.ok(warnings.includes("NO_TERRITORIAL_DATA_IN_RADIUS"));
});

console.log(`\n======================================================`);
console.log(`RISULTATO TEST SUITE: ${passCount} PASS | ${failCount} FAIL`);
console.log(`======================================================`);

if (failCount > 0) {
  process.exit(1);
}
