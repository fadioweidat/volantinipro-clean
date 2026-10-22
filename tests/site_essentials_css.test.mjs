// src/styles/app.css is never imported: its rules never reached the site. Only
// the agreed ones are moved to a stylesheet loaded on every page.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const css = read("src/styles/site-essentials.css");

test("site-essentials.css is loaded by the app entry; app.css is still not loaded", () => {
  const main = read("src/main.jsx");
  assert.match(main, /^import "\.\/styles\/site-essentials\.css";$/m);
  assert.doesNotMatch(main, /styles\/app\.css/);
});

test("keyboard focus, comune row hover, tabular numbers, campaign dashboard layout", () => {
  assert.match(css, /:where\(a, button, input, select, textarea\):focus-visible \{\s*outline: 2px solid #E8571A;\s*outline-offset: 2px;\s*\}/);
  assert.doesNotMatch(css, /focus-visible[^}]*!important/, 'never override focus styles that elements already define');
  assert.match(css, /\.town-list-item:hover \{/);
  assert.match(css, /\.vp-data-number \{ font-variant-numeric: tabular-nums; white-space: nowrap; \}/);
  assert.match(css, /\.vp-campaign-dashboard-shell \{[\s\S]*?padding: 105px 24px 80px;/);
  assert.match(css, /\.vp-campaign-dashboard-grid \{[\s\S]*?grid-template-columns: minmax\(0, 1\.25fr\) minmax\(280px, 0\.75fr\);/);
  assert.match(css, /@media \(max-width: 900px\) \{\s*\.vp-campaign-dashboard-grid \{\s*grid-template-columns: 1fr !important;/);
});

test("only the agreed selectors are moved (layout rules copied unchanged from app.css)", () => {
  const selectors = [...css.matchAll(/^\s*([^@/\n{}][^{}\n]*)\{/gm)].map((m) => m[1].trim());
  assert.deepEqual([...new Set(selectors)].sort(), [
    ".town-list-item:hover",
    ".vp-campaign-dashboard-grid",
    ".vp-campaign-dashboard-shell",
    ".vp-data-number",
    ":where(a, button, input, select, textarea):focus-visible",
  ]);
  const app = read("src/styles/app.css").replace(/\r\n/g, "\n");
  for (const block of [".vp-data-number { font-variant-numeric: tabular-nums; white-space: nowrap; }", ".vp-campaign-dashboard-shell {\n  min-height: 100vh;\n  background: #0D1B2A;\n  padding: 105px 24px 80px;\n  box-sizing: border-box;\n}"]) {
    assert.ok(app.includes(block), block);
  }
});

test("the markup still uses those classes", () => {
  const final = read("volantinipro-final.jsx");
  assert.match(final, /className="vp-campaign-dashboard-shell"/);
  assert.match(final, /className="vp-campaign-dashboard-grid"/);
  assert.match(read("src/pages/public/configurator/step2/Step2ComunePanel.jsx"), /className="town-list-item"/);
  assert.match(read("src/pages/public/configurator/step2/Step2CapPanel.jsx"), /className="vp-data-number"/);
});
