// "Mostra dettagli zone" rendered as an unstyled white button: its rules lived
// in src/styles/app.css, which no module imports. They now ship with Step 2.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("Step 2 imports the zone details stylesheet", () => {
  assert.match(read("src/pages/public/configurator/Step2.jsx"), /^import "\.\/step2\/step2-zone-details\.css";$/m);
});

test("zone details stylesheet styles the toggle, sort buttons, table and mobile layout", () => {
  const css = read("src/pages/public/configurator/step2/step2-zone-details.css");
  for (const selector of [
    ".vp-step2-zone-details {",
    ".vp-step2-zone-details__trigger {",
    ".vp-step2-zone-details__sort button[aria-pressed=\"true\"]",
    ".vp-step2-zone-table {",
    ".vp-step2-zone-status--parziale",
    ".vp-step2-poi-focus-pulse",
  ]) assert.ok(css.includes(selector), selector);
  assert.match(css, /\.vp-step2-zone-details__trigger \{[\s\S]*?background: transparent;[\s\S]*?color: #fff;/);
  assert.match(css, /@media \(max-width: 820px\)/);
});

test("the markup still uses those classes", () => {
  const panel = read("src/pages/public/configurator/step2/Step2CapPanel.jsx");
  assert.match(panel, /className="vp-step2-zone-details__trigger"/);
  assert.match(panel, /Mostra dettagli zone/);
});
