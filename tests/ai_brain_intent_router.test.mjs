import assert from 'node:assert/strict';
import test from 'node:test';

import { AI_INTENTS, resolveIntent, listIntentsForRole, isNavActionAllowed } from '../src/ai/router/intentRouter.js';
import { AI_ROLES } from '../src/ai-foundation/contracts.js';

const ADMIN_ONLY_INTENTS = ['critical_campaigns', 'inactive_operators', 'stale_gps_sessions', 'campaigns_without_photos', 'unassigned_groups', 'daily_operations_summary'];
const CUSTOMER_ONLY_INTENTS = ['campaign_progress', 'completed_areas', 'latest_gps', 'approved_photos', 'explain_report', 'next_campaign_suggestion'];
const CONFIGURATOR_INTENTS = ['explain_service', 'explain_quantity', 'explain_territory', 'explain_smart_pairing', 'explain_quote'];

test('intentRouter: tutti gli intenti richiesti dal ticket AI-BRAIN-2 sono registrati', () => {
  for (const name of [...ADMIN_ONLY_INTENTS, ...CUSTOMER_ONLY_INTENTS, ...CONFIGURATOR_INTENTS]) {
    assert.ok(AI_INTENTS[name], `intento mancante: ${name}`);
    assert.ok(AI_INTENTS[name].fallback, `fallback mancante per: ${name}`);
    assert.ok(AI_INTENTS[name].requiredContext, `requiredContext mancante per: ${name}`);
    assert.ok(AI_INTENTS[name].authorizedFunction, `authorizedFunction mancante per: ${name}`);
  }
});

test('intentRouter: un intento sconosciuto viene sempre rifiutato', () => {
  const decision = resolveIntent('non_esiste', { role: AI_ROLES.ADMIN });
  assert.equal(decision.ok, false);
  assert.equal(decision.reason, 'unknown_intent');
});

test('intentRouter: Cliente non può usare nessun intento Admin (equivalente a Admin Copilot 403)', () => {
  for (const name of ADMIN_ONLY_INTENTS) {
    const decision = resolveIntent(name, { role: AI_ROLES.CLIENT });
    assert.equal(decision.ok, false, `Cliente non deve poter usare ${name}`);
    assert.equal(decision.reason, 'role_denied');
  }
});

test('intentRouter: Fornitore (driver) non può usare nessun intento Admin (equivalente a Admin Copilot 403)', () => {
  for (const name of ADMIN_ONLY_INTENTS) {
    const decision = resolveIntent(name, { role: AI_ROLES.SUPPLIER });
    assert.equal(decision.ok, false, `Fornitore non deve poter usare ${name}`);
    assert.equal(decision.reason, 'role_denied');
  }
});

test('intentRouter: Visitatore anonimo non può usare nessun intento Admin o Cliente', () => {
  for (const name of [...ADMIN_ONLY_INTENTS, ...CUSTOMER_ONLY_INTENTS]) {
    const decision = resolveIntent(name, { role: AI_ROLES.VISITOR });
    assert.equal(decision.ok, false, `Visitatore non deve poter usare ${name}`);
  }
});

test('intentRouter: Admin autorizzato ottiene ok=true su tutti gli intenti Admin', () => {
  for (const name of ADMIN_ONLY_INTENTS) {
    const decision = resolveIntent(name, { role: AI_ROLES.ADMIN });
    assert.equal(decision.ok, true, `Admin deve poter usare ${name}`);
    assert.equal(decision.descriptor.name, name);
  }
});

test('intentRouter: nessun ruolo (undefined/null) viene mai autorizzato, anche per intenti pubblici Configuratore', () => {
  for (const name of CONFIGURATOR_INTENTS) {
    assert.equal(resolveIntent(name, {}).ok, false);
    assert.equal(resolveIntent(name, { role: null }).ok, false);
  }
});

test('intentRouter: gli intenti Configuratore restano accessibili a Visitatore, Cliente, Fornitore e Admin', () => {
  for (const name of CONFIGURATOR_INTENTS) {
    for (const role of Object.values(AI_ROLES)) {
      assert.equal(resolveIntent(name, { role }).ok, true, `${role} deve poter usare ${name}`);
    }
  }
});

test('intentRouter: passare un ruolo diverso da quello reale non allarga i permessi (il router non legge nulla dal payload)', () => {
  // Anche se un chiamante malizioso passasse role="admin" senza che l'identità
  // sia mai stata verificata, resolveIntent da solo non fornisce alcun dato:
  // e' compito del chiamante costruire {role} SOLO da un'identita' verificata
  // a monte. Qui verifichiamo solo che la stringa passata sia l'unica fonte
  // usata (nessuna euristica aggiuntiva, nessun bypass silenzioso).
  const spoofed = resolveIntent('critical_campaigns', { role: 'admin' });
  assert.equal(spoofed.ok, true, 'la stringa "admin" letterale autorizza, per costruzione, solo se ARRIVA da un\'identita\' gia\' verificata');
  const notARole = resolveIntent('critical_campaigns', { role: 'Admin' }); // case-sensitive: non deve corrispondere per errore di casing
  assert.equal(notARole.ok, false);
});

test('listIntentsForRole: elenco coerente con i gruppi di ruolo dichiarati', () => {
  assert.deepEqual([...listIntentsForRole(AI_ROLES.ADMIN)].sort().filter((name) => ADMIN_ONLY_INTENTS.includes(name)).sort(), [...ADMIN_ONLY_INTENTS].sort());
  assert.equal(listIntentsForRole(AI_ROLES.CLIENT).some((name) => ADMIN_ONLY_INTENTS.includes(name)), false);
});

test('isNavActionAllowed: rifiuta azioni di navigazione non dichiarate per un intento', () => {
  assert.equal(isNavActionAllowed('critical_campaigns', 'open_campaign_operations'), true);
  assert.equal(isNavActionAllowed('critical_campaigns', 'delete_campaign'), false);
  assert.equal(isNavActionAllowed('inesistente', 'open_campaign_operations'), false);
});
