// Validatore del ledger di orchestrazione della review HIGH (workflow project-code-review).
//
//   node scripts/check-review-ledger.mjs <ledger.json>
//
// Il ledger documenta la FORMA del workflow (8 finder realmente invocati, un verifier per candidato
// deduplicato, ordine e sovrapposizione temporale): NON e' una prova della qualita' del ragionamento degli
// agenti e i suoi campi sono dichiarati dall'orchestratore (parent), quindi non sono a prova di falsificazione.
//
// Output: la prima riga di stdout e' SEMPRE WORKFLOW_FIDELITY=PASS oppure WORKFLOW_FIDELITY=FAIL, seguita da
// righe REASON=<id regola> <messaggio> (una per violazione, con tetto). Exit code: 0 = PASS; 1 = FAIL (anche
// file illeggibile / JSON malformato); 2 = errore d'uso (stampa comunque FAIL). Il percorso e' solo passato a fs:
// nessuna shell, nessun eseguibile.
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_REASON_LINES = 50;
const REQUIRED_ANGLES = ['correctness', 'security', 'data_integrity', 'concurrency', 'tests_contracts', 'error_handling', 'performance', 'integration'];
const VERDICTS = new Set(['CONFIRMED', 'REFUTED', 'UNCERTAIN']);
const SHA_RE = /^[0-9a-f]{40}([0-9a-f]{24})?$/;
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{1,9})?(Z|[+-](\d{2}):(\d{2}))$/;

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const own = (object, key) => (object !== null && typeof object === 'object' && hasOwn(object, key) ? object[key] : undefined);
const pushTo = (map, key, item) => { const list = map.get(key); if (list) list.push(item); else map.set(key, [item]); }; // append lineare (no copy-on-append)
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isId = (value) => typeof value === 'string' && value.trim() !== '';

// Sanitizza un valore ripetuto in output: niente caratteri di controllo (nessuna iniezione di righe), lunghezza limitata.
function clean(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  const shown = String(text === undefined ? 'undefined' : text).slice(0, 80);
  return JSON.stringify([...shown].map((ch) => {
    const code = ch.charCodeAt(0);
    return code < 32 || (code >= 127 && code <= 159) ? '?' : ch;
  }).join(''));
}

// Timestamp ISO-8601 con fuso obbligatorio, con controllo dei range (Date.parse da solo accetta 31 febbraio).
function parseTimestamp(value) {
  if (typeof value !== 'string') return null;
  const m = ISO_RE.exec(value);
  if (!m) return null;
  const [year, month, day, hour, minute, second] = [m[1], m[2], m[3], m[4], m[5], m[6]].map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth || hour > 23 || minute > 59 || second > 59) return null;
  if (m[9] !== undefined && (Number(m[9]) > 23 || Number(m[10]) > 59)) return null;
  const epoch = Date.parse(value);
  return Number.isFinite(epoch) ? epoch : null;
}

export function validateLedger(root) {
  const violations = [];
  const add = (id, message) => violations.push({ id, message });

  if (!isObject(root)) {
    add('R02', 'la radice del ledger non e\' un oggetto JSON');
    return violations;
  }

  // ── intestazione ────────────────────────────────────────────────────────
  if (own(root, 'schema_version') !== 1) add('R04', 'schema_version deve essere 1, trovato ' + clean(own(root, 'schema_version')));
  if (own(root, 'effort') !== 'HIGH') add('R05', 'effort deve essere HIGH, trovato ' + clean(own(root, 'effort')));
  if (own(root, 'finders_requested') !== 8) add('R06', 'finders_requested deve essere 8, trovato ' + clean(own(root, 'finders_requested')));
  if (!isId(own(root, 'base_ref'))) add('R07', 'base_ref mancante o non valido');
  for (const [rule, field] of [['R08', 'base_sha'], ['R09', 'head_sha'], ['R10', 'merge_base']]) {
    const value = own(root, field);
    if (typeof value !== 'string' || !SHA_RE.test(value)) add(rule, field + ' mancante o non e\' uno SHA esadecimale minuscolo di 40/64 caratteri: ' + clean(value));
  }
  const concurrencyExpected = own(root, 'concurrency_expected');
  if (concurrencyExpected !== true) add('R11', 'concurrency_expected deve essere true (HIGH richiede 8 finder concorrenti), trovato ' + clean(concurrencyExpected)); // fail-closed come invocation_ids_available
  const idsFlag = own(root, 'invocation_ids_available');
  if (idsFlag !== undefined && typeof idsFlag !== 'boolean') add('R12', 'invocation_ids_available deve essere booleano');
  const idsRequired = idsFlag !== false; // fail-closed: qualunque valore diverso da false richiede gli id

  // ── forma degli array ───────────────────────────────────────────────────
  const listOf = (field) => {
    const value = own(root, field);
    if (!Array.isArray(value)) {
      add('R03', field + ' deve essere un array');
      return [];
    }
    return value.filter((item, index) => {
      if (!isObject(item)) {
        add('R03', field + '[' + index + '] non e\' un oggetto');
        return false;
      }
      return true;
    });
  };
  const finders = listOf('finders');
  const rawCandidates = listOf('raw_candidates');
  const candidates = listOf('deduplicated_candidates');
  const verifiers = listOf('verifiers');
  const finalRaw = own(root, 'final_findings');
  if (!Array.isArray(finalRaw)) add('R03', 'final_findings deve essere un array');
  const finalFindings = Array.isArray(finalRaw) ? finalRaw : [];

  // ── finder ──────────────────────────────────────────────────────────────
  if (finders.length !== 8) add('R20', 'servono esattamente 8 finder, trovati ' + finders.length);
  const finderIds = new Set();
  const finderById = new Map();
  const angleCount = new Map();
  for (const finder of finders) {
    const finderId = own(finder, 'finder_id');
    if (!isId(finderId)) {
      add('R21', 'finder_id mancante o non valido');
    } else if (finderIds.has(finderId)) {
      add('R22', 'finder_id duplicato ' + clean(finderId));
    } else {
      finderIds.add(finderId);
      finderById.set(finderId, finder);
    }
    const angle = own(finder, 'angle');
    if (typeof angle !== 'string' || !REQUIRED_ANGLES.includes(angle)) add('R23', 'angolo non riconosciuto: ' + clean(angle));
    else angleCount.set(angle, (angleCount.get(angle) || 0) + 1);
    if (own(finder, 'status') !== 'completed') add('R27', 'finder ' + clean(finderId) + ' non completato (status ' + clean(own(finder, 'status')) + ')');
    if (!isId(own(finder, 'started_at'))) add('R26', 'finder ' + clean(finderId) + ' senza started_at');
    if (!isId(own(finder, 'completed_at'))) add('R28', 'finder ' + clean(finderId) + ' senza completed_at');
    if (!isId(own(finder, 'agent_type'))) add('R32', 'finder ' + clean(finderId) + ' senza agent_type');
    const duration = own(finder, 'harness_duration_ms');
    if (duration !== undefined && (typeof duration !== 'number' || !Number.isFinite(duration) || duration < 0)) add('R29', 'harness_duration_ms non valido per finder ' + clean(finderId));
  }
  for (const angle of REQUIRED_ANGLES) {
    const count = angleCount.get(angle) || 0;
    if (count === 0) add('R24', 'angolo mancante: ' + angle);
    if (count > 1) add('R24', 'angolo duplicato: ' + angle + ' (' + count + ' volte)');
  }

  // ── timestamp ───────────────────────────────────────────────────────────
  const intervals = [];
  let finderTimesValid = true;
  let lastFinderCompleted = -Infinity;
  const checkTimes = (record, label, isFinder) => {
    const requested = parseTimestamp(own(record, 'requested_at'));
    const started = parseTimestamp(own(record, 'started_at'));
    const completed = parseTimestamp(own(record, 'completed_at'));
    let ok = true;
    for (const [field, value] of [['requested_at', requested], ['started_at', started], ['completed_at', completed]]) {
      if (value === null) {
        add('R25', label + ': ' + field + ' non e\' un timestamp ISO-8601 valido con fuso orario');
        ok = false;
      }
    }
    if (ok && !(requested <= started && started <= completed)) {
      add('R25', label + ': ordine dei timestamp non valido (requested <= started <= completed)');
      ok = false;
    }
    if (isFinder) {
      if (ok) {
        intervals.push([started, completed]);
        lastFinderCompleted = Math.max(lastFinderCompleted, completed);
      } else {
        finderTimesValid = false;
      }
    }
    return { ok, requested };
  };
  for (const finder of finders) checkTimes(finder, 'finder ' + clean(own(finder, 'finder_id')), true);

  // Sovrapposizione: gli intervalli dei finder devono formare UN gruppo connesso con sovrapposizione positiva.
  // Intervalli adiacenti (fine == inizio successivo) o di durata zero che si toccano NON sono sovrapposti.
  if (concurrencyExpected === true && finders.length === 8 && finderTimesValid && intervals.length === 8) {
    const sorted = [...intervals].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let maxEnd = sorted[0][1];
    let connected = true;
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i][0] >= maxEnd) { connected = false; break; }
      maxEnd = Math.max(maxEnd, sorted[i][1]);
    }
    if (!connected) add('R33', 'concurrency_expected=true ma gli intervalli di esecuzione dei finder non si sovrappongono');
  }

  // ── id di invocazione ───────────────────────────────────────────────────
  if (idsRequired) {
    const owners = new Map();
    const track = (record, label) => {
      const id = own(record, 'agent_invocation_id');
      if (!isId(id)) {
        add('R30', label + ' senza agent_invocation_id');
        return;
      }
      pushTo(owners, id, label);
    };
    for (const finder of finders) track(finder, 'finder ' + clean(own(finder, 'finder_id')));
    for (const verifier of verifiers) track(verifier, 'verifier ' + clean(own(verifier, 'verifier_id')));
    for (const [id, who] of owners) {
      if (who.length > 1) add('R31', 'agent_invocation_id ' + clean(id) + ' riusato da ' + who.join(' e '));
    }
  }

  // ── candidati grezzi ────────────────────────────────────────────────────
  const rawIds = new Set();
  const rawByFinder = new Map();
  for (const raw of rawCandidates) {
    const rawId = own(raw, 'raw_id');
    if (!isId(rawId)) {
      add('R35', 'raw_id mancante o non valido');
      continue;
    }
    if (rawIds.has(rawId)) {
      add('R35', 'raw_id duplicato ' + clean(rawId));
      continue;
    }
    rawIds.add(rawId);
    const owner = own(raw, 'finder_id');
    if (!isId(owner) || !finderIds.has(owner)) {
      add('R36', 'candidato grezzo ' + clean(rawId) + ' riferisce un finder inesistente ' + clean(owner));
      continue;
    }
    pushTo(rawByFinder, owner, rawId);
  }
  for (const [finderId, finder] of finderById) {
    const listed = own(finder, 'raw_candidate_ids');
    if (!Array.isArray(listed) || listed.some((id) => !isId(id))) {
      add('R34', 'raw_candidate_ids del finder ' + clean(finderId) + ' non e\' un array di stringhe');
      continue;
    }
    const listedSet = new Set(listed);
    if (listedSet.size !== listed.length) add('R37', 'raw_candidate_ids del finder ' + clean(finderId) + ' contiene duplicati');
    const actual = new Set(rawByFinder.get(finderId) || []);
    for (const id of listedSet) if (!actual.has(id)) add('R37', 'finder ' + clean(finderId) + ' elenca ' + clean(id) + ' ma nessun candidato grezzo lo riferisce');
    for (const id of actual) if (!listedSet.has(id)) add('R37', 'candidato grezzo ' + clean(id) + ' riferisce il finder ' + clean(finderId) + ' ma non e\' elencato');
  }

  // ── candidati deduplicati ───────────────────────────────────────────────
  const candidateIds = new Set();
  const mergedCount = new Map();
  for (const candidate of candidates) {
    const candidateId = own(candidate, 'candidate_id');
    if (!isId(candidateId)) {
      add('R40', 'candidate_id mancante o non valido');
      continue;
    }
    if (candidateIds.has(candidateId)) {
      add('R40', 'candidate_id duplicato ' + clean(candidateId));
      continue;
    }
    candidateIds.add(candidateId);
    if (!isId(own(candidate, 'severity'))) add('R41', 'candidato ' + clean(candidateId) + ' senza severity');
    if (!isId(own(candidate, 'file'))) add('R42', 'candidato ' + clean(candidateId) + ' senza file');
    const line = own(candidate, 'line_or_range');
    if (!isId(line) && !(typeof line === 'number' && Number.isFinite(line) && line >= 0)) add('R43', 'candidato ' + clean(candidateId) + ' senza line_or_range');
    if (!isId(own(candidate, 'summary'))) add('R44', 'candidato ' + clean(candidateId) + ' senza summary');
    const merged = own(candidate, 'merged_from');
    if (!Array.isArray(merged) || merged.length === 0 || merged.some((id) => !isId(id))) {
      add('R44', 'candidato ' + clean(candidateId) + ' senza candidati grezzi sorgente (merged_from vuoto o non valido)');
      continue;
    }
    if (new Set(merged).size !== merged.length) add('R44', 'candidato ' + clean(candidateId) + ' ha merged_from duplicati');
    for (const id of new Set(merged)) {
      if (!rawIds.has(id)) add('R38', 'candidato ' + clean(candidateId) + ' riferisce il candidato grezzo sconosciuto ' + clean(id));
      else mergedCount.set(id, (mergedCount.get(id) || 0) + 1);
    }
  }
  for (const rawId of rawIds) {
    const count = mergedCount.get(rawId) || 0;
    if (count === 0) add('R38', 'candidato grezzo ' + clean(rawId) + ' non e\' confluito in nessun candidato deduplicato (scartato in silenzio)');
    if (count > 1) add('R39', 'candidato grezzo ' + clean(rawId) + ' confluito in piu\' di un candidato deduplicato');
  }

  // ── verifier ────────────────────────────────────────────────────────────
  const verifierIds = new Set();
  const verifiersByCandidate = new Map();
  for (const verifier of verifiers) {
    const verifierId = own(verifier, 'verifier_id');
    const label = 'verifier ' + clean(verifierId);
    if (!isId(verifierId)) add('R53', 'verifier_id mancante o non valido');
    else if (verifierIds.has(verifierId)) add('R53', 'verifier_id duplicato ' + clean(verifierId));
    else verifierIds.add(verifierId);
    const target = own(verifier, 'candidate_id');
    if (!isId(target) || !candidateIds.has(target)) add('R51', label + ' riferisce un candidato inesistente ' + clean(target));
    else pushTo(verifiersByCandidate, target, verifier);
    if (own(verifier, 'status') !== 'completed') add('R54', label + ' non completato (status ' + clean(own(verifier, 'status')) + ')');
    if (!isId(own(verifier, 'agent_type'))) add('R32', label + ' senza agent_type');
    if (!VERDICTS.has(own(verifier, 'verdict'))) add('R55', label + ' con verdetto non valido ' + clean(own(verifier, 'verdict')));
    const times = checkTimes(verifier, label, false);
    // la verifica parte solo dopo che TUTTI i finder hanno finito
    if (times.ok && finderTimesValid && lastFinderCompleted !== -Infinity && times.requested < lastFinderCompleted) {
      add('R52', label + ' richiesto prima che tutti i finder avessero completato');
    }
    const vDuration = own(verifier, 'harness_duration_ms');
    if (vDuration !== undefined && (typeof vDuration !== 'number' || !Number.isFinite(vDuration) || vDuration < 0)) add('R29', 'harness_duration_ms non valido per ' + label);
  }
  const confirmed = new Set();
  for (const candidateId of candidateIds) {
    const list = verifiersByCandidate.get(candidateId) || [];
    if (list.length === 0) add('R50', 'candidato ' + clean(candidateId) + ' senza verifier');
    if (list.length > 1) add('R50', 'candidato ' + clean(candidateId) + ' con ' + list.length + ' verifier (ne serve esattamente uno)');
    if (list.length === 1 && own(list[0], 'verdict') === 'CONFIRMED') confirmed.add(candidateId);
  }

  // ── risultati finali ────────────────────────────────────────────────────
  const finalIds = new Set();
  for (const entry of finalFindings) {
    const id = isObject(entry) ? own(entry, 'candidate_id') : entry;
    if (!isId(id)) {
      add('R60', 'final_findings contiene una voce non valida');
      continue;
    }
    if (finalIds.has(id)) {
      add('R61', 'final_findings contiene ' + clean(id) + ' piu\' volte');
      continue;
    }
    finalIds.add(id);
    if (!candidateIds.has(id)) add('R62', 'final_findings contiene un candidato inesistente ' + clean(id));
    else if (!confirmed.has(id)) add('R64', 'final_findings contiene ' + clean(id) + ' che non e\' CONFIRMED (REFUTED/UNCERTAIN/non verificato)');
  }
  for (const id of confirmed) {
    if (!finalIds.has(id)) add('R63', 'candidato CONFIRMED ' + clean(id) + ' assente da final_findings');
  }

  return violations;
}

function report(violations, exitCode) {
  const lines = [violations.length === 0 ? 'WORKFLOW_FIDELITY=PASS' : 'WORKFLOW_FIDELITY=FAIL'];
  for (const violation of violations.slice(0, MAX_REASON_LINES)) lines.push('REASON=' + violation.id + ' ' + violation.message);
  if (violations.length > MAX_REASON_LINES) lines.push('REASON=R99 altre ' + (violations.length - MAX_REASON_LINES) + ' violazioni non mostrate');
  process.stdout.write(lines.join('\n') + '\n');
  process.exitCode = exitCode;
}

function main(argv) {
  if (argv.length !== 1) return report([{ id: 'R00', message: 'uso: node scripts/check-review-ledger.mjs <ledger.json>' }], 2);
  const target = argv[0];
  let size;
  try {
    const stat = statSync(target);
    if (!stat.isFile()) return report([{ id: 'R01', message: 'il percorso non e\' un file regolare' }], 1);
    size = stat.size;
  } catch {
    return report([{ id: 'R01', message: 'ledger non leggibile' }], 1);
  }
  if (size > MAX_BYTES) return report([{ id: 'R01', message: 'ledger troppo grande (limite 5 MB)' }], 1);
  let buffer;
  try {
    buffer = readFileSync(target);
  } catch {
    return report([{ id: 'R01', message: 'ledger non leggibile' }], 1);
  }
  if (buffer.length > MAX_BYTES) return report([{ id: 'R01', message: 'ledger troppo grande (limite 5 MB)' }], 1);
  let text = buffer.toString('utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return report([{ id: 'R02', message: 'JSON malformato' }], 1);
  }
  const violations = validateLedger(parsed);
  return report(violations, violations.length === 0 ? 0 : 1);
}

// Entry point: confronto tra realpath (symlink, junction, subst e maiuscole/minuscole non devono spegnere main()).
function isEntryPoint() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync.native(process.argv[1]) === realpathSync.native(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    report([{ id: 'R98', message: 'errore interno' }], 1);
  }
}
