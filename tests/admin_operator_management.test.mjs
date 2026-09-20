import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/pages/admin/GpsMonitor.jsx', import.meta.url), 'utf8');

test('Admin OP management: canonical card mostra zona corrente e consente revoca assignment', () => {
  // Import da admin-api.js: i tre nomi richiesti devono esserci, in qualsiasi ordine e accanto ad
  // altri (es. renameGroupParticipant, contratto separato coperto da admin_operator_rename.test.mjs).
  const adminApiImport = src.match(/import\s*\{([^}]*)\}\s*from\s*['"][^'"]*\/lib\/services\/admin-api\.js['"]/);
  assert.ok(adminApiImport, 'GpsMonitor deve importare da admin-api.js');
  const importedNames = adminApiImport[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean);
  for (const name of ['listCampaignAssignments', 'getCampaignManualOperationalMetrics', 'revokeOperatorAssignment']) {
    assert.ok(importedNames.includes(name), 'admin-api import deve includere ' + name);
  }
  // Invariante (non un requisito di feature: la rinomina e' coperta da admin_operator_rename.test.mjs):
  // se la pagina chiama renameGroupParticipant deve anche importarlo, altrimenti il click fallirebbe.
  if (/renameGroupParticipant\(/.test(src)) {
    assert.ok(importedNames.includes('renameGroupParticipant'), 'renameGroupParticipant e chiamata ma non importata da admin-api');
  }
  assert.match(src, /async function handleRevokeOperator\(op\)/);
  assert.match(src, /await revokeOperatorAssignment\(assignmentId\)/);
  assert.match(src, /status: 'revoked'/);
  // Flusso di revoca scoped alla funzione: prima la conferma admin, solo dopo la chiamata di revoca,
  // poi lo stato locale 'revoked'.
  // Corpo della funzione estratto per bilanciamento delle graffe (indipendente da indentazione/formattazione).
  const fnStart = src.indexOf('async function handleRevokeOperator(op)');
  assert.ok(fnStart >= 0, 'handleRevokeOperator non trovata');
  const bodyOpen = src.indexOf('{', fnStart);
  let depth = 0;
  let bodyEnd = -1;
  for (let i = bodyOpen; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') { depth -= 1; if (depth === 0) { bodyEnd = i; break; } }
  }
  assert.ok(bodyEnd > bodyOpen, 'corpo di handleRevokeOperator non delimitabile');
  const body = src.slice(bodyOpen, bodyEnd + 1);
  const confirmAt = body.indexOf('window.confirm(');
  const guardAt = body.search(/if \(!ok\) return;/);
  const revokeAt = body.indexOf('await revokeOperatorAssignment(assignmentId)');
  const statusAt = body.indexOf("status: 'revoked'");
  // conferma -> guardia sul rifiuto -> revoca -> stato locale 'revoked'
  assert.ok(confirmAt >= 0 && guardAt > confirmAt, 'dopo window.confirm deve esserci la guardia if (!ok) return');
  assert.ok(revokeAt > guardAt, 'la revoca avviene solo dopo la guardia sulla conferma');
  assert.ok(statusAt > revokeAt, "lo stato 'revoked' viene aggiornato dopo la revoca");
  assert.match(src, /Zona: <strong/);
  assert.match(src, /Revoca OP/);
  assert.match(src, /onRevokeOperator=\{handleRevokeOperator\}/);
  assert.match(src, /onClick=\{\(\) => onRevokeOperator\(op\)\}/);
});

test('Admin OP management: revoca non elimina storico GPS e resta confermata manualmente', () => {
  assert.match(src, /Lo storico GPS resta conservato/);
  assert.match(src, /window\.confirm/);
  assert.doesNotMatch(src, /delete.*delivery_sessions/i);
});
