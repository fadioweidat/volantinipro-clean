import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SEO_ROUTES, getRouteMetadata } from '../src/lib/seo/routePolicy.js';

const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));

test('every one of 19 public SEO routes serves its own prerendered HTML before app-shell fallback', () => {
  assert.equal(SEO_ROUTES.length, 19, 'expected homepage, services, Milano, pricing, 7 cities and legal routes');
  const fallbacks = config.rewrites.filter((r) => r.source === '/(.*)');
  assert.equal(fallbacks.length, 1, 'one catch-all rewrite');
  assert.equal(fallbacks[0].destination, '/app-shell.html', 'private routes retain the noindex app shell');
  const fallbackIndex = config.rewrites.findIndex((r) => r.source === '/(.*)');
  const publicPaths = new Set();
  for (const [path] of SEO_ROUTES) {
    assert.ok(!publicPaths.has(path), `duplicate route ${path}`);
    publicPaths.add(path);
    assert.equal(getRouteMetadata(path).robots, 'index, follow', path);
    const hits = config.rewrites.filter((rule) => rule.source === path);
    assert.equal(hits.length, 1, `missing or duplicate static rewrite: ${path}`);
    assert.equal(hits[0].destination, path === '/' ? '/index.html' : `${path}/index.html`, path);
    assert.ok(config.rewrites.indexOf(hits[0]) < fallbackIndex, `fallback precedes ${path}`);
  }
  assert.equal(publicPaths.size, 19);
});

test('homepage advertises a stable favicon for search crawlers', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /<link rel="icon" type="image\/png" sizes="192x192" href="\/favicon.png" \/>/);
  assert.match(html, /<link rel="icon" type="image\/svg\+xml" href="\/favicon.svg" \/>/);
});
