import fs from 'node:fs';
import path from 'node:path';
import { SEO_ROUTES } from '../src/lib/seo/routePolicy.js';

// Local preview follows the same allowlist/app-shell contract as Vercel rewrites.
export function seoPreviewPlugin() {
  return { name: 'seo-static-preview', configurePreviewServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      const pathname = new URL(req.url, 'http://localhost').pathname;
      if (pathname.startsWith('/assets/') || pathname.startsWith('/api/')) return next();
      const dist = path.resolve(server.config.root, server.config.build.outDir);
      const staticFile = path.resolve(dist, `.${pathname}`);
      if (staticFile.startsWith(`${dist}${path.sep}`) && fs.existsSync(staticFile) && fs.statSync(staticFile).isFile()) return next();
      const route = pathname === '/' ? '/' : pathname.replace(/\/+$/, '');
      const indexable = SEO_ROUTES.some(([candidate]) => candidate === route);
      const file = route === '/app-driver' ? 'app-driver/index.html' : indexable ? route === '/' ? 'index.html' : `${route.slice(1)}/index.html` : 'app-shell.html';
      const target = path.resolve(server.config.root, server.config.build.outDir, file);
      if (!fs.existsSync(target)) return next();
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(req.method === 'HEAD' ? '' : fs.readFileSync(target));
    });
  } };
}
