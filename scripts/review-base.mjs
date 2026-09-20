// Risolve in modo sicuro e di SOLA LETTURA la base di confronto per le review (sicurezza/codice).
//
//   node scripts/review-base.mjs [--base <ref>] [--cwd <dir>]
//
// NON dipende da origin/HEAD e non crea, aggiorna o cancella mai riferimenti git: usa solo comandi git di
// lettura (rev-parse, symbolic-ref in sola lettura, merge-base, rev-list --count, status --porcelain),
// invocati con spawnSync e argv espliciti, senza shell.
//
// Ordine di risoluzione (nessun ripiego silenzioso):
//   1. --base <ref>        se non risolve => BLOCKED (exit 2), mai fallback
//   2. @{upstream}
//   3. origin/<ramo corrente>   (con HEAD staccato non si inventa nessun ramo)
//   4. origin/main, origin/master, main, master: se i candidati risolvono a commit DIVERSI => AMBIGUOUS (exit 2);
//      se tutti risolvono allo stesso commit => si usa quel commit
//   5. nessun candidato => BLOCKED (exit 2)
// Dopo la scelta, il merge-base con HEAD deve esistere, altrimenti BLOCKED.
//
// Output: righe CHIAVE=VALORE (una per riga). Exit code: 0 = OK; 2 = BLOCKED, AMBIGUOUS o errore d'uso.
import { spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';

const FALLBACK_CANDIDATES = ['origin/main', 'origin/master', 'main', 'master'];

// Neutralizza caratteri di controllo (newline inclusi) nei testi ripetuti in output: un argomento ostile
// non puo' iniettare righe CHIAVE=VALORE aggiuntive.
function sanitize(text) {
  return [...String(text)].map((ch) => {
    const code = ch.charCodeAt(0);
    return code < 32 || code === 127 ? ' ' : ch;
  }).join('');
}

function emit(lines, exitCode) {
  process.stdout.write(lines.join('\n') + '\n');
  process.exitCode = exitCode;
}

function blocked(reason, extra = []) {
  emit(['STATUS=BLOCKED', 'REASON=' + sanitize(reason), ...extra], 2);
}

function parseArgs(argv) {
  const options = { base: null, cwd: process.cwd() };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--base') {
      if (i + 1 >= argv.length) return { error: 'usage: --base richiede un valore' };
      options.base = argv[i + 1];
      i += 1;
    } else if (arg.startsWith('--base=')) {
      options.base = arg.slice('--base='.length);
    } else if (arg === '--cwd') {
      if (i + 1 >= argv.length) return { error: 'usage: --cwd richiede un valore' };
      options.cwd = argv[i + 1];
      i += 1;
    } else {
      return { error: 'usage: argomento non riconosciuto ' + JSON.stringify(arg) + ' (usare [--base <ref>] [--cwd <dir>])' };
    }
  }
  return { options };
}

function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.error) return blocked(parsed.error);
  const { options } = parsed;

  let cwdIsDirectory = false;
  try { cwdIsDirectory = statSync(options.cwd).isDirectory(); } catch { cwdIsDirectory = false; }
  if (!cwdIsDirectory) return blocked('directory non trovata: ' + options.cwd);

  const run = (cwd, args) => spawnSync('git', ['-c', 'core.fsmonitor=false', '--no-optional-locks', ...args], {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' },
  });
  const text = (result) => String(result.stdout || '').replace(/\r?\n$/, '');

  const top = run(options.cwd, ['rev-parse', '--show-toplevel']);
  if (top.error) return blocked('git non disponibile: ' + top.error.message);
  if (top.status !== 0) return blocked('non e\' un repository git: ' + options.cwd);
  const root = text(top);
  const git = (args) => run(root, args);

  // Un riferimento e' valido solo se peela a un commit; --end-of-options impedisce di leggerlo come opzione.
  const verify = (ref) => {
    const result = git(['rev-parse', '--verify', '--quiet', '--end-of-options', ref + '^{commit}']);
    return result.status === 0 && text(result) ? text(result) : null;
  };

  const headSha = verify('HEAD');
  if (!headSha) return blocked('HEAD non risolve a un commit (repository senza commit?)');

  // Avvisi non bloccanti ma SEMPRE visibili (es. upstream configurato ma non risolvibile e quindi ignorato).
  const warnings = [];

  function choose(source, baseRef, baseSha, sharedRefs = []) {
    const mb = git(['merge-base', '--end-of-options', baseSha, headSha]);
    if (mb.status === 1) return blocked('nessun merge-base fra ' + baseRef + ' e HEAD (storie non correlate)');
    if (mb.status !== 0 || !text(mb)) return blocked('merge-base non calcolabile per ' + baseRef);
    const mergeBase = text(mb);
    const count = git(['rev-list', '--count', mergeBase + '..' + headSha]);
    if (count.status !== 0 || !/^\d+$/.test(text(count))) return blocked('COMMITS_AHEAD non calcolabile');
    const dirty = git(['status', '--porcelain', '--untracked-files=no']);
    if (dirty.status !== 0) return blocked('stato del worktree non leggibile');
    const lines = [
      'STATUS=OK',
      'SOURCE=' + source,
      'BASE_REF=' + sanitize(baseRef),
      'BASE_SHA=' + baseSha,
      'HEAD_SHA=' + headSha,
      'MERGE_BASE=' + mergeBase,
      'COMMITS_AHEAD=' + text(count),
      'DIRTY_WORKTREE=' + String(text(dirty) !== ''),
      'DIFF_COMMAND=git diff ' + mergeBase + '...HEAD',
      'LOG_COMMAND=git log --oneline ' + mergeBase + '..HEAD',
    ];
    if (sharedRefs.length > 1) lines.push('SHARED_REFS=' + sharedRefs.join(','));
    for (const warning of warnings) lines.push('WARNING=' + sanitize(warning));
    return emit(lines, 0);
  }

  // 1. base esplicita: mai ripiego
  if (options.base !== null) {
    const sha = verify(options.base);
    if (!sha) return blocked('base esplicita non valida: ' + JSON.stringify(options.base) + ' non risolve a un commit');
    return choose('explicit', options.base, sha);
  }

  // 2. upstream configurato (qualunque errore = nessun upstream, si prosegue)
  const upstream = git(['rev-parse', '--symbolic-full-name', '@{upstream}']);
  if (upstream.status === 0 && text(upstream)) {
    const full = text(upstream);
    const sha = verify(full);
    if (sha) return choose('upstream', full.replace(/^refs\/remotes\//, '').replace(/^refs\/heads\//, ''), sha);
    warnings.push('upstream ' + full + ' configurato ma non risolve a un commit: ignorato');
  } else if (!/no upstream configured|does not point to a branch/i.test(String(upstream.stderr || ''))) {
    const detail = String(upstream.stderr || '').split(/\r?\n/).find((line) => line.trim()) || 'errore sconosciuto';
    warnings.push('upstream configurato ma non risolvibile (' + detail.trim() + '): ignorato');
  }

  // 3. origin/<ramo corrente> (riferimento completo: evita ombre da tag omonimi); HEAD staccato => si salta
  // riferimento completo (non --short): un tag omonimo non deve alterare il nome del ramo
  const branch = git(['symbolic-ref', '--quiet', 'HEAD']);
  if (branch.status === 0 && text(branch).startsWith('refs/heads/')) {
    const name = text(branch).slice('refs/heads/'.length);
    const sha = verify('refs/remotes/origin/' + name);
    if (sha) return choose('origin-branch', 'origin/' + name, sha);
  }

  // 4. candidati di ripiego, raggruppati per commit
  const groups = new Map();
  for (const name of FALLBACK_CANDIDATES) {
    const full = name.startsWith('origin/') ? 'refs/remotes/' + name : 'refs/heads/' + name;
    const sha = verify(full);
    if (sha) groups.set(sha, [...(groups.get(sha) || []), name]);
  }
  if (groups.size === 0) {
    return blocked('nessuna base trovata (provati upstream, origin/<ramo>, ' + FALLBACK_CANDIDATES.join(', ') + '): usare --base <ref>');
  }
  if (groups.size > 1) {
    const candidates = [...groups].map(([sha, names]) => 'CANDIDATE=' + sha + ':' + names.join(','));
    return emit(['STATUS=AMBIGUOUS', 'REASON=piu\' candidati di ripiego risolvono a commit diversi: usare --base <ref>', ...candidates], 2);
  }
  const [[sha, names]] = [...groups];
  return choose('fallback', names[0], sha, names);
}

try {
  main();
} catch (error) {
  blocked('errore interno: ' + (error && error.message ? error.message : String(error)));
}
