import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import puppeteer from 'puppeteer-core';

// This test executes real React/JSX in Chromium. Source-regex tests alone
// missed ReferenceErrors after a merge, despite the full suite being green.
test('Step 4 opens in Chromium for multi-PV and multi-comune, without runtime errors', { timeout: 90000 }, async (t) => {
  const executablePath = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium';
  const port = 14000 + Math.floor(Math.random() * 20000);
  const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
  t.after(() => server.kill());
  let browser;
  try {
    for (let n = 0; n < 80; n++) {
      try { const r = await fetch(`http://127.0.0.1:${port}/tests/fixtures/step4_runtime.html`); if (r.ok) break; } catch { /* server boot */ }
      if (n === 79) throw Error('Vite test server did not start');
      await delay(200);
    }
    browser = await puppeteer.launch({executablePath,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
    for (const scenario of ['multi-pv', 'multi-comune']) {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`http://127.0.0.1:${port}/tests/fixtures/step4_runtime.html?scenario=${scenario}`, { waitUntil:'networkidle2',timeout:30000 });
      const status = await page.evaluate(() => ({ text:document.getElementById('root')?.innerText?.slice(0,2500), err:document.body.dataset.runtimeError }));
      assert.deepEqual(errors, [], `${scenario} threw during React render: ${errors.join('; ')}`);
      assert.equal(status.err, undefined, `${scenario} runtime rejection: ${status.err}`);
      assert.match(status.text || '', /Preventivo|Distribuzione|Prezzo/i, `${scenario} must render a real quote, not a blank page`);
      await page.close();
    }
  } finally { await browser?.close(); }
});
