import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

// admin-grant-access (supabase/functions/admin-grant-access/index.ts) e'
// Deno-only, non eseguibile da Node in questo ambiente (nessun Docker
// disponibile). Stesso pattern di verifica strutturale gia' accettato in
// questo repo per le altre Edge Function (vedi ai_edge_security.test.mjs,
// ai_core_dispatcher.test.mjs): assert sull'ordine reale del sorgente.
const src = fs.readFileSync('supabase/functions/admin-grant-access/index.ts', 'utf8');
const paymentSrc = fs.readFileSync('src/lib/supabaseClient.js', 'utf8');

test('anonimo (nessun JWT) -> 401 prima di qualunque lettura profiles/campaigns', () => {
  // .from("profiles")/.from("campaigns") compaiono anche nelle definizioni
  // di funzione (ensureClientProfile, ecc.), testualmente PRIMA di serve():
  // qui si ancora esplicitamente al corpo di serve(), dove avviene l'ordine
  // reale a runtime.
  const serveStart = src.indexOf('serve(async (req: Request) => {');
  const serveBody = src.slice(serveStart);
  const authIndex = serveBody.indexOf('const user = await getAuthedUser(req);');
  const unauthenticatedIndex = serveBody.indexOf('error: "UNAUTHENTICATED" }, 401');
  const roleLookupIndex = serveBody.indexOf('.select("role")');
  const campaignLookupIndex = serveBody.indexOf('.select("id, user_id, status');
  assert.ok(authIndex >= 0 && unauthenticatedIndex > authIndex);
  assert.ok(roleLookupIndex > unauthenticatedIndex, 'profiles.role va letto solo DOPO il controllo auth');
  assert.ok(campaignLookupIndex > roleLookupIndex, 'campaigns va letto solo DOPO auth + ruolo');
});

test('cliente autenticato (role !== admin) -> 403, mai 500', () => {
  const forbiddenIndex = src.indexOf('error: "FORBIDDEN" }, 403');
  assert.ok(forbiddenIndex >= 0);
  assert.match(src, /if \(!profile \|\| profile\.role !== "admin"\)/, 'il controllo ruolo deve rifiutare esplicitamente i non-admin, non lasciare che l\'errore cada nel catch generico');
});

test('admin + campaign inesistente -> 404 esplicito', () => {
  const notFoundIndex = src.indexOf('error: "CAMPAIGN_NOT_FOUND" }, 404');
  assert.ok(notFoundIndex >= 0);
  const campaignLookupIndex = src.indexOf('.from("campaigns")');
  assert.ok(notFoundIndex > campaignLookupIndex);
});

test('email cliente mancante o non valida -> 400 controllato, non 500', () => {
  assert.match(src, /EMAIL_REGEX = \/\^\[\^\\s@\]\+@\[\^\\s@\]\+\\\.\[\^\\s@\]\+\$\//);
  assert.match(src, /error: "INVALID_CLIENT_EMAIL" }, 400/);
});

test('campagna in stato non compatibile -> 409, non procede al grant', () => {
  assert.match(src, /GRANTABLE_STATUSES = new Set\(\["pending_review", "approved"\]\)/);
  const statusCheckIndex = src.indexOf('GRANTABLE_STATUSES.has(campaign.status)');
  const incompatibleIndex = src.indexOf('error: "CAMPAIGN_STATUS_INCOMPATIBLE"');
  const createUserIndex = src.indexOf('auth.admin.createUser');
  assert.ok(statusCheckIndex >= 0 && incompatibleIndex > statusCheckIndex);
  assert.ok(createUserIndex > incompatibleIndex, 'nessuna creazione utente prima del controllo stato campagna');
});

test('idempotenza: campaign.user_id già presente -> already_granted, nessuna nuova chiamata a createUser/signInWithOtp', () => {
  const idempotentCheckIndex = src.indexOf('if (campaign.user_id) {');
  const alreadyGrantedIndex = src.indexOf('already_granted: true, userId: campaign.user_id');
  assert.ok(idempotentCheckIndex >= 0 && alreadyGrantedIndex > idempotentCheckIndex);

  const statusCheckIndex = src.indexOf('GRANTABLE_STATUSES.has(campaign.status)');
  assert.ok(statusCheckIndex > alreadyGrantedIndex, 'il controllo idempotenza precede il controllo status: un grant già concesso non deve mai essere rifiutato per status avanzato nel frattempo');

  const otpCallIndex = src.lastIndexOf('signInWithOtp');
  assert.ok(otpCallIndex > statusCheckIndex, 'il magic link viene inviato solo nel percorso non-idempotente, dopo i controlli');
});

test('profiles: colonne reali (full_name, phone), MAI email/nome/telefono inesistenti; role scritto solo alla creazione', () => {
  // ensureClientProfile scrive SOLO su profiles: email:clientEmail è legittimo
  // altrove nel file (createUser/signInWithOtp scrivono su auth.users, non su
  // profiles), quindi il controllo va ristretto alle colonne passate a
  // ensureClientProfile(...) e al corpo della funzione stessa.
  const callSiteStart = src.indexOf('await ensureClientProfile(supabase, targetUserId, {');
  const callSiteEnd = src.indexOf('});', callSiteStart);
  const callSitePayload = src.slice(callSiteStart, callSiteEnd);
  assert.doesNotMatch(callSitePayload, /\bemail\s*:/, 'profiles non ha colonna email');
  assert.doesNotMatch(callSitePayload, /\bnome\s*:/, 'la colonna reale è full_name, non nome');
  assert.doesNotMatch(callSitePayload, /\btelefono\s*:/, 'la colonna reale è phone, non telefono');
  assert.match(callSitePayload, /full_name:\s*clientName/);
  assert.match(callSitePayload, /phone:\s*clientPhone/);

  const ensureFnBodyOnly = src.slice(src.indexOf('async function ensureClientProfile'), src.indexOf('\nserve(async'));
  assert.doesNotMatch(ensureFnBodyOnly, /\bemail\s*:/, 'ensureClientProfile non deve mai scrivere email su profiles');

  const ensureFnStart = src.indexOf('async function ensureClientProfile');
  const ensureFnEnd = src.indexOf('\nserve(async', ensureFnStart);
  const fnBody = src.slice(ensureFnStart, ensureFnEnd);
  const existingBranchStart = fnBody.indexOf('if (existing) {');
  const insertCallStart = fnBody.indexOf('.insert({ id: userId, role: "client"');
  assert.ok(existingBranchStart >= 0 && insertCallStart > existingBranchStart);
  const updateBranch = fnBody.slice(existingBranchStart, insertCallStart);
  assert.doesNotMatch(updateBranch, /role:/, 'il ramo update non deve mai scrivere role: un profilo esistente non va mai declassato/promosso qui');
  assert.match(fnBody.slice(insertCallStart), /role:\s*"client"/, 'role="client" va scritto solo in insert, alla prima creazione');
});

test('findAuthUserByEmail: nessuna creazione utente prima di aver cercato per email (evita duplicati)', () => {
  const findFnIndex = src.indexOf('async function findAuthUserByEmail');
  const findCallIndex = src.indexOf('let targetUser = await findAuthUserByEmail(supabase, clientEmail);');
  const createUserIndex = src.indexOf('auth.admin.createUser', findCallIndex);
  assert.ok(findFnIndex >= 0 && findCallIndex > findFnIndex && createUserIndex > findCallIndex);
  assert.match(src, /if \(!targetUser\)\s*\{/, 'createUser deve essere condizionato a "non trovato"');
});

test('nessun dato admin/ruolo/userId fidato dal body della richiesta', () => {
  assert.doesNotMatch(src, /body\?\.\s*(role|admin|userId|isAdmin)\b/);
  assert.match(src, /const \{ data: profile.*\} = await supabase\s*\n\s*\.from\("profiles"\)/s, 'il ruolo è sempre riletto da profiles server-side');
});

test('service_role non è mai esposta: solo la Edge Function usa SUPABASE_SERVICE_ROLE_KEY', () => {
  assert.match(src, /Deno\.env\.get\("SUPABASE_SERVICE_ROLE_KEY"\)/);
  // La service_role key viene letta una sola volta, dentro supabaseAdmin(),
  // e mai restituita nel body di una response (json({...})) né loggata.
  const keyReads = src.match(/SUPABASE_SERVICE_ROLE_KEY/g) || [];
  assert.equal(keyReads.length, 1, 'la chiave va letta una sola volta, in supabaseAdmin()');
  assert.doesNotMatch(src, /json\(\{[^}]*key/i);
});

test('redirect Magic Link punta a /dashboard, mai al path dello Step4 (/configuratore)', () => {
  assert.match(src, /emailRedirectTo:\s*`\$\{siteUrl\}\/dashboard`/);
  assert.doesNotMatch(src, /emailRedirectTo[^;]*configuratore/);
});

test('confirmCampaignPayment: promuove ad "approved" anche le campagne pending_review (bug reale corretto)', () => {
  const fnStart = paymentSrc.indexOf('export async function confirmCampaignPayment');
  const fnEnd = paymentSrc.indexOf('\n}', fnStart);
  const fnBody = paymentSrc.slice(fnStart, fnEnd);
  assert.match(fnBody, /existing\.status === 'draft' \|\| existing\.status === 'pending_review'/, 'submit-campaign-request crea sempre le campagne con status pending_review, mai draft: entrambe devono promuovere ad approved');
  assert.match(fnBody, /payment_status:\s*"pagato"/, 'lo schema reale non ha una colonna payment_status: deve restare dentro metadata');
});
