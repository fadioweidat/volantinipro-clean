import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = process.cwd();
const TEST_DIR = join(ROOT, 'tests');
const BATCH_SIZE = 40;
const TEST_RE = /\.test\.(?:mjs|cjs|js|mts|cts|ts)$/i;

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else if (entry.isFile() && TEST_RE.test(entry.name)) files.push(full);
  }
  return files;
}

function runBatch(files, index, total) {
  return new Promise((resolve) => {
    const shown = files.map((f) => relative(ROOT, f));
    console.log('\n[test:all] batch ' + index + '/' + total + ' — ' + shown.length + ' file');
    const child = spawn(process.execPath, ['--import', 'tsx', '--test', ...shown], { cwd: ROOT, stdio: 'inherit', shell: false });
    child.on('exit', (code, signal) => {
      if (signal) {
        console.error('[test:all] batch ' + index + ' terminato da segnale ' + signal);
        resolve(1);
      } else {
        resolve(code ?? 1);
      }
    });
    child.on('error', (error) => {
      console.error('[test:all] impossibile avviare batch ' + index + ':', error);
      resolve(1);
    });
  });
}

const all = (await walk(TEST_DIR)).sort();
if (all.length === 0) {
  console.error('[test:all] nessun file *.test.* trovato in tests/');
  process.exit(1);
}

console.log('[test:all] trovati ' + all.length + ' test file. Esecuzione completa in batch da ' + BATCH_SIZE + '.');
let failedBatches = 0;
const totalBatches = Math.ceil(all.length / BATCH_SIZE);
for (let i = 0; i < all.length; i += BATCH_SIZE) {
  const code = await runBatch(all.slice(i, i + BATCH_SIZE), Math.floor(i / BATCH_SIZE) + 1, totalBatches);
  if (code !== 0) failedBatches += 1;
}

if (failedBatches > 0) {
  console.error('\n[test:all] FAIL — ' + failedBatches + '/' + totalBatches + ' batch con almeno un test fallito.');
  process.exit(1);
}

console.log('\n[test:all] PASS — tutti i ' + all.length + ' test file eseguiti.');
