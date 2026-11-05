// QA PR #26 (2026-11-05): conteggi territoriali, layout PDF, prezzo medio,
// stato del preventivo e salvataggio senza duplicati.
// Caso di riferimento: Door to Door, via Antonio Oroboni (Milano), 3 km:
// 89.422 famiglie, 98.046 volantini, €2.797,24, 12 NIL + 7 comuni.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { webcrypto } from "node:crypto";
import { countTerritories, describeTerritoryCounts, territoryTypeLabel } from "../src/lib/step2/territoryCounts.js";
import { getCampaignMunicipalityNames } from "../src/lib/step2/campaignZonesModel.js";
import { generateQuotePdfBytes } from "../src/lib/pdf/generateQuotePdf.js";
import { textWidth, wrapToWidth } from "../src/lib/pdf/pdfTextMetrics.js";
import { averageUnitPrice, resolveQuoteStatus, QUOTE_STATUS } from "../src/lib/quoteStatus.js";

const read = rel => fs.readFileSync(new URL(rel, import.meta.url), "utf8");
const step4 = read("../src/pages/public/configurator/Step4.jsx");
const actions = read("../src/pages/public/configurator/step4/Step4CampaignActionsPanel.jsx");
const planning = read("../src/pages/public/configurator/step4/Step4PlanningPanel.jsx");

// Righe reali dello Step 2 (nomi e volantini dal PDF del 2026-11-05).
const NILS = ["BRUZZANO", "COMASINA", "BOVISASCA", "AFFORI", "PARCO NORD", "NIGUARDA - CA' GRANDA - PRATO CENTENARO - Q.RE FULVIO TESTI", "QUARTO OGGIARO - VIALBA - MUSOCCO", "BOVISA", "DERGANO", "ROSERIO", "VILLAPIZZONE - CAGNOLA - BOLDINASCO", "MACIACHINI - MAGGIOLINA"];
const COMUNI = ["Cormano", "Novate Milanese", "Bresso", "Cusano Milanino", "Paderno Dugnano", "Bollate", "Cinisello Balsamo"];
const ROWS = [
  ...NILS.map((name, i) => ({ id: `nil_${i}`, name, isNil: true, nilCode: String(70 + i), territory_type: "nil", municipality_code: "015146" })),
  ...COMUNI.map((name, i) => ({ id: `api_${i}`, name, isNil: false, nilCode: null, territory_type: "radius" })),
];

// ------------------------------------------------------------ 1. conteggi
test("conteggi: 8 comuni coinvolti, 12 NIL di Milano, 19 territori (unità distinte)", () => {
  const c = countTerritories(ROWS);
  assert.equal(c.municipalityCount, 8);
  assert.equal(c.nilCount, 12);
  assert.equal(c.otherMunicipalityCount, 7);
  assert.equal(c.territoryCount, 19);
  assert.deepEqual(c.municipalityNames, ["Milano", ...COMUNI]);
  assert.equal(c.summary, "8 comuni: Milano (12 NIL) + 7 comuni");
  assert.equal(territoryTypeLabel(ROWS[0]), "NIL Milano");
  assert.equal(territoryTypeLabel(ROWS[12]), "Comune");
  assert.equal(describeTerritoryCounts({ municipalityCount: 2, nilCount: 0, otherMunicipalityCount: 2 }), "2 comuni");
});

test("conteggi: stessa definizione di Step 2 (NIL raccolti in Milano + ogni comune)", () => {
  const step2 = read("../src/pages/public/configurator/Step2.jsx");
  assert.match(step2, /const id = isMilanoNil \? "milano-nil-total" : zone\.id;/);
  // multi-PV a raggio: i NIL valgono Milano a qualunque livello di analisi
  const pv = { searchMode: "address", selectedComuni: [{ name: "Milano" }], kpiSnapshot: { analysisLevel: "nil" }, allocation: ROWS };
  assert.deepEqual(getCampaignMunicipalityNames([pv]), ["Milano", ...COMUNI]);
});

test("Step 4: comuni coinvolti dalle righe territoriali, non da selectedComuni (era 1)", () => {
  assert.match(step4, /: !isMunicipalityMode && data\.areaMode !== "cap" && zoneAllocs\.length > 0 \? countTerritories\(zoneAllocs\) : null;/);
  assert.match(step4, /const summaryMunicipalityNames = territoryCounts \? territoryCounts\.municipalityNames : selectedZoneNames;/);
  assert.match(step4, /l: "NIL di Milano nel raggio",/);
  assert.match(step4, /l: "Territori nel raggio \(NIL \+ comuni\)",/);
  assert.match(step4, /type: territoryTypeLabel\(row\.alloc \|\| row\),/);
});

// ------------------------------------------------------------ 2. layout PDF
const eur4 = n => `€${n.toLocaleString("it-IT", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
function referencePdf(statusInput = {}) {
  const c = countTerritories(ROWS);
  const s = resolveQuoteStatus(statusInput);
  const avg = averageUnitPrice(2797.24, 98046);
  return Buffer.from(generateQuotePdfBytes({
    quoteId: "VP-05112026", status: s.label, statusKey: s.key, statusDisclaimer: s.disclaimer, service: "Door to Door",
    campaign: { service: "Door to Door", quantity: 98046, format: "A5" },
    area: { mainArea: "Milano", areaMode: "radius", radiusKm: 3, selectedMunicipalities: c.municipalityNames, territoryCounts: { municipalityCount: c.municipalityCount, nilCount: c.nilCount, territoryCount: c.territoryCount, summary: c.summary } },
    outputs: { estimatedFamilies: 89422, estimatedCoverage: 100, recommendedFlyers: 98046, insertedFlyers: 98046 },
    municipalities: ROWS.map(r => ({ name: r.name, type: territoryTypeLabel(r), status: "Selezionato – copertura completa", estimatedFlyers: 5000, coveragePct: 100, contributionPct: 5 })),
    scores: [{ label: "Qualità area", value: 100, description: "Qualità residenziale della zona: densità abitativa e presenza di famiglie." }],
    adminInfo: [{ label: "Comuni coinvolti", value: "8" }, { label: "NIL di Milano nel raggio", value: "12" }, { label: "Territori nel raggio (NIL + comuni)", value: "19" }],
    pricing: { lines: [{ label: "Distribuzione Door to Door", quantity: 98046, unitPrice: avg, unitPriceLabel: `${eur4(avg)} medio`, total: 2797.24 }], notes: [`Prezzo unitario medio: ${eur4(avg)} = totale distribuzione €2.797,24 / 98.046 volantini.`], subtotal: 2797.24, total: 2797.24, grandTotal: 2797.24, extras: [], discounts: [] },
  })).toString("latin1");
}
// Testi del PDF con posizione: "BT /F1 8.5 Tf ... rg X Y Td (testo) Tj ET"
function textRuns(pdf) {
  const pages = pdf.split("/Type /Page ").length - 1;
  const runs = [];
  const re = /BT \/(F[12]) ([\d.]+) Tf [\d. ]+ rg ([\d.-]+) ([\d.-]+) Td \(((?:\\.|[^\\)])*)\) Tj ET/g;
  let page = 0;
  for (const chunk of pdf.split(/stream\r?\n/).slice(1)) {
    page += 1;
    const body = chunk.split(/\r?\nendstream/)[0];
    let m;
    while ((m = re.exec(body))) {
      const text = m[5].replace(/\\([()\\])/g, "$1");
      const ch = Buffer.from(text, "latin1").toString("latin1");
      runs.push({ page, font: m[1], size: Number(m[2]), x: Number(m[3]), y: Number(m[4]), text: ch, w: textWidth(ch, Number(m[2]), m[1]) });
    }
  }
  return { pages, runs };
}

test("PDF: nessun testo oltre i margini e nessuna sovrapposizione sulla stessa riga", () => {
  const { runs } = textRuns(referencePdf());
  assert.ok(runs.length > 100);
  const RIGHT = 595.28 - 42 + 0.5;
  for (const r of runs) assert.ok(r.x + r.w <= RIGHT, `oltre il margine: "${r.text}" (${(r.x + r.w).toFixed(1)})`);
  const byLine = new Map();
  for (const r of runs) {
    const k = `${r.page}:${r.y.toFixed(1)}`;
    if (!byLine.has(k)) byLine.set(k, []);
    byLine.get(k).push(r);
  }
  for (const line of byLine.values()) {
    line.sort((a, b) => a.x - b.x);
    for (let i = 1; i < line.length; i++) {
      assert.ok(line[i - 1].x + line[i - 1].w <= line[i].x + 0.5, `sovrapposti: "${line[i - 1].text}" / "${line[i].text}"`);
    }
  }
});

test("PDF: nomi NIL lunghi vanno a capo e restano interi; tipo e conteggi distinti", () => {
  const pdf = referencePdf();
  const { runs } = textRuns(pdf);
  const all = runs.map(r => r.text).join(" ");
  for (const word of ["NIGUARDA", "FULVIO", "TESTI", "BOLDINASCO", "MAGGIOLINA"]) assert.ok(all.includes(word), word);
  assert.ok(!/\.\.\./.test(runs.filter(r => /NIGUARDA|VILLAPIZZONE|QUARTO/.test(r.text)).map(r => r.text).join("")));
  assert.match(pdf, /\(3\. Territori nel raggio \/ distribuzione\)/);
  // nel PDF le parentesi del testo sono precedute da "\"
  assert.ok(pdf.includes("(8 comuni: Milano \\(12 NIL\\) + 7 comuni"), "sottotitolo con i conteggi distinti");
  assert.match(pdf, /\(NIL Milano\)/);
  assert.match(pdf, /\(Comune\)/);
  assert.doesNotMatch(pdf, /\(Comuni nel raggio\)/);
  // intestazione lunga spezzata dentro la colonna (prima usciva dal margine)
  assert.match(pdf, /\(Copertura\)/);
});

test("PDF: Modalità area leggibile e accento corretto", () => {
  const pdf = referencePdf();
  assert.match(pdf, /\(Raggio\)/);
  assert.doesNotMatch(pdf, /\(radius\)/);
  assert.match(pdf, /preventivo \xe8 soggetto/);
});

test("wrapToWidth: nessuna riga supera la larghezza, parole lunghe spezzate", () => {
  const lines = wrapToWidth("NIGUARDA - CA' GRANDA - PRATO CENTENARO - Q.RE FULVIO TESTI", 120, 8.5, "F1");
  assert.ok(lines.length >= 2);
  for (const l of lines) assert.ok(textWidth(l, 8.5, "F1") <= 120);
  for (const l of wrapToWidth("SUPERCALIFRAGILISTICHESPIRALIDOSO", 40, 8.5, "F2")) assert.ok(textWidth(l, 8.5, "F2") <= 40);
});

// ------------------------------------------------------------ 3. prezzo unitario
test("prezzo unitario: media riconciliabile con il totale (€0,0185 era la tariffa base, non il prezzo)", () => {
  const avg = averageUnitPrice(2797.24, 98046);
  assert.ok(Math.abs(avg * 98046 - 2797.24) < 1e-9, "quantità × prezzo medio = totale");
  assert.equal(avg.toFixed(4), "0.0285");
  assert.notEqual(avg.toFixed(4), "0.0185");
  assert.equal(averageUnitPrice(100, 0), null);
  assert.match(step4, /const distributionAverageUnitPrice = averageUnitPrice\(baseCost, flyerQty\);/);
  assert.match(step4, /unitPrice: distributionAverageUnitPrice,/);
  assert.match(step4, /unitPriceLabel: distributionAverageUnitPrice != null \? `\$\{eur4\(distributionAverageUnitPrice\)\} medio` : null,/);
  assert.doesNotMatch(step4, /unitPricePerFlyer/);
  const pdf = referencePdf();
  assert.match(pdf, /\(\x800,0285 medio\)/);
  assert.match(pdf, /Prezzo unitario medio/);
});

// ------------------------------------------------------------ 4. stato preventivo
test("stato: stimato -> confermato dal cliente (pending_review) -> campagna confermata", () => {
  assert.equal(resolveQuoteStatus({}).label, "Preventivo stimato");
  assert.equal(resolveQuoteStatus({ isQuick: true }).label, "Stima indicativa");
  const submitted = resolveQuoteStatus({ sent: true, campaignStatus: "pending_review" });
  assert.equal(submitted.key, QUOTE_STATUS.SUBMITTED);
  assert.equal(submitted.label, "Preventivo confermato");
  assert.match(submitted.disclaimer, /in attesa di verifica operativa/);
  assert.equal(resolveQuoteStatus({ sent: true, campaignStatus: "approved" }).label, "Campagna confermata");
  // Step 4 e PDF da una sola fonte
  assert.match(step4, /const quoteStatus = resolveQuoteStatus\(\{ isQuick, sent, campaignStatus: savedCampaign\?\.status \|\| null \}\);/);
  assert.match(step4, /status: quoteStatus\.label,/);
  assert.doesNotMatch(step4, /✓ Campagna confermata/);
  assert.doesNotMatch(actions, /"✓ Campagna confermata"/);
  assert.match(planning, /v: quoteStatus\?\.planning \?\?/);
});

test("stato nel PDF: intestazione, campo Stato e piè di pagina coerenti", () => {
  const est = referencePdf();
  assert.ok((est.match(/Preventivo stimato/g) || []).length >= 4);
  assert.doesNotMatch(est, /Preventivo confermato/);
  const conf = referencePdf({ sent: true, campaignStatus: "pending_review" });
  assert.doesNotMatch(conf, /Preventivo stimato/);
  assert.match(conf, /Preventivo confermato \xb7 Pagina 1\//);
  assert.match(conf, /Calcolo economico del preventivo confermato/);
  assert.match(conf, /in attesa di verifica operativa/);
});

// ------------------------------------------------------------ 5. salvataggio
test("salvataggio: il pulsante si blocca durante e dopo il salvataggio, il flag si azzera sempre", () => {
  assert.match(actions, /data-testid="step4-confirm-campaign" disabled=\{!canConfirm \|\| savingCampaign \|\| sent\}/);
  assert.match(step4, /if \(!canConfirm \|\| campaignSaveInFlightRef\.current \|\| sent \|\| savedCampaign\?\.id\) return;/);
  assert.match(step4, /\} finally \{\r?\n\s+campaignSaveInFlightRef\.current = false;\r?\n\s+setSavingCampaign\(false\);/);
});

// submit-campaign-request eseguita in Node su un database in memoria.
const submitSource = read("../supabase/functions/submit-campaign-request/index.ts");
const submitJs = ts.transpileModule(submitSource.replace(/^import .*;\r?\n/gm, ""), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
function memoryBackend() {
  const db = { campaigns: [], campaign_zones: [] };
  let seq = 0;
  const client = {
    auth: { getUser: async () => ({ data: {}, error: null }) },
    from(table) {
      const filters = [];
      let inserted = null;
      const rowsMatching = () => db[table].filter(row => filters.every(([col, val]) => {
        if (col === "metadata->>submission_fingerprint") return row.metadata?.submission_fingerprint === val;
        return row[col] === val;
      }));
      const q = {
        insert(rows) { inserted = rows.map(r => ({ id: `c${++seq}`, created_at: new Date().toISOString(), ...r })); db[table].push(...inserted); return q; },
        select() { return q; }, eq(col, val) { filters.push([col, val]); return q; },
        gte() { return q; }, order() { return q; }, limit() { return q; },
        maybeSingle: async () => {
          const found = rowsMatching()[0] || null;
          return { data: found ? { ...found, campaign_zones: db.campaign_zones.filter(z => z.campaign_id === found.id) } : null, error: null };
        },
        single: async () => ({ data: inserted?.[0] || rowsMatching()[0] || null, error: null }),
        then(resolve) { resolve({ error: null }); },
      };
      return q;
    },
  };
  let handler;
  vm.runInNewContext(submitJs, { serve: fn => { handler = fn; }, createClient: () => client, Deno: { env: { get: () => "test-value" } }, Request, Response, TextEncoder, crypto: webcrypto, console: { error() {}, log() {}, warn() {} } });
  return { db, submit: body => handler(new Request("https://example.invalid/submit", { method: "POST", body: JSON.stringify(body) })) };
}

test("salvataggio: doppio invio identico = una sola campagna (pending_review), il secondo è idempotente", async () => {
  const { db, submit } = memoryBackend();
  const body = { client_name: "QA", client_email: "qa@example.invalid", city_name: "Milano", total_flyers: 98046, total_amount: 2797.24, campaignZones: ROWS.map(r => ({ municipality: r.name, quantity: 5000, lat: 45.5289, lng: 9.1656, radius_m: 3000, territory_type: r.isNil ? "nil" : "radius" })) };
  const first = await (await submit(body)).json();
  const second = await (await submit(body)).json();
  assert.equal(first.success, true);
  assert.equal(db.campaigns.length, 1, "nessuna campagna duplicata");
  assert.equal(db.campaigns[0].status, "pending_review");
  assert.equal(second.idempotent, true);
  assert.equal(second.campaign.id, first.campaign.id);
  // una richiesta diversa (altra quantità) resta una campagna nuova
  await submit({ ...body, total_flyers: 50000 });
  assert.equal(db.campaigns.length, 2);
});

// ------------------------------------------------------------ 6. mobile
test("mobile: griglia KPI in alto con colonne minmax(0, 1fr) e valori che vanno a capo", () => {
  assert.match(step4, /gridTemplateColumns: isMobile \? "repeat\(2, minmax\(0, 1fr\)\)"/);
  assert.match(step4, /fontSize: isMobile \? 26 : 34,/);
  // PREZZO FINALE a 360 px: a 28 px usciva dal riquadro (misurato 120 px su 96)
  assert.match(step4, /data-testid="step4-hero-price" style=\{\{[\s\S]{0,200}fontSize: isMobile \? 21 : 38,/);
  assert.match(step4, /overflowWrap: "anywhere"\r?\n\s+\}\}>\{eur\(grandTotal\)\}/);
});
