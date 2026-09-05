// TICKET — FIX FIRST MESSAGE ADMIN -> DRIVER.
//
// ROOT CAUSE reale: la conversazione driver_admin veniva creata SOLO da
// hub_get_or_create_driver_conversation, chiamata finora solo dentro
// driver_send_message/driver_list_messages (lato Driver). admin_send_message
// richiede un p_conversation_id GIA' esistente, quindi se il Driver non ha
// mai scritto l'Admin non ha modo di iniziare la chat; admin_list_conversations
// elenca solo conversazioni gia' presenti, quindi un Driver assegnato ma
// senza conversazione non compare mai nel tab "Driver".
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const FIX = read("supabase/migrations/20260905140000_admin_driver_first_message.sql");
const HUB_API = read("src/lib/services/hub-api.js");
const ADMIN_HUB = read("src/pages/admin/communications/AdminCommunicationsPage.jsx");
const RPCS_BASE = read("supabase/migrations/20260905131000_messaging_and_modification_rpcs.sql");

test("ROOT CAUSE — admin_list_driver_directory elenca TUTTI gli assignment reali, anche senza conversazione (LEFT JOIN conversations)", () => {
  assert.match(FIX, /create or replace function public\.admin_list_driver_directory\(\)/);
  assert.match(FIX, /from public\.operator_assignments a/);
  assert.match(FIX, /left join public\.conversations c on c\.kind = 'driver_admin' and c\.assignment_id = a\.id/);
  assert.match(FIX, /'conversation_id', c\.id,/);
  assert.match(FIX, /where a\.revoked_at is null/);
});

test("ROOT CAUSE — admin_send_driver_message crea/fetcha la conversazione (get-or-create idempotente) e invia come admin->driver, funziona senza che il Driver abbia mai scritto", () => {
  assert.match(FIX, /create or replace function public\.admin_send_driver_message\(p_assignment_id uuid, p_text text\)/);
  assert.match(FIX, /v_conv_id := public\.hub_get_or_create_driver_conversation\(p_assignment_id\);/);
  assert.match(FIX, /values \(v_conv_id, 'admin', v_uid, 'driver', btrim\(p_text\)\)/);
  // Riusa la stessa funzione get-or-create gia' esistente e testata lato
  // Driver — nessuna logica di creazione conversazione duplicata.
  assert.match(RPCS_BASE, /create or replace function public\.hub_get_or_create_driver_conversation\(p_assignment_id uuid\)/);
});

test("SECURITY — Admin può iniziare chat solo con assignment realmente esistenti (mai un ID inventato), solo se gps_is_admin()", () => {
  assert.match(FIX, /if not exists \(select 1 from public\.operator_assignments where id = p_assignment_id\) then\s*\n\s*raise exception 'ASSEGNAZIONE_NON_VALIDA'/);
  assert.match(FIX, /if not public\.gps_is_admin\(\) then raise exception 'ADMIN_NON_AUTORIZZATO'/);
  const defs = FIX.match(/create or replace function public\.\w+/g) || [];
  const secDef = FIX.match(/security definer set search_path to ''/g) || [];
  assert.equal(defs.length, 2);
  assert.equal(secDef.length, 2);
});

test("SECURITY — nessuna nuova policy permissiva, nessun service_role, Cliente<->Driver resta vietato (nessun recipient_role diverso da driver/admin qui)", () => {
  assert.doesNotMatch(FIX, /using \(true\)|with check \(true\)/);
  assert.doesNotMatch(FIX, /service_role_key|SUPABASE_SERVICE_ROLE/i);
  assert.match(FIX, /'admin', v_uid, 'driver'/);
  assert.doesNotMatch(FIX, /'customer'/);
});

test("Frontend: adminListDriverDirectory + adminSendDriverMessage esposte, AdminCommunicationsPage le usa per il tab Driver", () => {
  assert.match(HUB_API, /export async function adminListDriverDirectory\(\)/);
  assert.match(HUB_API, /export async function adminSendDriverMessage\(\{ assignmentId, text \}\)/);
  assert.match(ADMIN_HUB, /adminListDriverDirectory\(\)/);
  assert.match(ADMIN_HUB, /adminSendDriverMessage\(\{ assignmentId: conversation\.assignment_id, text: text\.trim\(\) \}\)/);
});

test("Admin UI: il tab Driver mostra assignment senza conversazione con invito a scrivere il primo messaggio, mai bloccato in attesa del Driver", () => {
  assert.match(ADMIN_HUB, /Nessuna conversazione ancora — scrivi il primo messaggio/);
  assert.match(ADMIN_HUB, /Scrivi il primo messaggio/);
  assert.doesNotMatch(ADMIN_HUB, /il [Dd]river deve scrivere prima|richied\w* che il [Dd]river/i);
});

// ── DO NOT TOUCH ──────────────────────────────────────────────────────────
test("DO NOT TOUCH — nessuna tabella/RPC reale di GPS/geofence/segnalazioni/Customer messaging/modification requests/pricing/Payments toccata, nessuna funzione OTP/magic-link introdotta", () => {
  assert.doesNotMatch(FIX, /gps_tracking_points|delivery_sessions|calculate_campaign_final_coverage|campaign_coverage_adjustments|customer_create_issue|customer_create_modification_request|total_amount|estimated_price|payment_status|signInWithOtp|verifyOtp|magic_link_redirect/i);
  // "customer_issues"/"campaign_modification_requests" possono comparire
  // solo come riferimento in FK/commenti gia' esistenti altrove, mai come
  // nuova tabella creata o alterata qui.
  assert.doesNotMatch(FIX, /create (table|or replace function) [^\n]*\b(customer_issues|campaign_modification_requests|geofence|Magic Link)\w*/i);
  assert.doesNotMatch(FIX, /alter table public\.(customer_issues|campaign_modification_requests)\b/i);
});
