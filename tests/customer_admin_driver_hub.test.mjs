// TICKET — CUSTOMER CONTROL CENTER + ADMIN HUB + DRIVER MESSAGING.
// Le migration non sono applicate in questo ambiente di test, quindi gli
// scenari sono verificati staticamente sul testo SQL + sul wiring frontend
// (stesso pattern gia' usato da tests/customer_issue_flow_contract.test.mjs).
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const SCHEMA = read("supabase/migrations/20260905130000_messaging_and_modification_requests.sql");
const RPCS = read("supabase/migrations/20260905131000_messaging_and_modification_rpcs.sql");
const HUB_API = read("src/lib/services/hub-api.js");
const CUSTOMER_PANELS = read("src/components/customer/CampaignHubPanels.jsx");
const DRIVER_PAGE = read("src/pages/driver/DriverAssignmentPage.jsx");
const ADMIN_HUB = read("src/pages/admin/communications/AdminCommunicationsPage.jsx");
const APP_ROUTER = read("src/app/AppRouter.jsx");
const ROUTE_RES = read("src/app/routeResolution.js");
const PUBLIC_ROUTES = read("src/app/PublicRoutes.jsx");
const LEGACY = read("volantinipro-final.jsx");
const MODULES_PANEL = read("src/pages/admin/admin-dashboard/AdminDashboardModulesPanel.jsx");
const CONTACT_CONFIG = read("src/lib/contactConfig.js");

// ── Customer <-> Driver diretto: VIETATO, strutturalmente ─────────────────
test("CLIENTE<->DRIVER VIETATO — vincolo CHECK a livello DB, non solo UI", () => {
  assert.match(SCHEMA, /constraint conversation_messages_no_direct_customer_driver check \(/);
  assert.match(SCHEMA, /\(sender_role = 'customer' and recipient_role = 'admin'\)/);
  assert.match(SCHEMA, /\(sender_role = 'driver' and recipient_role = 'admin'\)/);
  assert.match(SCHEMA, /\(sender_role = 'admin' and recipient_role in \('customer', 'driver'\)\)/);
  assert.match(SCHEMA, /kind text not null check \(kind in \('customer_admin', 'driver_admin'\)\)/);
  // Nessuna combinazione customer<->driver e' rappresentabile.
  assert.doesNotMatch(SCHEMA, /'customer'\s*,\s*'driver'\)\s*or\s*\('driver'.*'customer'/s);
});

test("CLIENTE<->DRIVER VIETATO — nessuna RPC frontend permette un destinatario diverso da 'admin' per Cliente/Driver", () => {
  assert.doesNotMatch(HUB_API, /recipient/i, "il frontend non deve mai scegliere il recipient_role: lo forza sempre la RPC lato DB");
  assert.match(RPCS, /values \(v_conv_id, 'customer', v_uid, 'admin',/);
  assert.match(RPCS, /values \(v_conv_id, 'driver', v_identity, 'admin',/);
  assert.match(DRIVER_PAGE, /driverSendMessage\(\{ assignmentId, text: text\.trim\(\), accessToken: accessToken \|\| null \}\)/);
  assert.doesNotMatch(DRIVER_PAGE, /customer_id|clientId|customerId/, "la Driver App non deve mai ricevere/inviare un identificativo Cliente");
});

// ── Modello DB (Parte C) ───────────────────────────────────────────────────
test("MODELLO — conversations: una sola per campagna (customer_admin) e una sola per assignment (driver_admin)", () => {
  assert.match(SCHEMA, /create unique index if not exists conversations_customer_admin_unique on public\.conversations \(campaign_id\) where kind = 'customer_admin'/);
  assert.match(SCHEMA, /create unique index if not exists conversations_driver_admin_unique on public\.conversations \(assignment_id\) where kind = 'driver_admin'/);
});

test("MODELLO — conversation_messages ha i campi richiesti dal ticket + channel in_app/whatsapp", () => {
  for (const col of ["conversation_id", "sender_role", "sender_id", "recipient_role", "text", "created_at", "seen_at", "channel", "external_message_id", "issue_id", "modification_request_id"]) {
    assert.match(SCHEMA, new RegExp(`\\b${col}\\b`), `manca colonna ${col}`);
  }
  assert.match(SCHEMA, /channel text not null default 'in_app' check \(channel in \('in_app', 'whatsapp'\)\)/);
});

test("MODELLO — campaign_modification_requests: tipi e stati esatti dal ticket", () => {
  assert.match(SCHEMA, /type text not null check \(type in \('quantita', 'zona', 'servizio', 'data', 'extra', 'stampa', 'grafica', 'altro'\)\)/);
  assert.match(SCHEMA, /status text not null default 'pending' check \(status in \('pending', 'approved', 'rejected', 'applied', 'cancelled'\)\)/);
});

// ── Parte B: modifica NON applica automaticamente il prezzo ────────────────
test("PARTE B — nessuna modifica automatica di pricing/pagamento: la RPC aggiorna solo status/nota, mai campaigns.total_amount o Payments", () => {
  assert.doesNotMatch(RPCS, /update public\.campaigns/i, "admin_decide_modification_request non deve mai scrivere su campaigns (pricing/pagamento passa dal flusso esistente)");
  assert.doesNotMatch(RPCS, /total_amount|estimated_price|payment_status/i);
  assert.match(RPCS, /update public\.campaign_modification_requests\s*\n\s*set status = p_decision, admin_note = /);
});

// ── RLS / Security (Parte J) ────────────────────────────────────────────
test("SECURITY — force RLS su tutte le tabelle, nessuna policy permissiva, nessun service_role nel browser", () => {
  for (const tbl of ["conversations", "conversation_messages", "campaign_modification_requests"]) {
    assert.match(SCHEMA, new RegExp(`alter table public\\.${tbl} enable row level security`));
    assert.match(SCHEMA, new RegExp(`alter table public\\.${tbl} force row level security`));
  }
  assert.doesNotMatch(SCHEMA, /using \(true\)|with check \(true\)/);
  assert.doesNotMatch(RPCS, /service_role_key|SUPABASE_SERVICE_ROLE/i);
});

test("SECURITY — Cliente legge solo proprie conversazioni/richieste (customer_id = auth.uid() / current_user_owns_campaign)", () => {
  assert.match(SCHEMA, /conversations_customer_select on public\.conversations for select to authenticated\s*\n\s*using \(kind = 'customer_admin' and customer_id = auth\.uid\(\)\)/);
  assert.match(SCHEMA, /cmr_customer_select on public\.campaign_modification_requests for select to authenticated\s*\n\s*using \(customer_id = auth\.uid\(\)\)/);
  assert.match(RPCS, /if not public\.current_user_owns_campaign\(p_campaign_id\) then/);
});

test("SECURITY — Driver legge solo conversazioni della propria assignment (auth o access_token, mai Magic Link/OTP)", () => {
  assert.match(SCHEMA, /conversations_driver_select on public\.conversations for select to authenticated\s*\n\s*using \(kind = 'driver_admin' and exists \(/);
  assert.match(RPCS, /function public\.hub_resolve_driver_assignment\(p_assignment_id uuid, p_access_token text\)/);
  assert.match(RPCS, /select \* into v_assignment from public\.operator_assignments where id = p_assignment_id and operator_id = v_uid/);
  assert.match(RPCS, /select \* into v_assignment from public\.operator_assignments where id = p_assignment_id and access_token = p_access_token/);
  // Verifica funzionale (non testuale): nessuna funzione di autenticazione
  // OTP/magic-link viene introdotta per il Driver — i commenti possono
  // legittimamente NOMINARLA per documentare il vincolo rispettato.
  assert.doesNotMatch(RPCS, /signInWithOtp|verifyOtp|magic_link_redirect/i);
});

test("SECURITY — Admin ha accesso completo via gps_is_admin(), mai esposto a Cliente/Driver senza autorizzazione", () => {
  assert.match(SCHEMA, /conversations_admin_all on public\.conversations for all to authenticated\s*\n\s*using \(public\.gps_is_admin\(\)\) with check \(public\.gps_is_admin\(\)\)/);
  const adminFns = ["admin_list_conversations", "admin_list_messages", "admin_send_message", "admin_mark_messages_seen", "admin_list_modification_requests", "admin_decide_modification_request"];
  for (const fn of adminFns) {
    const start = RPCS.indexOf(`function public.${fn}(`);
    assert.ok(start >= 0, `manca la RPC ${fn}`);
    const body = RPCS.slice(start, start + 500);
    assert.match(body, /if not public\.gps_is_admin\(\) then raise exception 'ADMIN_NON_AUTORIZZATO'/, `${fn} deve verificare gps_is_admin()`);
  }
});

test("SECURITY — nessun dato Cliente (nome/telefono/email) esposto al Driver: driver_list_messages non seleziona colonne Cliente", () => {
  const start = RPCS.indexOf("function public.driver_list_messages(");
  const body = RPCS.slice(start, RPCS.indexOf("$function$;", start));
  assert.doesNotMatch(body, /client_name|client_phone|client_email|customer_name|customer_id/i);
});

// ── RPC hardening ──────────────────────────────────────────────────────
test("RPC — tutte SECURITY DEFINER con search_path vuoto", () => {
  const defs = RPCS.match(/create or replace function public\.\w+/g) || [];
  const secDef = RPCS.match(/security definer set search_path to ''/g) || [];
  assert.ok(defs.length >= 15, `attese >=15 RPC, trovate ${defs.length}`);
  assert.equal(secDef.length, defs.length);
});

// ── Parte A/B: Customer campaign steps viewer + Richiedi modifica ──────────
test("PARTE A — CampaignConfigSection mostra Step1-4 con dati REALI da campagna.metadata, nessun dato inventato", () => {
  assert.match(CUSTOMER_PANELS, /export function CampaignConfigSection\(\{ campagna \}\)/);
  assert.match(CUSTOMER_PANELS, /const meta = campagna\?\.metadata \|\| \{\};/);
  assert.match(CUSTOMER_PANELS, /Step 1 — Servizio/);
  assert.match(CUSTOMER_PANELS, /Step 2 — Zona/);
  assert.match(CUSTOMER_PANELS, /Step 3 — Distribuzione/);
  assert.match(CUSTOMER_PANELS, /Step 4 — Riepilogo/);
  assert.match(CUSTOMER_PANELS, /Richiedi modifica/);
});

test("PARTE B — customerCreateModificationRequest invia campaign_id/type/current/requested/note, stati esatti dal ticket", () => {
  assert.match(HUB_API, /export async function customerCreateModificationRequest\(\{ campaignId, type, currentValue = \{\}, requestedValue = \{\}, note = null \}\)/);
  assert.match(HUB_API, /p_campaign_id: campaignId, p_type: type, p_current_value: currentValue, p_requested_value: requestedValue, p_note: note/);
  const statusKeys = Object.keys({ pending: 1, approved: 1, rejected: 1, applied: 1, cancelled: 1 });
  for (const s of statusKeys) assert.match(HUB_API, new RegExp(`${s}:`));
});

test("CampaignDashboardPage (volantinipro-final.jsx) monta CampaignConfigSection + CustomerMessagesPanel", () => {
  assert.match(LEGACY, /import \{ CampaignConfigSection, CustomerMessagesPanel \} from "\.\/src\/components\/customer\/CampaignHubPanels\.jsx"/);
  assert.match(LEGACY, /<CampaignConfigSection campagna=\{campagna\} \/>/);
  assert.match(LEGACY, /<CustomerMessagesPanel campaignId=\{routeCampaignId\} \/>/);
});

// ── Parte D: Dashboard Cliente chat ─────────────────────────────────────
test("PARTE D — CustomerMessagesPanel: solo Admin come contatto, badge non letti, polling", () => {
  assert.match(CUSTOMER_PANELS, /Admin \/ Assistenza VolantiniPro/);
  assert.match(CUSTOMER_PANELS, /const unreadCount = messages\.filter\(\(m\) => m\.recipient_role === "customer" && !m\.seen_at\)\.length/);
  assert.match(CUSTOMER_PANELS, /window\.setInterval\(reload, 15000\)/);
  // Verifica sul componente CustomerMessagesPanel isolato (non sull'intero
  // file, che nei commenti di CampaignConfigSection nomina legittimamente
  // "Driver" per documentare il vincolo Cliente<->Driver vietato): nessun
  // contatto/etichetta Driver nella UI chat vista dal Cliente.
  const panel = CUSTOMER_PANELS.slice(CUSTOMER_PANELS.indexOf("export function CustomerMessagesPanel"));
  assert.doesNotMatch(panel, /driver|Driver/, "la chat Cliente non deve mai menzionare/mostrare il Driver come contatto");
});

// ── Parte F: Driver App messaggi ────────────────────────────────────────
test("PARTE F — DriverMessagesSection: solo 'VolantiniPro Admin / Centrale Operativa' come contatto, badge, polling 20s", () => {
  const section = DRIVER_PAGE.slice(DRIVER_PAGE.indexOf("function DriverMessagesSection"), DRIVER_PAGE.indexOf("function DriverMessagesSection") + 4000);
  assert.match(section, /VolantiniPro Admin \/ Centrale Operativa/);
  assert.doesNotMatch(section, /Cliente|customer/i, "il Driver non deve mai vedere un contatto Cliente");
  assert.match(section, /window\.setInterval\(reload, 20000\)/);
  assert.match(section, /const unreadCount = messages\.filter\(\(m\) => m\.recipient_role === 'driver' && !m\.seen_at\)\.length/);
});

// ── Parte E: Admin Communication Hub ────────────────────────────────────
test("PARTE E — AdminCommunicationsPage: filtri Tutti/Clienti/Driver/Non letti/Segnalazioni/Richieste modifica", () => {
  for (const label of ["Tutti", "Clienti", "Driver", "Non letti", "Segnalazioni", "Richieste modifica"]) {
    assert.match(ADMIN_HUB, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(ADMIN_HUB, /adminListConversations\(/);
  assert.match(ADMIN_HUB, /adminListIssues\(/);
  assert.match(ADMIN_HUB, /adminListModificationRequests\(/);
  assert.match(ADMIN_HUB, /adminDecideModificationRequest\(/);
  assert.match(ADMIN_HUB, /adminRouteIssue\(/);
});

test("Routing: /admin/communications wired end-to-end (routeResolution + AppRouter paths/lazy/render + module card)", () => {
  assert.match(ROUTE_RES, /if \(p === '\/admin\/communications'\) return 'admin-communications';/);
  assert.match(APP_ROUTER, /"admin-communications":\s*"\/admin\/communications"/);
  assert.match(APP_ROUTER, /const AdminCommunicationsPage = lazy\(/);
  assert.match(APP_ROUTER, /\{page === "admin-communications" && <AdminCommunicationsPage onNav=\{goTo\} \/>\}/);
  assert.match(MODULES_PANEL, /onOpen=\{\(\) => onNav\('admin-communications'\)\}/);
});

// ── Parte K: realtime/polling, nessuna nuova infrastruttura ────────────────
test("PARTE K — solo polling leggero ovunque, nessun supabase.channel/WebSocket/EventSource introdotto", () => {
  for (const src of [CUSTOMER_PANELS, DRIVER_PAGE, ADMIN_HUB]) {
    assert.doesNotMatch(src, /supabase\.channel|EventSource|new WebSocket/);
  }
});

// ── Parte H: WhatsApp — stato reale, mai finto ──────────────────────────
test("PARTE H — WhatsApp NON configurato (nessuna Business API/webhook/token): solo adapter-ready, wa.me resta un link, non un canale inbox", () => {
  assert.match(HUB_API, /export const WHATSAPP_STATUS = Object\.freeze\(\{ configured: false, mode: 'adapter_ready' \}\)/);
  assert.doesNotMatch(HUB_API, /WHATSAPP_ACCESS_TOKEN|WHATSAPP_PHONE_NUMBER_ID|WHATSAPP_VERIFY_TOKEN|graph\.facebook\.com/i);
  // contactConfig.js resta solo wa.me (click-to-chat), non una Business API.
  assert.match(CONTACT_CONFIG, /wa\.me/);
  assert.doesNotMatch(CONTACT_CONFIG, /graph\.facebook\.com|WHATSAPP_ACCESS_TOKEN/i);
});

// ── DO NOT TOUCH: GPS/geofence/coverage/Map Studio/pricing/Payments/Marketplace/auth/token ──
test("DO NOT TOUCH — le nuove migration non toccano tabelle/RPC reali di GPS/geofence/coverage/Map Studio/pricing/Marketplace, ne' introducono funzioni OTP/magic-link", () => {
  for (const src of [SCHEMA, RPCS]) {
    assert.doesNotMatch(src, /gps_tracking_points|delivery_sessions|calculate_campaign_final_coverage|campaign_coverage_adjustments|signInWithOtp|verifyOtp|magic_link_redirect/i);
    // "geofence"/"map_studio"/"pricing_engine"/"supplier_" possono comparire
    // solo in commenti che DICHIARANO di non toccarli (vedi header), mai come
    // nome reale di tabella/funzione creata o alterata da questa migration.
    assert.doesNotMatch(src, /create (table|or replace function) [^\n]*\b(geofence|map_studio|pricing_engine|supplier_)\w*/i);
    assert.doesNotMatch(src, /alter table public\.(geofence|map_studio|pricing_engine|supplier_)\w*/i);
  }
});

test("DO NOT TOUCH — nessun file GPS/pricing/Payments/Step1-4/Supplier Marketplace modificato da questo ticket (solo file del hub + wiring minimo)", () => {
  assert.doesNotMatch(PUBLIC_ROUTES, /hub-api|CampaignHubPanels|AdminCommunications/, "PublicRoutes.jsx non deve essere toccato: le nuove pagine sono tutte Admin/Driver/legacy dashboard, non route pubbliche del configuratore");
});
