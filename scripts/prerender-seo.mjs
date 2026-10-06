import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { SEO_ROUTES, getRouteMetadata } from '../src/lib/seo/routePolicy.js';

const root = process.cwd();
const out = path.resolve(root, 'dist');
const scratch = path.resolve(root, '.seo-render');
const template = await fs.readFile(path.join(out, 'index.html'), 'utf8');
const css = (await fs.readdir(path.join(out, 'assets'))).filter(name => /^(HomePage|homepage-hero|AppRouter)-.*\.css$/.test(name));
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));

function documentFor(metadata, body) {
  let html = template.replace(/<title>.*?<\/title>/s, `<title>${escape(metadata.title)}</title>`)
    .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${escape(metadata.description)}">`)
    .replace(/<link rel="canonical"[^>]*>/, metadata.canonical ? `<link rel="canonical" href="${metadata.canonical}">` : '')
    .replace(/<meta name="robots"[^>]*>/g, '')
    .replace(/<meta property="og:(title|description|url)"[^>]*>/g, (_, field) => `<meta property="og:${field}" content="${escape(field === 'url' ? metadata.canonical || '' : metadata[field])}">`)
    .replace(/<meta name="twitter:(title|description)"[^>]*>/g, (_, field) => `<meta name="twitter:${field}" content="${escape(metadata[field])}">`)
    .replace('</head>', `${body ? css.map(file => `<link rel="stylesheet" href="/assets/${file}">`).join('') : ''}<meta name="robots" content="${metadata.robots}"></head>`);
  // Replace only the static bootstrap root, leaving its retry mechanism and client entry intact.
  if (body) html = html.replace(/<div id="root">[\s\S]*?<\/div>\s*<\/div>/, `<div id="root" data-seo-snapshot="${metadata.page}">${body}</div>`);
  return html;
}

try {
  await build({ configFile: false, plugins: [react()], resolve: { alias: [{ find: /.*Homepage(?:RadiusPreview|TerritoryMap)\.jsx$/, replacement: path.resolve(root, 'scripts/seo-map-placeholder.jsx') }] }, build: { ssr: 'scripts/seo-render.jsx', outDir: scratch, emptyOutDir: true, minify: false, rollupOptions: { output: { entryFileNames: 'render.mjs' } } } });
  const { renderMarketingPage } = await import(pathToFileURL(path.join(scratch, 'render.mjs')));
  const originalFetch = globalThis.fetch;
  let backendRequests = 0;
  globalThis.fetch = () => {
    backendRequests += 1;
    throw new Error('Prerender must not make backend requests');
  };
  try {
  // Default shell is deny-by-default: no marketing snapshot on application/private/unknown routes.
  await fs.writeFile(path.join(out, 'app-shell.html'), documentFor(getRouteMetadata('/configuratore'), null));
  for (const [route, page] of SEO_ROUTES) {
    let body = renderMarketingPage(page);
    // Reveal content that framer-motion would otherwise leave invisible before JavaScript runs.
    body = body.replace(/opacity:0(?=;|")/g, 'opacity:1');
    const filename = route === '/' ? path.join(out, 'index.html') : path.join(out, route.slice(1), 'index.html');
    await fs.mkdir(path.dirname(filename), { recursive: true });
    await fs.writeFile(filename, documentFor(getRouteMetadata(route), body));
  }
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${SEO_ROUTES.map(([route]) => `  <url><loc>${getRouteMetadata(route).canonical}</loc></url>`).join('\n')}\n</urlset>\n`;
  await fs.writeFile(path.join(out, 'sitemap.xml'), sitemap);
  console.log(`SEO: generated ${SEO_ROUTES.length} marketing/legal HTML pages + noindex app shell; backend fetch attempts: ${backendRequests}.`);
  } finally {
    globalThis.fetch = originalFetch;
  }
} finally {
  await fs.rm(scratch, { recursive: true, force: true });
}
