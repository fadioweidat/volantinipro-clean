// 2026-10-29 (approved): Step 1 no longer shows a flat rate per 1.000 for Hand to Hand (€22)
// or Business (€35). Business: "Su progetto"; Hand to Hand: hourly rate per operator
// (handToHandPricing.js, later the same day). With printing chosen, urgency applies to distribution after the
// print arrives, and "Scelgo la data" starts no earlier than production + shipping.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PRINT_PRODUCTION_WORKING_DAYS, PRINT_SHIPPING_WORKING_DAYS, PRINT_TIMING_NOTE, addWorkingDays, earliestStartWithPrint } from "../src/lib/printLeadTime.js";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("no flat distribution rate left in Step 1; H2H/B2B notes as on the homepage", () => {
  const step1 = read("src/pages/public/configurator/Step1.jsx");
  assert.doesNotMatch(step1, /baseRate|distEst|18\.5|h2h: 22\.0|b2b: 35\.0/);
  assert.ok(step1.includes('const distributionNote = serviceType === "b2b" || serviceType === "business-distribution" ? "Su progetto" : null;'));
  assert.ok(step1.includes("const h2hPricing = serviceType === \"h2h\" ? calculateHandToHandPricing({ operatorHours: handToHandOperatorHours(data), urgency: data.urgency, planDiscountPct: discPct }) : null;"));
  const summary = read("src/components/Step1Summary.jsx");
  assert.doesNotMatch(summary, /distributionCost|estimate\.total/);
  assert.ok(summary.includes('<strong>{estimate.distributionNote || "Prezzo calcolato sulla tua zona"}</strong>'));
  assert.ok(summary.includes("<><Amount value={estimate.printCost} /> + distribuzione</>"));
});

test("print lead time: 5 working days production + 2 shipping, weekends skipped", () => {
  assert.equal(PRINT_PRODUCTION_WORKING_DAYS, 5);
  assert.equal(PRINT_SHIPPING_WORKING_DAYS, 2);
  assert.equal(PRINT_TIMING_NOTE, "Stampa: circa 5 giorni lavorativi + spedizione, poi distribuzione.");
  // Thursday 29/10/2026 + 7 working days = Monday 09/11/2026.
  assert.equal(earliestStartWithPrint(new Date(2026, 9, 29)), "2026-11-09");
  // Saturday start: first working day counted is Monday.
  assert.equal(addWorkingDays(new Date(2026, 9, 31), 1).getDate(), 2);
});

test("Step 1 with printing: urgency texts, note, calendar minimum and validation", () => {
  const step1 = read("src/pages/public/configurator/Step1.jsx");
  assert.match(step1, /const printMinStart = printChosen \? earliestStartWithPrint\(\) : "";/);
  assert.match(step1, /printChosen \? "Distribuzione avviata in 24–48h dall'arrivo della stampa • Maggiorazione \+20%"/);
  assert.match(step1, /printChosen \? "Priorità massima per la distribuzione dopo l'arrivo della stampa • Maggiorazione \+35%"/);
  assert.match(step1, /\{PRINT_TIMING_NOTE\} Urgente ed Express valgono per la distribuzione, dopo l'arrivo della stampa\./);
  assert.match(step1, /min=\{printMinStart \|\| undefined\}/);
  assert.match(step1, /const printDateError = !!\(printMinStart && data\.startDate && data\.startDate < printMinStart\);/);
  assert.match(step1, /label: `Con la stampa la distribuzione può iniziare dal \$\{formatDateDisplay\(printMinStart\)\}`/);
  assert.match(step1, /Boolean\(data\.urgency\) && !dateError && !printDateError/);
  assert.ok(read("src/components/Step1Summary.jsx").includes("{estimate.printTimingNote && <small>{estimate.printTimingNote}</small>}"));
  assert.match(read("TODO.md"), /Ricontrollare i prezzi Pixart della tabella printPricing\.js ogni 3 mesi \(ultimo rilievo 28\/08\/2026\)\./);
});

test("an invalid start date is not shown as confirmed", () => {
  assert.ok(read("src/pages/public/configurator/Step1.jsx").includes('{val && !(field.key === "startDate" && printDateError) && <div style={{'));
});

test("with printing, 'Entro 7 giorni' / 'Entro 15 giorni' only when the first useful date fits", async () => {
  const { isPeriodPresetUnavailableWithPrint } = await import("../src/lib/printLeadTime.js");
  const today = new Date(2026, 9, 29); // Thursday; first useful date with print: 09/11/2026
  const min = earliestStartWithPrint(today);
  assert.equal(isPeriodPresetUnavailableWithPrint("within7", min, today), true);   // limit 05/11
  assert.equal(isPeriodPresetUnavailableWithPrint("within15", min, today), false); // limit 13/11
  assert.equal(isPeriodPresetUnavailableWithPrint("within15", "2026-11-14", today), true);
  assert.equal(isPeriodPresetUnavailableWithPrint("asap", min, today), false);
  assert.equal(isPeriodPresetUnavailableWithPrint("within7", "", today), false); // no print
  const step1 = read("src/pages/public/configurator/Step1.jsx");
  assert.ok(step1.includes("const presetUnavailable = id => printChosen && isPeriodPresetUnavailableWithPrint(id, printMinStart);"));
  assert.ok(step1.includes("disabled={unavailable} aria-disabled={unavailable} onClick={() => !unavailable && updateData({"));
  assert.ok(step1.includes("{unavailable ? `Non disponibile con la stampa: la prima data utile è il ${formatDateDisplay(printMinStart)}` : p.desc}"));
  assert.ok(step1.includes("Boolean(data.urgency) && !dateError && !printDateError && !printPresetError"));
});
