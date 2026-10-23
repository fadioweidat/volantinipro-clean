// Runs the official `npm test` suite listed in tests/suite.list. The list used to live
// inline in package.json, but past ~8.000 characters cmd.exe refused it on Windows
// ("The command line is too long"). Here node is spawned directly (no shell), so the
// file list no longer goes through cmd. Same flags and same order as before.
import { readFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';

const files = readFileSync(new URL('../tests/suite.list', import.meta.url), 'utf8')
  .split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
const missing = files.filter((file) => !existsSync(file));
if (missing.length) {
  console.error('[npm test] file elencati in tests/suite.list ma assenti:', missing.join(', '));
  process.exit(1);
}
const child = spawn(process.execPath, ['--import', 'tsx', '--test', ...files], { stdio: 'inherit', shell: false });
child.on('exit', (code, signal) => process.exit(signal ? 1 : code ?? 1));
child.on('error', (error) => { console.error('[npm test] impossibile avviare node --test:', error); process.exit(1); });
