import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SEO_ROUTES, getRouteMetadata } from '../src/lib/seo/routePolicy.js';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const escape = value => value.replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
const expectedH1 = {
  home: /Distribuisci volantini/, 'service-door-to-door': /Distribuzione Volantini Door to Door/,
  'service-hand-to-hand': /Distribuzione Volantini Hand to Hand/, 'service-business': /Distribuzione Volantini per Aziende e Negozi/,
  'milano-landing': /Distribuzione volantini a Milano/, preventivo: /Richiedi un Preventivo/,
  quick: /Preventivo rapido/, consultant: /Parla con un consulente/,
  privacy: /Privacy Policy/, terms: /Termini e condizioni/, cookie: /Cookie Policy/,
  prices: /Prezzi della distribuzione volantini/,
  'city-monza': /Distribuzione volantini a Monza/, 'city-bergamo': /Distribuzione volantini a Bergamo/,
  'city-brescia': /Distribuzione volantini a Brescia/, 'city-como': /Distribuzione volantini a Como/,
  'city-varese': /Distribuzione volantini a Varese/, 'city-sesto-san-giovanni': /Distribuzione volantini a Sesto San Giovanni/,
  'city-cinisello-balsamo': /Distribuzione volantini a Cinisello Balsamo/,
};
const bodyText = html => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
for (const [route, page] of SEO_ROUTES) {
  test(`initial HTTP artifact: ${route} has its real content and stable metadata before JS`, () => {
    const html = read(`dist/${route === '/' ? '' : route.slice(1) + '/'}index.html`);
    const metadata = getRouteMetadata(route);
    assert.ok(html.includes(`<title>${metadata.title}</title>`), route);
    assert.ok(html.includes(`name="description" content="${escape(metadata.description)}"`));
    assert.equal((html.match(/name="description"/g) || []).length, 1);
    assert.ok(html.includes(`href="${metadata.canonical}"`));
    assert.equal((html.match(/rel="canonical"/g) || []).length, 1);
    assert.match(html, /name="robots" content="index, follow"/);
    assert.ok(html.includes(`property="og:url" content="${metadata.canonical}"`));
    const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1];
    assert.ok(h1, 'H1 is already in the response');
    assert.match(bodyText(h1), expectedH1[page]);
    assert.ok(bodyText(html.match(/<body[\s\S]*?<\/body>/)[0]).length > 300);
    assert.doesNotMatch(html, /Caricamento programma\.\.\./);
    assert.match(html, /data-seo-snapshot=/);
    assert.match(html, /<script type="module"/);
  });
}
test('only approved indexable URLs enter sitemap and metadata are unique', () => {
  const xml = read('dist/sitemap.xml');
  const urls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1]);
  assert.deepEqual(urls, SEO_ROUTES.map(([route]) => getRouteMetadata(route).canonical));
  assert.equal(new Set(SEO_ROUTES.map(([route]) => getRouteMetadata(route).title)).size, SEO_ROUTES.length);
  assert.equal(new Set(SEO_ROUTES.map(([route]) => getRouteMetadata(route).description)).size, SEO_ROUTES.length);
});
test('private/app/unknown responses use non-indexable shell rather than marketing snapshot', () => {
  const shell = read('dist/app-shell.html');
  assert.match(shell, /name="robots" content="noindex, nofollow"/);
  assert.doesNotMatch(shell, /data-seo-snapshot=|rel="canonical"|<h1/);
  const config = JSON.parse(read('vercel.json'));
  assert.deepEqual(config.rewrites.at(-1), { source: '/(.*)', destination: '/app-shell.html' });
  for (const route of ['/configuratore','/analisi-campagna','/admin','/customer/a','/supplier','/driver/a','/login','/auth/callback','/campagna/a','/le-mie-analisi','/unknown']) {
    assert.equal(getRouteMetadata(route).indexable, false);
    assert.ok(!config.rewrites.some(rule => rule.source === route));
  }
  assert.deepEqual(config.rewrites[0], {source:'/app-driver',destination:'/app-driver/index.html'});
});
test('initial homepage exposes actual service destinations as links and bootstrap remains unchanged', () => {
  const html = read('dist/index.html');
  for (const route of ['/servizi/door-to-door','/servizi/hand-to-hand','/servizi/business','/distribuzione-volantini-milano','/consulente']) {
    assert.ok(html.includes(`href="${route}"`), route);
  }
  assert.match(read('src/main.jsx'), /createRoot\(document.getElementById\("root"\)\)\.render/);
  const milano = read('dist/distribuzione-volantini-milano/index.html');
  for (const route of ['/servizi/door-to-door','/servizi/hand-to-hand','/servizi/business','/preventivo','/consulente']) {
    assert.ok(milano.includes(`href="${route}"`), route);
  }
});

test('Milano landing matches local commercial search intent and links to prices', () => {
  const html = read('dist/distribuzione-volantini-milano/index.html');
  const plain = bodyText(html);
  assert.match(plain, /Vuoi distribuire volantini a Milano\?/);
  assert.match(plain, /Come richiedere la distribuzione di volantini a Milano/);
  assert.match(plain, /Quanto costa distribuire volantini a Milano\?/);
  assert.match(html, /href="\/prezzi-distribuzione-volantini"/);
  assert.match(html, /href="\/preventivo"/);
  assert.match(html, /href="\/consulente"/);
  assert.match(html, /name="robots" content="index, follow"/);
});

// This catches missing assets in the built SEO HTML. It does not guarantee that
// a Googlebot scan across concurrent Vercel deployments cannot miss stale hashes.
test('all SEO HTML references point to assets present in the same build', () => {
  for (const [route] of SEO_ROUTES) {
    const filename = `dist/${route === '/' ? '' : route.slice(1) + '/'}index.html`;
    const html = read(filename);
    const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)]
      .map(match => match[1].split(/[?#]/)[0]);
    assert.ok(assets.length > 0, `${route}: no assets found`);
    for (const asset of assets) {
      assert.ok(fs.existsSync(new URL(`../dist${asset}`, import.meta.url)),
        `${route} references missing build asset ${asset}`);
    }
  }
});
