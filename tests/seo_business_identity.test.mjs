import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('public footer identifies VolantiniPro with VAT and operating area', () => {
  const footer = source('src/components/home/Footer.jsx');
  assert.match(footer, /VolantiniPro · P\.IVA 04856200615 · Operiamo a Milano e in Lombardia/);
  assert.doesNotMatch(footer, /P\.IVA in aggiornamento/);
});

test('public and prerendered pages share the footer without duplicating home', () => {
  const routes = source('src/app/PublicRoutes.jsx');
  const prerender = source('scripts/seo-render.jsx');
  assert.match(routes, /showFooter && <Footer/);
  for (const key of ['privacy', 'terms', 'cookie', 'preventivo', 'milano-landing', 'service-door-to-door', 'service-hand-to-hand', 'service-business']) {
    assert.ok(routes.includes(`"${key}"`), `Missing public footer route: ${key}`);
  }
  assert.match(prerender, /page !== 'home' && <Footer/);
});

test('schema Organization and Service use approved identity and coverage', () => {
  const seo = source('src/layouts/public/SeoMeta.jsx');
  assert.match(seo, /vatID: "IT04856200615"/);
  assert.match(seo, /const SERVICE_AREA = \{ "@type": "AdministrativeArea", name: "Lombardia" \}/);
  assert.equal((seo.match(/areaServed: SERVICE_AREA/g) || []).length, 2);
  assert.doesNotMatch(seo, /"@type": "LocalBusiness"/);
});

test('privacy and terms identify the controller and email without company/address', () => {
  const legal = source('src/pages/public/LegalPage.jsx');
  assert.equal((legal.match(/VolantiniPro, P\.IVA 04856200615 · info@volantinipro\.it/g) || []).length, 2);
  assert.doesNotMatch(legal, /DPO\/contatti privacy e fornitori effettivi/);
});
