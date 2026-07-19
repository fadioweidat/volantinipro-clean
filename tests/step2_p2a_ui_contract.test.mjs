import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const mainSource = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../volantinipro-final.jsx", import.meta.url), "utf8");
const cssSource = readFileSync(new URL("../src/styles/app.css", import.meta.url), "utf8");

assert.match(mainSource, /role="status"/);
assert.match(mainSource, /aria-live="polite"/);
assert.match(mainSource, /Caricamento pagina in corso/);

assert.equal((appSource.match(/className="vp-geocode-suggestion"/g) || []).length, 4);
assert.doesNotMatch(appSource, /<div key=\{c\.id\} onClick=\{\(\) => selectOperationalPoint/);
assert.doesNotMatch(appSource, /<div key=\{c\.id\} onClick=\{\(\) => handleCapSelect/);
assert.match(cssSource, /\.vp-geocode-suggestion:focus-visible/);

assert.match(appSource, /role="status" aria-live="polite" data-testid="poi-availability-warning"/);
assert.match(appSource, /role="status" aria-live="polite" data-testid="transport-availability-warning"/);

console.log("Step 2 P2-A UI contract: PASS");
