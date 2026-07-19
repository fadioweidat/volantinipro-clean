import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const mapPath = path.join(root, 'src/components/Step2Map.jsx');
const source = fs.readFileSync(mapPath, 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

const runtimeFiles = [];
function collectRuntimeFiles(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) collectRuntimeFiles(fullPath);
    else if (/\.(?:js|jsx|html|css)$/.test(entry.name)) runtimeFiles.push(fullPath);
  }
}
collectRuntimeFiles(path.join(root, 'src'));
runtimeFiles.push(path.join(root, 'index.html'), path.join(root, 'volantinipro-final.jsx'));

// Caso A: nessun runtime Leaflet, CSS o marker viene caricato da CDN.
for (const file of runtimeFiles) {
  const content = fs.readFileSync(file, 'utf8');
  assert.doesNotMatch(content, /(?:unpkg\.com|cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com)[^'"\s]*leaflet/i, `Leaflet CDN trovato in ${path.relative(root, file)}`);
}
assert.doesNotMatch(source, /createElement\(['"](?:script|link)['"]\)[\s\S]{0,300}leaflet/i);
assert.doesNotMatch(source, /window\.L\b/);

// Caso B: libreria e CSS sono risolti dal progetto già dipendente da Leaflet.
assert.equal(Boolean(packageJson.dependencies?.leaflet), true);
assert.match(source, /import L from ['"]leaflet['"]/);
assert.match(source, /import ['"]leaflet\/dist\/leaflet\.css['"]/);

// Caso C: gli asset marker standard sono import Vite locali, mai URL remoti.
for (const asset of ['marker-icon-2x.png', 'marker-icon.png', 'marker-shadow.png']) {
  assert.match(source, new RegExp(`leaflet/dist/images/${asset.replaceAll('.', '\\.')}`));
}
assert.match(source, /L\.Icon\.Default\.mergeOptions\([\s\S]*iconRetinaUrl:[\s\S]*iconUrl:[\s\S]*shadowUrl:/);

// Casi D/E: cleanup idempotente per StrictMode, unmount e navigazione Step 2/3.
assert.match(source, /cancelAnimationFrame\(resizeFrame\)/);
assert.match(source, /cancelAnimationFrame\(readyFrame\)/);
assert.match(source, /resizeObserver\?\.disconnect\(\)/);
assert.match(source, /map\.off\('zoomend'/);
assert.match(source, /map\.off\('click'/);
assert.match(source, /map\.stop\(\)/);
assert.match(source, /map\.remove\(\)/);
assert.match(source, /mapRef\.current = null/);
assert.match(source, /L\.Canvas\.include\([\s\S]*!this\._ctx \|\| !this\._container/);

// Caso F: errore di inizializzazione contenuto e stato accessibile non tecnico.
assert.match(source, /catch \(error\)[\s\S]*setMapInitError\(true\)/);
assert.match(source, /role="alert"/);
assert.match(source, /La mappa non è temporaneamente disponibile\./);
assert.match(source, /I dati della zona restano disponibili\./);
assert.doesNotMatch(source, /mapInitError[\s\S]{0,300}(?:error\.stack|stack trace)/i);

// Caso G: tile remote invariate; nessun tileerror viene promosso a errore globale.
assert.match(source, /L\.tileLayer\(/);
assert.doesNotMatch(source, /tileerror[\s\S]{0,200}setMapInitError/i);

console.log('Step 2 P2-C Leaflet runtime reliability: PASS');
