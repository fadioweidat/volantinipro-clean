import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

// ai-core (supabase/functions/ai-core/index.ts) e' Deno-only: non eseguibile
// da Node. Come per le altre Edge Function AI (vedi ai_edge_security.test.mjs),
// la verifica qui e' strutturale sul sorgente reale: stesso pattern gia'
// accettato in questo repo per provare l'ordine auth/payload/AI senza un
// runtime Deno disponibile in locale (nessun Docker in questo ambiente).
const indexSource = fs.readFileSync('supabase/functions/ai-core/index.ts', 'utf8');
const contextTypesSource = fs.readFileSync('supabase/functions/ai-core/contextTypes.ts', 'utf8');

test('ai-core: contextType sconosciuto è rifiutato prima di qualunque auth/AI', () => {
  const knownCheckIndex = indexSource.indexOf('isKnownContextType(contextType)');
  const invalidContextIndex = indexSource.indexOf('error: "INVALID_CONTEXT_TYPE" }, 400');
  const authIndex = indexSource.indexOf('getAuthedUser(req)', knownCheckIndex);
  assert.ok(knownCheckIndex >= 0 && invalidContextIndex > knownCheckIndex, 'il controllo whitelist precede la risposta 400');
  assert.ok(authIndex > invalidContextIndex, 'la risoluzione identita\' avviene dopo la validazione del contextType, mai prima');
});

test('ai-core: contextType validi non implementati rispondono 501 e i context implementati hanno rami dedicati', () => {
  const implementedCheckIndex = indexSource.indexOf('isImplementedContextType(contextType)');
  const notImplementedIndex = indexSource.indexOf('error: "CONTEXT_TYPE_NOT_IMPLEMENTED" }, 501');
  assert.ok(implementedCheckIndex >= 0 && notImplementedIndex > implementedCheckIndex);
  // Gli Step 1-4 usano un unico ramo pubblico; dashboard cliente e report
  // campagna restano noti ma non ancora implementati.
  assert.match(indexSource, /contextType\s*===\s*"admin_dashboard"/);
  assert.match(indexSource, /contextType\s*===\s*"territorial_report"/);
  assert.match(indexSource, /contextType\s*===\s*"control_center_diagnosis"/);
  assert.doesNotMatch(indexSource, /contextType\s*===\s*"customer_dashboard"/);
  assert.doesNotMatch(indexSource, /contextType\s*===\s*"campaign_report"/);
  assert.match(contextTypesSource, /"step1"[\s\S]*"step2"[\s\S]*"step3"[\s\S]*"step4"[\s\S]*"customer_dashboard"[\s\S]*"admin_dashboard"[\s\S]*"territorial_report"[\s\S]*"campaign_report"/);
  assert.match(contextTypesSource, /IMPLEMENTED_CONTEXT_TYPES = Object\.freeze\(\["step1", "step2", "step3", "step4", "admin_dashboard", "control_center_diagnosis", "territorial_report"\]\)/);
});

test('ai-core: step2 NON impone JWT — l\'identità è risolta ma mai bloccante prima del branch', () => {
  const userResolvedIndex = indexSource.indexOf('const user = await getAuthedUser(req);');
  const handleStep2CallIndex = indexSource.indexOf('QUOTE_CONTEXT_TYPES.has(contextType)', userResolvedIndex);
  assert.ok(userResolvedIndex >= 0 && handleStep2CallIndex > userResolvedIndex);
  // Tra la risoluzione dell'utente e la chiamata a handleStep2 non deve
  // esserci NESSUN early-return 401: e' esattamente il fix richiesto (prima
  // ai-core rifiutava con UNAUTHENTICATED chiunque non avesse un JWT valido).
  const between = indexSource.slice(userResolvedIndex, handleStep2CallIndex);
  assert.doesNotMatch(between, /return json\(.*401/s, 'nessun 401 tra la risoluzione utente e il dispatch a step2: l\'anonimo deve poter procedere');
  assert.doesNotMatch(indexSource, /error: "UNAUTHENTICATED"/, 'ai-core non deve più avere un percorso UNAUTHENTICATED bloccante per step2');
});

test('ai-core: handleQuoteStep gestisce esplicitamente user === null e arriva comunque a OpenAI', () => {
  const fnStart = indexSource.indexOf('async function handleQuoteStep(contextType: string, user: { id: string } | null, body: any) {');
  assert.ok(fnStart >= 0, 'la firma deve accettare user nullable, non solo { id: string }');
  const fnEnd = indexSource.indexOf('\nserve(async (req: Request)', fnStart);
  const fnBody = indexSource.slice(fnStart, fnEnd);

  const anonBranchIndex = fnBody.indexOf('if (!user) {');
  assert.ok(anonBranchIndex >= 0, 'deve esistere un ramo esplicito per utente anonimo');
  const anonBranchEnd = fnBody.indexOf('\n  }', anonBranchIndex);
  const anonBranch = fnBody.slice(anonBranchIndex, anonBranchEnd);

  assert.match(anonBranch, /callOpenAi\(contextType, snapshot, question, warnings\)/, 'il ramo anonimo deve raggiungere la chiamata AI, non fermarsi prima');
  // Nessun accesso a dati privati nel ramo anonimo: niente cache, niente
  // tabelle utente/campagna.
  assert.doesNotMatch(anonBranch, /ai_territorial_chat_cache/, 'il ramo anonimo non deve toccare la cache (nessuna migration in questa fase)');
  assert.doesNotMatch(anonBranch, /\.from\("profiles"\)/);
  assert.doesNotMatch(anonBranch, /\.from\("campaigns"\)/);
  assert.doesNotMatch(anonBranch, /supabaseAdmin\(\)/);
});

test('ai-core: utente autenticato continua a usare la cache ai_territorial_chat_cache', () => {
  const fnStart = indexSource.indexOf('async function handleQuoteStep(contextType: string, user: { id: string } | null, body: any) {');
  const fnEnd = indexSource.indexOf('\nserve(async (req: Request)', fnStart);
  const fnBody = indexSource.slice(fnStart, fnEnd);
  const afterAnonBranch = fnBody.slice(fnBody.indexOf('if (!user) {'));

  assert.match(afterAnonBranch, /\.from\("ai_territorial_chat_cache"\)/);
  assert.match(afterAnonBranch, /\.eq\("payload_hash", payloadHash\)/);
  assert.match(afterAnonBranch, /\.eq\("user_id", user\.id\)/);
  assert.match(afterAnonBranch, /user_id: user\.id,/, 'insert cache deve usare solo l\'id verificato dal JWT, mai un valore dal body');
});

test('ai-core: nessun user_id/customerId/role viene mai letto dal body della richiesta', () => {
  assert.doesNotMatch(indexSource, /body\?\.\s*user_?[Ii]d/);
  assert.doesNotMatch(indexSource, /body\?\.\s*role/);
  assert.doesNotMatch(indexSource, /body\.userId/);
});

test('ai-core: validazione input — limiti dimensionali e struttura sicura prima di OpenAI', () => {
  const validateIndex = indexSource.indexOf('function validateStep2Payload');
  const openAiDefIndex = indexSource.indexOf('async function callOpenAi');
  assert.ok(validateIndex >= 0 && validateIndex < openAiDefIndex);

  assert.match(indexSource, /MAX_QUESTION_LENGTH = 500/);
  assert.match(indexSource, /MAX_SNAPSHOT_JSON_LENGTH = 20000/);
  assert.match(indexSource, /error: "SNAPSHOT_TOO_LARGE"/);
  assert.match(indexSource, /error: "INVALID_SNAPSHOT_STRUCTURE"/);

  // Difesa contro chiavi prototipo pericolose e numeri non finiti.
  assert.match(indexSource, /DANGEROUS_KEYS = new Set\(\["__proto__", "prototype", "constructor"\]\)/);
  assert.match(indexSource, /Number\.isFinite\(value\)/);
  assert.match(indexSource, /MAX_SNAPSHOT_ARRAY_LENGTH = 200/);
});

test('ai-core: il prompt non riceve mai header/identità, solo contextType+snapshot+question', () => {
  const promptFnIndex = indexSource.indexOf('function buildQuoteUserPrompt(contextType: string, snapshot: Record<string, unknown>, question: string)');
  assert.ok(promptFnIndex >= 0);
  const promptFnEnd = indexSource.indexOf('\n}', promptFnIndex);
  const promptFnBody = indexSource.slice(promptFnIndex, promptFnEnd);
  assert.doesNotMatch(promptFnBody, /req\.headers/);
  assert.doesNotMatch(promptFnBody, /Authorization/);
  assert.doesNotMatch(promptFnBody, /user\./);
});

test('ai-core: policy preventivo vieta invenzioni e modifiche automatiche', () => {
  assert.match(indexSource, /model:\s*"gpt-4o-mini"/);
  assert.match(indexSource, /NON inventare prezzi, sconti, disponibilita, copertura, tempi o condizioni contrattuali/);
  assert.match(indexSource, /Non modificare mai il preventivo/);
  assert.match(indexSource, /quoteAnswerNumbersAreGrounded/);
  assert.match(indexSource, /SENSITIVE_CONTEXT_REJECTED/);
  assert.match(indexSource, /redactQuestion/);
});
