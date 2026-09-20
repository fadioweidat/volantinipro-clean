// Test di scripts/check-review-ledger.mjs (validatore del ledger della review HIGH).
// Il ledger e' evidenza della FORMA del workflow, non della qualita' del ragionamento: i test verificano che
// un ledger incoerente (finder mancanti, verifier assenti, verdetti nei risultati finali, ecc.) fallisca sempre.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('../scripts/check-review-ledger.mjs', import.meta.url));
const TMP = mkdtempSync(join(tmpdir(), 'ledger '));
after(() => rmSync(TMP, { recursive: true, force: true }));

const ANGLES = ['correctness', 'security', 'data_integrity', 'concurrency', 'tests_contracts', 'error_handling', 'performance', 'integration'];
const T0 = Date.parse('2026-01-01T10:00:00.000Z');
const iso = (seconds) => new Date(T0 + seconds * 1000).toISOString();
let counter = 0;

// Ledger minimo valido: 8 finder sovrapposti (fini sfalsate), nessun candidato.
function baseLedger() {
  return {
    schema_version: 1,
    review_id: 'r-1',
    effort: 'HIGH',
    base_ref: 'origin/main',
    base_sha: 'a'.repeat(40),
    merge_base: 'b'.repeat(40),
    head_sha: 'c'.repeat(40),
    concurrency_expected: true,
    invocation_ids_available: true,
    finders_requested: 8,
    finders: ANGLES.map((angle, i) => ({
      finder_id: 'F' + (i + 1),
      agent_invocation_id: 'inv-f' + (i + 1),
      agent_type: 'general-purpose',
      angle,
      requested_at: iso(0),
      started_at: iso(1 + i),
      completed_at: iso(60 + i * 3),
      status: 'completed',
      harness_duration_ms: 59000,
      raw_candidate_ids: [],
    })),
    raw_candidates: [],
    deduplicated_candidates: [],
    verifiers: [],
    final_findings: [],
  };
}

// Aggiunge candidati: specs = [{ verdict, raws: 1 }] -> raw R<i>-<k> sui finder F1.., candidato C<i>, verifier V<i>.
function withCandidates(ledger, specs) {
  const l = structuredClone(ledger);
  specs.forEach((spec, index) => {
    const n = index + 1;
    const finder = l.finders[index % 8];
    const merged = [];
    for (let k = 1; k <= (spec.raws || 1); k += 1) {
      const rawId = 'R' + n + '-' + k;
      merged.push(rawId);
      l.raw_candidates.push({ raw_id: rawId, finder_id: finder.finder_id });
      finder.raw_candidate_ids.push(rawId);
    }
    l.deduplicated_candidates.push({ candidate_id: 'C' + n, merged_from: merged, severity: 'high', file: 'src/a.mjs', line_or_range: '10-12', summary: 's' + n });
    l.verifiers.push({
      verifier_id: 'V' + n,
      agent_invocation_id: 'inv-v' + n,
      agent_type: 'general-purpose',
      candidate_id: 'C' + n,
      requested_at: iso(200 + n),
      started_at: iso(201 + n),
      completed_at: iso(230 + n),
      status: 'completed',
      verdict: spec.verdict,
    });
    if (spec.verdict === 'CONFIRMED') l.final_findings.push('C' + n);
  });
  return l;
}

function runPath(path, extra = []) {
  const result = spawnSync(process.execPath, [SCRIPT, path, ...extra], { encoding: 'utf8' });
  const lines = result.stdout.split(/\r?\n/).filter(Boolean);
  return { status: result.status, first: lines[0], reasons: lines.slice(1), stdout: result.stdout, stderr: result.stderr };
}
function run(ledger) {
  const path = join(TMP, 'ledger-' + counter++ + '.json');
  writeFileSync(path, typeof ledger === 'string' ? ledger : JSON.stringify(ledger));
  return runPath(path);
}
function expectPass(result) {
  assert.equal(result.first, 'WORKFLOW_FIDELITY=PASS', result.reasons.join(' | '));
  assert.equal(result.status, 0);
  assert.deepEqual(result.reasons, []);
}
function expectFail(result, rule) {
  assert.equal(result.first, 'WORKFLOW_FIDELITY=FAIL');
  assert.equal(result.status, 1);
  assert.ok(result.reasons.length > 0);
  assert.ok(result.reasons.every((line) => line.startsWith('REASON=')), 'ogni riga dopo la prima e REASON=');
  assert.ok(result.reasons.some((line) => line.startsWith('REASON=' + rule + ' ')), 'atteso ' + rule + ' in: ' + result.reasons.join(' | '));
}

test('1. valid 8-finder ledger with zero candidates passes', () => expectPass(run(baseLedger())));

test('2. valid ledger with candidates, one verifier each, passes', () => {
  const l = withCandidates(baseLedger(), [{ verdict: 'CONFIRMED' }, { verdict: 'REFUTED' }, { verdict: 'UNCERTAIN' }, { verdict: 'CONFIRMED', raws: 2 }]);
  assert.deepEqual(l.final_findings, ['C1', 'C4']);
  expectPass(run(l));
});

test('3. only 7 finders fails', () => {
  const l = baseLedger();
  l.finders.pop();
  const r = run(l);
  expectFail(r, 'R20');
  assert.ok(r.reasons.some((line) => line.startsWith('REASON=R24 ')), 'anche angolo mancante');
});

test('4. duplicate finder id fails', () => {
  const l = baseLedger();
  l.finders[1].finder_id = 'F1';
  expectFail(run(l), 'R22');
});

test('5. duplicate invocation id fails when ids are available (and is not checked when unavailable)', () => {
  const l = baseLedger();
  l.finders[1].agent_invocation_id = l.finders[0].agent_invocation_id;
  expectFail(run(l), 'R31');
  l.invocation_ids_available = false;
  expectPass(run(l));
});

test('6. missing required angle fails', () => {
  const l = baseLedger();
  l.finders[7].angle = 'style';
  const r = run(l);
  expectFail(r, 'R24');
  assert.ok(r.reasons.some((line) => line.includes('integration')));
  assert.ok(r.reasons.some((line) => line.startsWith('REASON=R23 ')));
});

test('7. duplicate angle fails', () => {
  const l = baseLedger();
  l.finders[7].angle = 'correctness';
  expectFail(run(l), 'R24');
});

test('8. incomplete finder fails (status and missing completed_at)', () => {
  const l = baseLedger();
  l.finders[3].status = 'timeout';
  expectFail(run(l), 'R27');
  const m = baseLedger();
  delete m.finders[3].completed_at;
  expectFail(run(m), 'R28');
});

test('9. invalid timestamps fail (garbage, impossible date, no timezone, null, wrong order)', () => {
  for (const value of ['not-a-date', '2026-02-31T10:00:00Z', '2026-01-01T10:00:00', null, '2026-01-01T24:00:00Z']) {
    const l = baseLedger();
    l.finders[0].started_at = value;
    expectFail(run(l), 'R25');
  }
  const wrongOrder = baseLedger();
  wrongOrder.finders[0].completed_at = iso(0);
  expectFail(run(wrongOrder), 'R25');
});

test('10. concurrency claimed but no overlapping intervals fails; opting out (false) also fails; touching intervals fail', () => {
  const sequential = baseLedger();
  sequential.finders.forEach((f, i) => { f.started_at = iso(i * 100 + 1); f.completed_at = iso(i * 100 + 50); });
  expectFail(run(sequential), 'R33');
  sequential.concurrency_expected = false;
  expectFail(run(sequential), 'R11');
  const touching = baseLedger();
  touching.finders.forEach((f, i) => { f.started_at = iso(i * 10 + 1); f.completed_at = iso(i * 10 + 11); });
  expectFail(run(touching), 'R33');
  const chained = baseLedger();
  chained.finders.forEach((f, i) => { f.started_at = iso(i * 10 + 1); f.completed_at = iso(i * 10 + 12); });
  expectPass(run(chained));
});

test('11. candidate without a verifier fails', () => {
  const l = withCandidates(baseLedger(), [{ verdict: 'REFUTED' }]);
  l.verifiers = [];
  expectFail(run(l), 'R50');
});

test('12. two verifiers for one candidate fail', () => {
  const l = withCandidates(baseLedger(), [{ verdict: 'REFUTED' }]);
  l.verifiers.push({ ...l.verifiers[0], verifier_id: 'V1b', agent_invocation_id: 'inv-v1b' });
  expectFail(run(l), 'R50');
});

test('13. verifier referencing a nonexistent candidate fails', () => {
  const l = withCandidates(baseLedger(), [{ verdict: 'REFUTED' }]);
  l.verifiers.push({ ...l.verifiers[0], verifier_id: 'VX', agent_invocation_id: 'inv-vx', candidate_id: 'CX' });
  expectFail(run(l), 'R51');
});

test('14. duplicate verifier id fails', () => {
  const l = withCandidates(baseLedger(), [{ verdict: 'REFUTED' }, { verdict: 'REFUTED' }]);
  l.verifiers[1].verifier_id = l.verifiers[0].verifier_id;
  expectFail(run(l), 'R53');
});

test('15. invalid verifier verdict fails', () => {
  for (const verdict of ['MAYBE', 'confirmed', undefined]) {
    const l = withCandidates(baseLedger(), [{ verdict: 'REFUTED' }]);
    if (verdict === undefined) delete l.verifiers[0].verdict; else l.verifiers[0].verdict = verdict;
    expectFail(run(l), 'R55');
  }
});

test('16. REFUTED candidate in final_findings fails', () => {
  const l = withCandidates(baseLedger(), [{ verdict: 'REFUTED' }]);
  l.final_findings.push('C1');
  expectFail(run(l), 'R64');
});

test('17. UNCERTAIN candidate in final_findings fails', () => {
  const l = withCandidates(baseLedger(), [{ verdict: 'UNCERTAIN' }]);
  l.final_findings.push('C1');
  expectFail(run(l), 'R64');
});

test('18. CONFIRMED candidate omitted from final_findings fails', () => {
  const l = withCandidates(baseLedger(), [{ verdict: 'CONFIRMED' }]);
  l.final_findings = [];
  expectFail(run(l), 'R63');
});

test('19. duplicate deduplicated candidate id fails', () => {
  const l = withCandidates(baseLedger(), [{ verdict: 'REFUTED' }, { verdict: 'REFUTED' }]);
  l.deduplicated_candidates[1].candidate_id = 'C1';
  expectFail(run(l), 'R40');
});

test('20. malformed or missing base/head/merge-base fails', () => {
  const cases = [
    ['base_sha', 'abc', 'R08'],
    ['base_sha', 'A'.repeat(40), 'R08'],
    ['base_sha', 'a'.repeat(41), 'R08'],
    ['base_sha', 'a'.repeat(40) + String.fromCharCode(10), 'R08'],
    ['head_sha', undefined, 'R09'],
    ['merge_base', 'g'.repeat(40), 'R10'],
    ['base_ref', '', 'R07'],
  ];
  for (const [field, value, rule] of cases) {
    const l = baseLedger();
    if (value === undefined) delete l[field]; else l[field] = value;
    expectFail(run(l), rule);
  }
  const long = baseLedger();
  long.head_sha = 'd'.repeat(64);
  expectPass(run(long));
});

test('21. zero candidates and zero verifiers passes', () => {
  const l = baseLedger();
  assert.equal(l.deduplicated_candidates.length, 0);
  assert.equal(l.verifiers.length, 0);
  expectPass(run(l));
});

test('22. malformed JSON fails safely (exit 1, verdict line, no stack trace)', () => {
  for (const content of ['{"a":', '', 'plain text', '[]', 'null', '123', '"str"']) {
    const r = run(content);
    expectFail(r, 'R02');
    assert.doesNotMatch(r.stderr, /at .*\(.*:\d+:\d+\)/);
  }
});

// ── controlli aggiuntivi ──────────────────────────────────────────────────
test('E1. a finder invocation reused as a verifier fails', () => {
  const l = withCandidates(baseLedger(), [{ verdict: 'REFUTED' }]);
  l.verifiers[0].agent_invocation_id = l.finders[0].agent_invocation_id;
  expectFail(run(l), 'R31');
});

test('E2. verification requested before all finders completed fails; equality passes', () => {
  const l = withCandidates(baseLedger(), [{ verdict: 'REFUTED' }]);
  const lastFinderEnd = Math.max(...l.finders.map((f) => Date.parse(f.completed_at)));
  l.verifiers[0].requested_at = new Date(lastFinderEnd - 1000).toISOString();
  l.verifiers[0].started_at = new Date(lastFinderEnd + 1000).toISOString();
  l.verifiers[0].completed_at = new Date(lastFinderEnd + 2000).toISOString();
  expectFail(run(l), 'R52');
  l.verifiers[0].requested_at = new Date(lastFinderEnd).toISOString();
  expectPass(run(l));
});

test('E3. raw candidate accounting: silent drop, double merge, unknown raw id, finder list mismatch', () => {
  const dropped = withCandidates(baseLedger(), [{ verdict: 'REFUTED', raws: 2 }]);
  dropped.deduplicated_candidates[0].merged_from = ['R1-1'];
  expectFail(run(dropped), 'R38');
  const twice = withCandidates(baseLedger(), [{ verdict: 'REFUTED' }, { verdict: 'REFUTED' }]);
  twice.deduplicated_candidates[1].merged_from.push('R1-1');
  expectFail(run(twice), 'R39');
  const unknown = withCandidates(baseLedger(), [{ verdict: 'REFUTED' }]);
  unknown.deduplicated_candidates[0].merged_from.push('R-none');
  expectFail(run(unknown), 'R38');
  const unlisted = withCandidates(baseLedger(), [{ verdict: 'REFUTED' }]);
  unlisted.finders[0].raw_candidate_ids = [];
  expectFail(run(unlisted), 'R37');
  const orphan = withCandidates(baseLedger(), [{ verdict: 'REFUTED' }]);
  orphan.raw_candidates[0].finder_id = 'F-none';
  expectFail(run(orphan), 'R36');
});

test('E4. effort, finders_requested and schema_version are enforced', () => {
  for (const [field, value, rule] of [['effort', 'MEDIUM', 'R05'], ['effort', 'high', 'R05'], ['finders_requested', 7, 'R06'], ['schema_version', 2, 'R04']]) {
    const l = baseLedger();
    l[field] = value;
    expectFail(run(l), rule);
  }
});

test('E5. nonexistent path and directory path fail with R01', () => {
  expectFail(runPath(join(TMP, 'does-not-exist.json')), 'R01');
  expectFail(runPath(TMP), 'R01');
});

test('E6. a path with spaces and shell metacharacters is passed to fs only (no shell)', () => {
  const marker = join(TMP, 'INJECTED.txt');
  const name = 'a b;&' + '$(node -e 1)' + ".json";
  const path = join(TMP, name);
  writeFileSync(path, JSON.stringify(baseLedger()));
  expectPass(runPath(path));
  assert.equal(existsSync(marker), false);
  const missing = runPath(join(TMP, 'x;touch INJECTED.txt.json'));
  expectFail(missing, 'R01');
  assert.equal(existsSync(marker), false);
  assert.equal(existsSync(join(process.cwd(), 'INJECTED.txt')), false);
});

test('E7. __proto__ / constructor keys and ids cannot pollute or confuse validation', () => {
  const text = JSON.stringify(baseLedger()).replace('{"schema_version"', '{"__proto__":{"polluted":true},"schema_version"');
  expectPass(run(text));
  assert.equal({}.polluted, undefined);
  const l = withCandidates(baseLedger(), [{ verdict: 'CONFIRMED' }]);
  l.finders[0].finder_id = '__proto__';
  l.raw_candidates[0].finder_id = '__proto__';
  l.deduplicated_candidates[0].candidate_id = 'constructor';
  l.verifiers[0].candidate_id = 'constructor';
  l.final_findings = ['constructor'];
  expectPass(run(l));
  const dup = withCandidates(baseLedger(), [{ verdict: 'REFUTED' }, { verdict: 'REFUTED' }]);
  dup.deduplicated_candidates[0].candidate_id = '__proto__';
  dup.deduplicated_candidates[1].candidate_id = '__proto__';
  expectFail(run(dup), 'R40');
});

test('E8. oversized ledger fails without parsing (R01)', () => {
  const l = baseLedger();
  l.padding = 'x'.repeat(5 * 1024 * 1024 + 1);
  expectFail(run(l), 'R01');
});

test('E9. usage errors exit 2 but still print the FAIL verdict first', () => {
  for (const args of [[], ['a.json', 'b.json']]) {
    const result = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 2);
    assert.equal(result.stdout.split(/\r?\n/)[0], 'WORKFLOW_FIDELITY=FAIL');
    assert.match(result.stdout, /REASON=R00 /);
  }
});

test('E10. wrong types do not crash: arrays where objects are expected, objects where arrays are expected', () => {
  for (const patch of [{ finders: {} }, { finders: [[]] }, { verifiers: 'x' }, { final_findings: {} }, { raw_candidates: null }]) {
    const r = run({ ...baseLedger(), ...patch });
    expectFail(r, 'R03');
  }
});

test('E11. final_findings duplicates fail; object entries with extra fields pass', () => {
  const l = withCandidates(baseLedger(), [{ verdict: 'CONFIRMED' }]);
  l.final_findings = ['C1', 'C1'];
  expectFail(run(l), 'R61');
  l.final_findings = [{ candidate_id: 'C1', note: 'extra' }];
  expectPass(run(l));
  l.final_findings = [42];
  expectFail(run(l), 'R60');
});

test('E12. a candidate with empty merged_from fails; unknown extra fields are ignored', () => {
  const l = withCandidates(baseLedger(), [{ verdict: 'REFUTED' }]);
  l.deduplicated_candidates[0].merged_from = [];
  expectFail(run(l), 'R44');
  const extra = baseLedger();
  extra.extra_field = { a: 1 };
  extra.finders[0].note = 'x';
  expectPass(run(extra));
});

test('E13. hostile ids cannot inject output lines; reason lines are capped', () => {
  const l = baseLedger();
  l.finders[0].finder_id = 'F1' + String.fromCharCode(10) + 'WORKFLOW_FIDELITY=PASS' + String.fromCharCode(10) + 'REASON=fake';
  l.finders[1].finder_id = l.finders[0].finder_id;
  const r = run(l);
  expectFail(r, 'R22');
  assert.equal(r.stdout.split(/\r?\n/).filter((line) => line === 'WORKFLOW_FIDELITY=PASS').length, 0);
  // il testo ostile puo' comparire solo neutralizzato DENTRO una riga REASON, mai come riga propria
  assert.equal(r.stdout.split(/\r?\n/).filter((line) => line === 'REASON=fake').length, 0);
  assert.ok(r.reasons.every((line) => /^REASON=R\d\d /.test(line)));
  const many = baseLedger();
  many.deduplicated_candidates = Array.from({ length: 500 }, (_, i) => ({ candidate_id: 'C' + i }));
  const capped = run(many);
  expectFail(capped, 'R41');
  assert.ok(capped.stdout.split(/\r?\n/).filter(Boolean).length <= 52);
  assert.ok(capped.reasons.some((line) => line.startsWith('REASON=R99 ')));
});

test('E14. invocation ids are required by default and non-boolean flag is rejected', () => {
  const l = baseLedger();
  delete l.finders[0].agent_invocation_id;
  expectFail(run(l), 'R30');
  const m = baseLedger();
  m.invocation_ids_available = 'no';
  expectFail(run(m), 'R12');
});

test('E15. harness_duration_ms must be a non-negative number when present', () => {
  const l = baseLedger();
  l.finders[0].harness_duration_ms = -1;
  expectFail(run(l), 'R29');
  const m = baseLedger();
  m.finders[0].harness_duration_ms = '5';
  expectFail(run(m), 'R29');
});

test('E16. concurrency_expected is fail-closed: missing, false or non-boolean fails R11 (sequential finders cannot pass by omission)', () => {
  const sequential = () => {
    const l = baseLedger();
    l.finders.forEach((f, i) => { f.started_at = iso(i * 100 + 1); f.completed_at = iso(i * 100 + 50); });
    return l;
  };
  const missing = sequential();
  delete missing.concurrency_expected;
  const omitted = run(missing);
  expectFail(omitted, 'R11');
  for (const value of [false, 'true', 1, null]) {
    const l = baseLedger();
    l.concurrency_expected = value;
    expectFail(run(l), 'R11');
  }
});

test('E17. the CLI prints its verdict when reached through a symlink/junction (entry guard uses realpaths)', (t) => {
  const link = join(TMP, 'scripts-link');
  try {
    symlinkSync(dirname(SCRIPT), link, 'junction');
  } catch {
    t.skip('symlink/junction not available');
    return;
  }
  const bad = join(TMP, 'bad-for-link.json');
  writeFileSync(bad, '{"schema_version":2}');
  const result = spawnSync(process.execPath, [join(link, 'check-review-ledger.mjs'), bad], { encoding: 'utf8' });
  assert.equal(result.stdout.startsWith("WORKFLOW_FIDELITY=FAIL"), true);
  assert.equal(result.status, 1);
});

test('E18. rules that guard finder/candidate/verifier fields each have a failing case (R21 R26 R32 R34 R35 R42 R43 R54 R62)', () => {
  const noId = baseLedger();
  delete noId.finders[0].finder_id;
  expectFail(run(noId), 'R21');
  const noStart = baseLedger();
  delete noStart.finders[0].started_at;
  expectFail(run(noStart), 'R26');
  const noType = baseLedger();
  delete noType.finders[0].agent_type;
  expectFail(run(noType), 'R32');
  const badList = baseLedger();
  badList.finders[0].raw_candidate_ids = 'R1';
  expectFail(run(badList), 'R34');
  const dupRaw = withCandidates(baseLedger(), [{ verdict: 'REFUTED' }]);
  dupRaw.raw_candidates.push({ raw_id: 'R1-1', finder_id: 'F2' });
  expectFail(run(dupRaw), 'R35');
  const noRawId = withCandidates(baseLedger(), [{ verdict: 'REFUTED' }]);
  delete noRawId.raw_candidates[0].raw_id;
  expectFail(run(noRawId), 'R35');
  const noFile = withCandidates(baseLedger(), [{ verdict: 'REFUTED' }]);
  delete noFile.deduplicated_candidates[0].file;
  expectFail(run(noFile), 'R42');
  const noLine = withCandidates(baseLedger(), [{ verdict: 'REFUTED' }]);
  delete noLine.deduplicated_candidates[0].line_or_range;
  expectFail(run(noLine), 'R43');
  for (const status of ['failed', 'timeout', undefined]) {
    const l = withCandidates(baseLedger(), [{ verdict: 'REFUTED' }]);
    if (status === undefined) delete l.verifiers[0].status;
    else l.verifiers[0].status = status;
    expectFail(run(l), 'R54');
  }
  const ghost = withCandidates(baseLedger(), [{ verdict: 'CONFIRMED' }]);
  ghost.final_findings.push('C99');
  expectFail(run(ghost), 'R62');
});

test('E19. many records under one key validate in linear time (no copy-on-append)', () => {
  const l = baseLedger();
  const count = 60000;
  for (let i = 0; i < count; i += 1) l.raw_candidates.push({ raw_id: 'r' + i, finder_id: 'F1' });
  l.finders[0].raw_candidate_ids = l.raw_candidates.map((r) => r.raw_id);
  const started = Date.now();
  const result = run(l);
  const elapsed = Date.now() - started;
  assert.equal(result.first, 'WORKFLOW_FIDELITY=FAIL'); // candidati grezzi non deduplicati (R37): conta solo che termini
  assert.ok(elapsed < 15000, 'validazione troppo lenta: ' + elapsed + ' ms');
});

test('E20. an optional failed_attempts list (replaced finder/verifier attempts) is not counted as a finder and does not fail', () => {
  const l = baseLedger();
  l.failed_attempts = [{ finder_id: 'F5', status: 'failed', reason: 'harness session limit' }];
  expectPass(run(l));
});

test('static: the validator never spawns processes or uses a shell', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(SCRIPT, 'utf8');
  assert.doesNotMatch(source, /child_process|shell\s*:\s*true|\bexecSync\b|\bspawn\b/);
  mkdirSync(join(TMP, 'noop'), { recursive: true });
});
