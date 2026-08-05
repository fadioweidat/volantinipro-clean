import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { runAdminCopilot } from '../src/ai/adapters/adminCopilotAdapter.js';
import { runCustomerAssistant } from '../src/ai/adapters/customerAssistantAdapter.js';
import { runTerritorialAssistant } from '../src/ai/adapters/territorialAssistantAdapter.js';
import { AI_RESPONSE_STATUSES } from '../src/ai/schema/aiResponseSchema.js';

// Tutti i casi qui sotto devono essere rifiutati PRIMA di qualunque chiamata
// di rete (Edge Function / OpenAI / CentralAiAgent): se un test qui appendesse
// a fare una vera richiesta di rete fallirebbe per timeout/assenza di
// ambiente Supabase, quindi il solo fatto che i test completino in locale
// senza rete e' gia' una prova che l'autorizzazione avviene prima dell'I/O.

test('Admin Copilot: identità anonima/assente -> nessun contesto, fallback controllato (equivalente 401)', async () => {
  const response = await runAdminCopilot({ adminIdentity: null, campaigns: [], availability: { campaigns: true }, intentName: 'daily_operations_summary' });
  assert.equal(response.status, AI_RESPONSE_STATUSES.FALLBACK);
  assert.ok(response.answer.length > 0);
});

test('Admin Copilot: identità Cliente -> accesso negato (equivalente Cliente -> Admin Copilot 403)', async () => {
  const response = await runAdminCopilot({
    adminIdentity: { user: { id: 'client-1' }, role: 'cliente' },
    campaigns: [], availability: { campaigns: true }, intentName: 'critical_campaigns',
  });
  assert.equal(response.status, AI_RESPONSE_STATUSES.FALLBACK);
});

test('Admin Copilot: identità Fornitore/Driver -> accesso negato (equivalente Driver -> Admin Copilot 403)', async () => {
  const response = await runAdminCopilot({
    adminIdentity: { user: { id: 'driver-1' }, role: 'fornitore' },
    campaigns: [], availability: { campaigns: true }, intentName: 'inactive_operators',
  });
  assert.equal(response.status, AI_RESPONSE_STATUSES.FALLBACK);
});

test('Admin Copilot: intento sconosciuto viene rifiutato prima di ogni chiamata esterna', async () => {
  const response = await runAdminCopilot({
    adminIdentity: { user: { id: 'admin-1' }, role: 'admin' },
    campaigns: [], availability: { campaigns: true }, intentName: 'cancella_tutto',
  });
  assert.equal(response.status, AI_RESPONSE_STATUSES.FALLBACK);
  assert.equal(response.intent, 'cancella_tutto');
});

test('Admin Copilot: fonte campagne non disponibile -> fallback controllato, nessun conteggio inventato', async () => {
  const response = await runAdminCopilot({
    adminIdentity: { user: { id: 'admin-1' }, role: 'admin' },
    campaigns: [], availability: { campaigns: false }, intentName: 'daily_operations_summary',
  });
  assert.equal(response.status, AI_RESPONSE_STATUSES.FALLBACK);
});

test('Customer Assistant: scope non corrispondente al cliente autenticato -> fallback (equivalente Cliente A -> campagna B 403)', async () => {
  const response = await runCustomerAssistant({
    sessionId: 'sess-1',
    authUser: { id: 'user-A', email: 'a@example.it' },
    customer: { id: 'cust-B', email: 'diverso@example.it' }, // email non corrisponde ad authUser: scope non verificabile
    campaigns: [],
    dataLoading: false,
    dataError: null,
    intentName: 'campaign_progress',
  });
  assert.equal(response.status, AI_RESPONSE_STATUSES.FALLBACK);
});

test('Customer Assistant: un intento riservato Admin richiesto dal canale Cliente viene negato per ruolo', async () => {
  const response = await runCustomerAssistant({
    sessionId: 'sess-1',
    authUser: { id: 'user-1', email: 'cliente@example.it' },
    customer: { id: 'cust-1', email: 'cliente@example.it' },
    campaigns: [],
    dataLoading: false,
    dataError: null,
    intentName: 'critical_campaigns', // intento Admin, mai esposto al Cliente
  });
  assert.equal(response.status, AI_RESPONSE_STATUSES.FALLBACK);
});

test('Territorial Assistant: nessuno snapshot -> fallback controllato, nessuna chiamata al modello', async () => {
  const response = await runTerritorialAssistant({ snapshot: null, question: 'Spiegami questa analisi.', role: 'visitatore' });
  assert.equal(response.status, AI_RESPONSE_STATUSES.FALLBACK);
});

// ---- Contratto sorgente: il contesto Admin viene costruito SOLO dopo il
// controllo ruolo lato AdminGuard, mai prima (stesso pattern gia' verificato
// per le Edge Function in ai_edge_security.test.mjs, qui esteso al Context
// Layer lato client). ----

const adminGuardSource = fs.readFileSync('src/auth/guards/AdminGuard.jsx', 'utf8');
const adminDashboardSource = fs.readFileSync('src/pages/admin/AdminDashboard.jsx', 'utf8');

test('AdminGuard: la sessione viene esposta ai children SOLO nel ramo raggiunto dopo roleStatus === "admin"', () => {
  const deniedIndex = adminGuardSource.indexOf('roleStatus === "denied"');
  const exposeIndex = adminGuardSource.indexOf('children({ session, role: "admin" })');
  assert.ok(deniedIndex >= 0 && exposeIndex > deniedIndex, 'il controllo "denied" deve precedere qualunque esposizione della sessione ai children');
  assert.match(adminGuardSource, /roleStatus === "checking"/, 'esiste ancora uno stato di verifica esplicito prima di admin/denied');
});

test('AdminDashboard: adminIdentity non è mai preimpostato ad admin, viene risolto in un effect dopo adminSession', () => {
  assert.match(adminDashboardSource, /const \[adminIdentity, setAdminIdentity\] = useState\(null\)/, 'lo stato iniziale non presume mai un\'identità admin');
  const effectIndex = adminDashboardSource.indexOf('getCurrentSupabaseUser(adminSession)');
  assert.ok(effectIndex > 0);
  assert.match(adminDashboardSource, /role: "admin" \}\)/);
});

test('AdminCentralAiPanel: non chiama più direttamente l\'Edge Function, passa dall\'adapter AI-BRAIN-2', () => {
  const panelSource = fs.readFileSync('src/components/ai/admin/AdminCentralAiPanel.jsx', 'utf8');
  assert.doesNotMatch(panelSource, /supabase\.functions\.invoke/, 'il pannello Admin non deve più chiamare la Edge Function direttamente');
  assert.match(panelSource, /runAdminCopilot/);
});

test('CustomerAiAssistantPanel e TerritorialAiAssistantPanel: instradano tramite gli adapter AI-BRAIN-2', () => {
  const customerSource = fs.readFileSync('src/components/ai/customer/CustomerAiAssistantPanel.jsx', 'utf8');
  const territorialSource = fs.readFileSync('src/components/ai/territory/TerritorialAiAssistantPanel.jsx', 'utf8');
  assert.match(customerSource, /runCustomerAssistant/);
  assert.doesNotMatch(territorialSource, /supabase\.functions\.invoke/, 'il pannello Territoriale non deve più chiamare la Edge Function direttamente');
  assert.match(territorialSource, /runTerritorialAssistant/);
});
