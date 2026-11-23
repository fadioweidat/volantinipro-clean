import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('GPS Admin: nome assegnazione prioritario, Caposquadra solo come ruolo aggiuntivo in schede/filtri/tracce', () => {
  const monitor = readFileSync(new URL('../src/pages/admin/GpsMonitor.jsx', import.meta.url), 'utf8');
  assert.match(monitor, /name: a\.operator_name && a\.operator_name !== a\.operator_id \? a\.operator_name : null/);
  assert.match(monitor, /displayName: o\.name && !\/\^OP/);
  assert.match(monitor, /roleLabel: isPrimaryAssignment \? 'Caposquadra' : null/);
  assert.doesNotMatch(monitor, /displayName: isPrimaryAssignment\s+\? 'Caposquadra'/);
  assert.match(monitor, /\{op\.displayName\}<\/span>/, 'scheda admin mostra il nome');
  assert.match(monitor, /const label = `\$\{op\.displayName\}/, 'filtro mostra nome e ruolo');
  assert.match(monitor, /operatorLabel: canonical\s+\? `\$\{canonical\.displayName\}/, 'traccia mostra nome e ruolo');
  assert.match(monitor, /name: match\?\.name \|\| null/, 'legenda GPS non sostituisce il nome con OP 1');
  assert.match(monitor, /Nome non disponibile/, 'se il dato manca deve essere esplicito, non inventato');
});
