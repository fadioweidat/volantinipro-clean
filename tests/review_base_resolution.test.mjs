// Test di scripts/review-base.mjs (risoluzione della base per le review).
// Tutti i test usano repository git temporanei e isolati (nessuna rete, nessun riferimento di QUESTO repository
// viene toccato) con configurazione git globale/di sistema disattivata.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('../scripts/review-base.mjs', import.meta.url));
const ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t',
  GIT_TERMINAL_PROMPT: '0',
};
const tempDirs = [];
after(() => { for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true }); });

const git = (cwd, ...args) => execFileSync('git', args, { cwd, env: ENV, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).replace(/\r?\n$/, '');
const tempDir = (label = 'rb 617 ') => { const dir = mkdtempSync(join(tmpdir(), label)); tempDirs.push(dir); return dir; };

// Repository con due commit su "main" (c1 poi c2); il nome della directory contiene uno spazio di proposito.
function mkRepo() {
  const dir = tempDir();
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'core.autocrlf', 'false');
  git(dir, 'config', 'remote.origin.url', dir);
  git(dir, 'config', 'remote.origin.fetch', '+refs/heads/*:refs/remotes/origin/*');
  git(dir, 'commit', '--allow-empty', '-q', '-m', 'c1');
  const c1 = git(dir, 'rev-parse', 'HEAD');
  git(dir, 'commit', '--allow-empty', '-q', '-m', 'c2');
  const c2 = git(dir, 'rev-parse', 'HEAD');
  return { dir, c1, c2 };
}
const setRef = (dir, ref, sha) => git(dir, 'update-ref', ref, sha);

function run(dir, args = [], extraEnv = {}) {
  const sandbox = tempDir('rb sandbox ');
  const result = spawnSync(process.execPath, [SCRIPT, '--cwd', dir, ...args], { cwd: sandbox, env: { ...ENV, ...extraEnv }, encoding: 'utf8' });
  const lines = result.stdout.split(/\r?\n/).filter(Boolean);
  const map = {};
  for (const line of lines) {
    const at = line.indexOf('=');
    assert.ok(at > 0, 'ogni riga di output e CHIAVE=VALORE: ' + JSON.stringify(line));
    const key = line.slice(0, at);
    map[key] = key in map ? map[key] + '\n' + line.slice(at + 1) : line.slice(at + 1);
  }
  return { status: result.status, out: map, lines, stdout: result.stdout, stderr: result.stderr, sandbox };
}
const snapshot = (dir) => ({
  refs: git(dir, 'for-each-ref'),
  head: git(dir, 'rev-parse', 'HEAD'),
  status: git(dir, 'status', '--porcelain'),
});

test('A: explicit valid --base is selected exactly', () => {
  const { dir, c1 } = mkRepo();
  git(dir, 'branch', 'topic', c1);
  const r = run(dir, ['--base', 'topic']);
  assert.equal(r.status, 0);
  assert.equal(r.out.STATUS, 'OK');
  assert.equal(r.out.SOURCE, 'explicit');
  assert.equal(r.out.BASE_REF, 'topic');
  assert.equal(r.out.BASE_SHA, c1);
  assert.equal(r.out.MERGE_BASE, c1);
  assert.equal(r.out.COMMITS_AHEAD, '1');
  assert.equal(r.out.DIFF_COMMAND, 'git diff ' + c1 + '...HEAD');
});

test('B: explicit invalid --base is BLOCKED and never falls back', () => {
  const { dir, c1 } = mkRepo();
  setRef(dir, 'refs/remotes/origin/main', c1);
  git(dir, 'config', 'branch.main.remote', 'origin');
  git(dir, 'config', 'branch.main.merge', 'refs/heads/main');
  // senza --base questo repo risolverebbe l'upstream: con una base esplicita invalida NON deve
  assert.equal(run(dir).out.STATUS, 'OK');
  const r = run(dir, ['--base', 'nope']);
  assert.equal(r.status, 2);
  assert.equal(r.out.STATUS, 'BLOCKED');
  assert.match(r.out.REASON, /nope/);
  assert.equal(r.out.SOURCE, undefined);
  assert.equal(r.out.BASE_SHA, undefined);
});

test('C: configured upstream wins over every fallback candidate', () => {
  const { dir, c1, c2 } = mkRepo();
  setRef(dir, 'refs/remotes/origin/main', c1);
  setRef(dir, 'refs/remotes/origin/master', c2);
  git(dir, 'config', 'branch.main.remote', 'origin');
  git(dir, 'config', 'branch.main.merge', 'refs/heads/main');
  const r = run(dir);
  assert.equal(r.status, 0);
  assert.equal(r.out.SOURCE, 'upstream');
  assert.equal(r.out.BASE_REF, 'origin/main');
  assert.equal(r.out.BASE_SHA, c1);
});

test('D: no upstream, origin/<current-branch> is selected before the fallbacks', () => {
  const { dir, c1, c2 } = mkRepo();
  git(dir, 'checkout', '-q', '-b', 'feature');
  setRef(dir, 'refs/remotes/origin/feature', c1);
  setRef(dir, 'refs/remotes/origin/main', c2);
  const r = run(dir);
  assert.equal(r.status, 0);
  assert.equal(r.out.SOURCE, 'origin-branch');
  assert.equal(r.out.BASE_REF, 'origin/feature');
  assert.equal(r.out.BASE_SHA, c1);
});

test('E: conflicting origin/main and origin/master are AMBIGUOUS (exit 2) and neither is chosen', () => {
  const { dir, c1, c2 } = mkRepo();
  git(dir, 'checkout', '-q', '-b', 'work');
  git(dir, 'branch', '-D', 'main');
  setRef(dir, 'refs/remotes/origin/main', c1);
  setRef(dir, 'refs/remotes/origin/master', c2);
  const r = run(dir);
  assert.equal(r.status, 2);
  assert.equal(r.out.STATUS, 'AMBIGUOUS');
  assert.equal(r.out.BASE_SHA, undefined);
  assert.equal(r.out.SOURCE, undefined);
  assert.match(r.out.CANDIDATE, new RegExp(c1 + ':origin/main'));
  assert.match(r.out.CANDIDATE, new RegExp(c2 + ':origin/master'));
  // E2: anche se una storia e' antenata dell'altra resta ambiguo
  setRef(dir, 'refs/remotes/origin/main', c2);
  setRef(dir, 'refs/remotes/origin/master', c1);
  const r2 = run(dir);
  assert.equal(r2.status, 2);
  assert.equal(r2.out.STATUS, 'AMBIGUOUS');
});

test('E3: same-commit refs collapse into one candidate but a different one still makes it AMBIGUOUS', () => {
  const { dir, c1, c2 } = mkRepo();
  git(dir, 'checkout', '-q', '-b', 'work'); // main locale resta a c2
  setRef(dir, 'refs/remotes/origin/main', c2);
  setRef(dir, 'refs/remotes/origin/master', c1);
  const r = run(dir);
  assert.equal(r.status, 2);
  assert.equal(r.out.STATUS, 'AMBIGUOUS');
  assert.match(r.out.CANDIDATE, new RegExp(c2 + ':origin/main,main'));
  assert.match(r.out.CANDIDATE, new RegExp(c1 + ':origin/master'));
});

test('F: a single safe fallback is selected', () => {
  const { dir, c2 } = mkRepo();
  git(dir, 'checkout', '-q', '-b', 'work');
  const r = run(dir);
  assert.equal(r.status, 0);
  assert.equal(r.out.SOURCE, 'fallback');
  assert.equal(r.out.BASE_REF, 'main');
  assert.equal(r.out.BASE_SHA, c2);
  // F2: origin/main e main allo stesso commit sono lo stesso candidato
  setRef(dir, 'refs/remotes/origin/main', c2);
  const r2 = run(dir);
  assert.equal(r2.status, 0);
  assert.equal(r2.out.SOURCE, 'fallback');
  assert.equal(r2.out.BASE_REF, 'origin/main');
  assert.equal(r2.out.SHARED_REFS, 'origin/main,main');
});

test('G: no candidates => BLOCKED (also empty repository and not-a-repository)', () => {
  const { dir } = mkRepo();
  git(dir, 'branch', '-m', 'trunk');
  const r = run(dir);
  assert.equal(r.status, 2);
  assert.equal(r.out.STATUS, 'BLOCKED');
  assert.match(r.out.REASON, /nessuna base trovata/);
  // G2: repository senza commit
  const empty = tempDir();
  git(empty, 'init', '-q', '-b', 'main');
  const r2 = run(empty);
  assert.equal(r2.status, 2);
  assert.equal(r2.out.STATUS, 'BLOCKED');
  assert.match(r2.out.REASON, /HEAD non risolve/);
  // G3: non e' un repository (il soffitto impedisce di risalire a un repository nella home)
  const plain = tempDir('rb plain ');
  const r3 = run(plain, [], { GIT_CEILING_DIRECTORIES: join(plain, '..') });
  assert.equal(r3.status, 2);
  assert.equal(r3.out.STATUS, 'BLOCKED');
  assert.match(r3.out.REASON, /non e' un repository git/);
});

test('H: a selected ref without merge-base with HEAD is BLOCKED, never OK', () => {
  const { dir } = mkRepo();
  git(dir, 'checkout', '-q', '--orphan', 'orph');
  git(dir, 'commit', '--allow-empty', '-q', '-m', 'o');
  const head = git(dir, 'rev-parse', 'HEAD');
  for (const args of [[], ['--base', 'main']]) {
    const r = run(dir, args);
    assert.equal(r.status, 2, JSON.stringify(args));
    assert.equal(r.out.STATUS, 'BLOCKED');
    assert.match(r.out.REASON, /merge-base/);
    assert.equal(r.out.MERGE_BASE, undefined);
  }
  assert.equal(git(dir, 'rev-parse', 'HEAD'), head);
});

test('I: detached HEAD does not crash, invents no branch, and applies the fallback rules', () => {
  const { dir, c1 } = mkRepo();
  git(dir, 'checkout', '-q', '--detach');
  git(dir, 'branch', '-D', 'main');
  setRef(dir, 'refs/remotes/origin/main', c1);
  // un origin/HEAD-like nome di ramo inventato ("HEAD") non deve mai essere usato
  setRef(dir, 'refs/remotes/origin/HEAD', git(dir, 'rev-parse', 'HEAD'));
  const r = run(dir);
  assert.equal(r.status, 0);
  assert.equal(r.out.SOURCE, 'fallback');
  assert.equal(r.out.BASE_REF, 'origin/main');
  assert.equal(r.out.BASE_SHA, c1);
  assert.doesNotMatch(r.stdout + r.stderr, /fatal/i);
});

test('J: unusual explicit arguments are plain git arguments and are never shell-executed', () => {
  const { dir, c1 } = mkRepo();
  const canaryName = 'canary-pwned.txt';
  const nodeWrite = 'node -e "require(\'fs\').writeFileSync(\'' + canaryName + '\',\'1\')"';
  const hostile = [
    'x; ' + nodeWrite,
    '$(' + nodeWrite + ')',
    '`' + nodeWrite + '`',
    'x && ' + nodeWrite,
    'x | ' + nodeWrite,
    '--upload-pack=' + nodeWrite,
    'a\nSTATUS=OK',
    '--',
    '',
  ];
  for (const arg of hostile) {
    const r = run(dir, ['--base', arg]);
    assert.equal(r.status, 2, JSON.stringify(arg));
    assert.equal(r.out.STATUS, 'BLOCKED');
    assert.equal(r.lines.filter((l) => l === 'STATUS=OK').length, 0, 'nessuna riga iniettata: ' + JSON.stringify(arg));
    assert.equal(r.lines.filter((l) => l.startsWith('STATUS=')).length, 1);
    assert.equal(existsSync(join(dir, canaryName)), false);
    assert.equal(existsSync(join(r.sandbox, canaryName)), false);
    assert.equal(existsSync(join(process.cwd(), canaryName)), false);
  }
  // un ref valido che inizia con '-' e' un argomento git normale (portabile: creato con update-ref)
  setRef(dir, 'refs/heads/-x', c1);
  const ok = run(dir, ['--base', '-x']);
  assert.equal(ok.status, 0);
  assert.equal(ok.out.SOURCE, 'explicit');
  assert.equal(ok.out.BASE_SHA, c1);
  // uso scorretto
  const usage = run(dir, ['--base']);
  assert.equal(usage.status, 2);
  assert.match(usage.out.REASON, /usage/);
  const unknown = run(dir, ['--nope']);
  assert.equal(unknown.status, 2);
  assert.match(unknown.out.REASON, /usage/);
});

// Su POSIX una directory puo' contenere un newline: il percorso ripetuto in REASON non deve poter iniettare righe.
// (Su Windows i nomi di directory non possono contenere newline: il caso non e' raggiungibile e viene saltato.)
test('J2: a directory name with a newline cannot inject KEY=VALUE lines into the output', { skip: process.platform === 'win32' }, () => {
  const plain = tempDir('rb nl ');
  const hostileDir = join(plain, 'sub\nSTATUS=OK');
  mkdirSync(hostileDir);
  const r = run(hostileDir, [], { GIT_CEILING_DIRECTORIES: plain });
  assert.equal(r.status, 2);
  assert.equal(r.lines.filter((l) => l === 'STATUS=OK').length, 0);
  assert.equal(r.lines.filter((l) => l.startsWith('STATUS=')).length, 1);
});
test('K: the resolver never alters refs, HEAD or the worktree (OK, AMBIGUOUS and BLOCKED paths)', () => {
  const okRepo = mkRepo();
  git(okRepo.dir, 'branch', 'topic', okRepo.c1);
  const ambiguous = mkRepo();
  git(ambiguous.dir, 'checkout', '-q', '-b', 'work');
  git(ambiguous.dir, 'branch', '-D', 'main');
  setRef(ambiguous.dir, 'refs/remotes/origin/main', ambiguous.c1);
  setRef(ambiguous.dir, 'refs/remotes/origin/master', ambiguous.c2);
  const blockedRepo = mkRepo();
  const dirty = mkRepo();
  writeFileSync(join(dirty.dir, 'tracked.txt'), 'one');
  git(dirty.dir, 'add', 'tracked.txt');
  git(dirty.dir, 'commit', '-q', '-m', 'tracked');
  git(dirty.dir, 'branch', 'topic', dirty.c1);
  writeFileSync(join(dirty.dir, 'tracked.txt'), 'two');
  writeFileSync(join(dirty.dir, 'untracked.txt'), 'u');
  const scenarios = [
    { name: 'OK', repo: okRepo, args: ['--base', 'topic'], code: 0 },
    { name: 'AMBIGUOUS', repo: ambiguous, args: [], code: 2 },
    { name: 'BLOCKED', repo: blockedRepo, args: ['--base', 'nope'], code: 2 },
    { name: 'DIRTY', repo: dirty, args: ['--base', 'topic'], code: 0 },
  ];
  for (const s of scenarios) {
    const before = snapshot(s.repo.dir);
    const r = run(s.repo.dir, s.args);
    assert.equal(r.status, s.code, s.name);
    assert.deepEqual(snapshot(s.repo.dir), before, s.name + ': refs/HEAD/status invariati');
    assert.equal(existsSync(join(s.repo.dir, '.git', 'index.lock')), false);
    if (s.name === 'DIRTY') {
      assert.equal(r.out.DIRTY_WORKTREE, 'true');
      assert.equal(readFileSync(join(s.repo.dir, 'tracked.txt'), 'utf8'), 'two');
    }
  }
  // file non tracciati non rendono sporco il worktree (--untracked-files=no)
  const clean = mkRepo();
  git(clean.dir, 'branch', 'topic', clean.c1);
  writeFileSync(join(clean.dir, 'untracked.txt'), 'u');
  assert.equal(run(clean.dir, ['--base', 'topic']).out.DIRTY_WORKTREE, 'false');
});

test('L: a configured but unresolvable (stale) upstream is reported as a visible WARNING, never silently ignored', () => {
  const { dir, c1 } = mkRepo();
  git(dir, 'config', 'branch.main.remote', 'origin');
  git(dir, 'config', 'branch.main.merge', 'refs/heads/gone'); // nessun refs/remotes/origin/gone
  git(dir, 'checkout', '-q', '-b', 'work');
  git(dir, 'config', 'branch.work.remote', 'origin');
  git(dir, 'config', 'branch.work.merge', 'refs/heads/gone');
  const r = run(dir);
  assert.equal(r.status, 0);
  assert.equal(r.out.SOURCE, 'fallback');
  assert.equal(r.out.BASE_REF, 'main');
  assert.match(r.out.WARNING, /upstream configurato ma non risolvibile/);
  // senza upstream configurato nessun avviso
  const plain = mkRepo();
  git(plain.dir, 'checkout', '-q', '-b', 'work');
  assert.equal(run(plain.dir).out.WARNING, undefined);
  assert.ok(c1);
});

test('M: an upstream that is a local branch (remote ".") is resolved as the upstream', () => {
  const { dir, c1 } = mkRepo();
  git(dir, 'branch', 'base', c1);
  git(dir, 'config', 'branch.main.remote', '.');
  git(dir, 'config', 'branch.main.merge', 'refs/heads/base');
  const r = run(dir);
  assert.equal(r.status, 0);
  assert.equal(r.out.SOURCE, 'upstream');
  assert.equal(r.out.BASE_REF, 'base');
  assert.equal(r.out.BASE_SHA, c1);
});

test('N: a tag named like the current branch does not break origin/<branch> resolution', () => {
  const { dir, c1, c2 } = mkRepo();
  git(dir, 'checkout', '-q', '-b', 'release');
  git(dir, 'tag', 'release', c2);
  setRef(dir, 'refs/remotes/origin/release', c1);
  const r = run(dir);
  assert.equal(r.status, 0);
  assert.equal(r.out.SOURCE, 'origin-branch');
  assert.equal(r.out.BASE_REF, 'origin/release');
  assert.equal(r.out.BASE_SHA, c1);
});

test('O: a nonexistent --cwd is reported as a missing directory, not as missing git', () => {
  const { dir } = mkRepo();
  const r = run(dir, ['--cwd', join(dir, 'does-not-exist')]);
  assert.equal(r.status, 2);
  assert.equal(r.out.STATUS, 'BLOCKED');
  assert.match(r.out.REASON, /directory non trovata/);
  assert.doesNotMatch(r.out.REASON, /git non disponibile/);
});

test('a tag with the same short name cannot shadow the remote-tracking fallback (full ref names are verified)', () => {
  const { dir, c1, c2 } = mkRepo();
  git(dir, 'branch', '-m', 'trunk');
  setRef(dir, 'refs/remotes/origin/main', c1);
  setRef(dir, 'refs/tags/origin/main', c2);
  const r = run(dir);
  assert.equal(r.status, 0);
  assert.equal(r.out.BASE_SHA, c1);
});

test('static guard: the script only uses read-only git subcommands, no shell', () => {
  const source = readFileSync(SCRIPT, 'utf8');
  const forbidden = ['fetch', 'checkout', 'switch', 'reset', 'update-ref', 'set-head', 'pull', 'push', 'commit', 'merge', 'rebase', 'branch', 'gc', 'clone', 'config', 'tag', 'remote', 'symbolic-ref-write'];
  for (const verb of forbidden) {
    assert.doesNotMatch(source, new RegExp('[\'"]' + verb + '[\'"]'), 'verbo git non ammesso tra gli argomenti: ' + verb);
  }
  assert.match(source, /spawnSync\('git'/);
  assert.doesNotMatch(source, /shell\s*:\s*true/);
  assert.doesNotMatch(source, /\bexecSync\s*\(|\bexec\s*\(/);
  // symbolic-ref solo in lettura: sempre con --quiet HEAD e nessun secondo argomento posizionale
  const uses = source.match(/'symbolic-ref'[^\]]*\]/g) || [];
  assert.equal(uses.length, 1);
  assert.match(uses[0], /'symbolic-ref', '--quiet', 'HEAD'\]/);
});
