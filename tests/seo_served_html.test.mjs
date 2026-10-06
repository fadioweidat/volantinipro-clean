import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import { SEO_ROUTES, getRouteMetadata } from '../src/lib/seo/routePolicy.js';

// Test real HTTP responses from Vite's production-output preview, without a
// browser/JavaScript execution or any backend credentials.
test('served initial HTML follows the public allowlist and private shell policy', async t => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '0'], {
    cwd: root, env: {...process.env, NO_COLOR:'1'}, stdio:['ignore','pipe','pipe'],
  });
  try {
    const origin = await new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error(`Preview did not start: ${output}`)), 30000);
      server.once('error', error => { clearTimeout(timer); reject(error); });
      server.once('exit', code => { clearTimeout(timer); reject(new Error(`Preview exited: ${code}; ${output}`)); });
      server.stdout.on('data', chunk => {
        output += chunk;
        const match = output.match(/http:\/\/127\.0\.0\.1:\d+/);
        if (match) { clearTimeout(timer); resolve(match[0]); }
      });
      server.stderr.on('data', chunk => { output += chunk; });
    });
    for (const [route] of SEO_ROUTES) {
      await t.test(route, async () => {
        const response = await fetch(origin + route, {redirect:'manual'});
        const html = await response.text();
        assert.equal(response.status, 200);
        assert.match(response.headers.get('content-type'), /text\/html/);
        assert.ok(html.includes(`<title>${getRouteMetadata(route).title}</title>`));
        assert.ok(html.includes(`href="${getRouteMetadata(route).canonical}"`));
        assert.match(html, /<h1[ >]/);
        assert.match(html, /name="robots" content="index, follow"/);
        assert.doesNotMatch(html, /Caricamento programma\.\.\./);
      });
    }
    for (const route of ['/configuratore','/analisi-campagna','/admin','/dashboard','/customer/example','/supplier','/driver/example.token','/login','/auth/callback','/campagna/example','/not-found']) {
      await t.test(`noindex ${route}`, async () => {
        const response = await fetch(origin + route);
        const html = await response.text();
        assert.equal(response.status, 200);
        assert.match(html, /name="robots" content="noindex, nofollow"/);
        assert.doesNotMatch(html, /data-seo-snapshot=|rel="canonical"|<h1[ >]/);
      });
    }
    await t.test('direct /app-driver follows the preserved Vercel rewrite', async () => {
      const response = await fetch(origin + '/app-driver');
      const html = await response.text();
      assert.equal(response.status, 200);
      assert.match(html, /name="robots" content="noindex, nofollow"/);
      assert.doesNotMatch(html, /data-seo-snapshot=/);
      assert.equal(html, await fs.readFile(new URL('../public/app-driver/index.html', import.meta.url), 'utf8'));
    });
    await t.test('APK download HTML and assetlinks remain original static bytes', async () => {
      for (const file of ['/app-driver/index.html','/.well-known/assetlinks.json','/robots.txt']) {
        const response = await fetch(origin + file);
        assert.equal(response.status, 200);
        assert.deepEqual(Buffer.from(await response.arrayBuffer()), await fs.readFile(new URL(`../public${file}`, import.meta.url)));
      }
    });
  } finally {
    server.kill();
  }
});
