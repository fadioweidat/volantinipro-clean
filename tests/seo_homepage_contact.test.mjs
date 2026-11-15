// Homepage SEO 2026-11-15: description con il minimo reale del motore,
// telefono ufficiale in footer, Contatti e JSON-LD (mai nella description).
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { metaByPage } from "../src/lib/seo/routePolicy.js";
import { TERRITORY_MINIMUMS, TERRITORY_TIERS, calculateDistributionZonePrice } from "../src/lib/pricing/distributionPricing.js";
import { SUPPORT_PHONE_DISPLAY, SUPPORT_PHONE_TEL_HREF } from "../src/lib/contactConfig.js";

const root = path.resolve(import.meta.dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const HOME_DESCRIPTION = "Distribuzione volantini a Milano e in Lombardia: prezzi chiari da €120, dati ISTAT reali e tracciamento GPS opzionale. Calcola il preventivo online e scarica il PDF.";

test("homepage description: 'da €120' è il minimo reale del motore (Milano città)", () => {
  assert.equal(TERRITORY_MINIMUMS[TERRITORY_TIERS.MILANO_CORE], 120);
  assert.equal(calculateDistributionZonePrice(TERRITORY_TIERS.MILANO_CORE, 1), 120);
  assert.equal(Math.min(...Object.values(TERRITORY_MINIMUMS)), 120);
  assert.equal(metaByPage.home[1], HOME_DESCRIPTION);
  // GPS e' un extra a pagamento: "tracciamento GPS" sempre seguito da "opzionale".
  assert.match(metaByPage.home[1], /tracciamento GPS opzionale/);
  assert.doesNotMatch(metaByPage.home[1], /tracciamento GPS(?! opzionale)/);
});

test("index.html: description, og e twitter uguali alla policy; nessun telefono nella description", () => {
  const src = read("index.html");
  for (const tag of ['name="description"', 'property="og:description"', 'name="twitter:description"']) {
    assert.ok(src.includes(`<meta ${tag} content="${HOME_DESCRIPTION}" />`), tag);
  }
  assert.ok(!/351|telefon/i.test(HOME_DESCRIPTION));
});

test("JSON-LD Organization: logo e telefono ufficiale, statico e runtime", () => {
  const src = read("index.html");
  const org = [...src.matchAll(/<script type="application\/ld\+json"[^>]*>\s*([\s\S]*?)\s*<\/script>/g)].map((m) => JSON.parse(m[1])).find((b) => b["@type"] === "Organization");
  assert.equal(org.telephone, "+39 351 767 3737");
  assert.equal(org.logo, "https://www.volantinipro.it/favicon.png");
  assert.equal(SUPPORT_PHONE_DISPLAY, "+39 351 767 3737");
  assert.equal(SUPPORT_PHONE_TEL_HREF, "tel:+393517673737");
  assert.match(read("src/layouts/public/SeoMeta.jsx"), /telephone: SUPPORT_PHONE_DISPLAY,/);
});

test("telefono cliccabile in footer, pagina Contatti e sezione Contatti", () => {
  for (const file of ["src/components/home/Footer.jsx", "src/pages/public/ConsultantPage.jsx", "src/components/home/ContattiSection.jsx"]) {
    assert.match(read(file), /href=\{SUPPORT_PHONE_TEL_HREF\}/, file);
  }
});
