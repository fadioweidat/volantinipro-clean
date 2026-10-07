import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { preview } from 'vite';
import { getRouteMetadata } from '../src/lib/seo/routePolicy.js';
import { installSeoTransitionObserver, transitionFailures } from './helpers/seoTransitionObserver.js';

test('Home → Service retains meaningful content, one navbar and SEO until the lazy route is ready', { timeout: 90000 }, async () => {
  const root = process.env.SEO_TEST_ROOT || fileURLToPath(new URL('..', import.meta.url));
  assert.ok(fs.existsSync(path.join(root, 'dist/index.html')), 'Run npm run build first');
  const executablePath = process.env.BROWSER_EXECUTABLE || [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/chromium', '/usr/bin/google-chrome',
  ].find(candidate => fs.existsSync(candidate));
  assert.ok(executablePath, 'Set BROWSER_EXECUTABLE to an installed Chromium browser');
  const server = await preview({ root, logLevel: 'silent', preview: { host: '127.0.0.1', port: 0, strictPort: false } });
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath, headless: true });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.setCacheEnabled(false);
    await page.evaluateOnNewDocument(installSeoTransitionObserver);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    // Hold the destination chunk only in the test to expose the lazy boundary.
    await page.setRequestInterception(true);
    let delayed = 0;
    page.on('request', request => {
      if (/\/ServicePages-[^/]+\.js(?:\?|$)/.test(request.url())) {
        delayed++; setTimeout(() => request.continue().catch(() => {}), 1200);
      } else request.continue().catch(() => {});
    });
    const origin = server.resolvedUrls.local[0].replace(/\/$/, '');
    await page.goto(origin + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__seoTransition?.bootstrapBoundary !== null &&
      !!document.querySelector('script[data-seo-jsonld="faqpage"]'));
    const navigationStart = await page.evaluate(() => performance.now());
    const serviceLink = 'a[href="/servizi/door-to-door"]';
    await page.$eval(serviceLink, node => node.scrollIntoView({ block: 'center' }));
    await page.click(serviceLink);
    await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Distribuzione Volantini Door to Door' &&
      document.querySelector('link[rel="canonical"]')?.href === 'https://www.volantinipro.it/servizi/door-to-door');
    await page.waitForFunction(() => document.title === 'Distribuzione Volantini Door to Door | VolantiniPro');
    const proof = await page.evaluate(() => window.__seoTransition);
    assert.equal(proof.scriptsAtInstall, 0);
    assert.ok(delayed > 0, 'The destination chunk must be cold and delayed');
    assert.deepEqual(errors, []);
    assert.deepEqual(transitionFailures(proof, navigationStart), [], 'No empty H1/content, loader takeover or duplicate navbar/JSON-LD');
    const meta = getRouteMetadata('/servizi/door-to-door');
    assert.equal(await page.title(), meta.title);
    assert.equal(await page.$eval('meta[name="description"]', node => node.content), meta.description);
    assert.equal(await page.$eval('link[rel="canonical"]', node => node.href), meta.canonical);
    assert.equal(await page.evaluate(() => location.pathname), '/servizi/door-to-door');
  } finally {
    await browser?.close(); await new Promise(resolve => server.httpServer.close(resolve));
  }
});
