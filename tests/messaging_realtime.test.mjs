import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { mergeMessages, countUnreadMessages } from "../src/lib/services/messaging-realtime.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const readFile = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const realtimeSrc = readFile("src/lib/services/messaging-realtime.js");
const driverPageSrc = readFile("src/pages/driver/DriverAssignmentPage.jsx");
const adminPageSrc = readFile("src/pages/admin/communications/AdminCommunicationsPage.jsx");
const customerPanelSrc = readFile("src/components/customer/CampaignHubPanels.jsx");
const migrationSrc = readFile("supabase/migrations/20260912130000_realtime_conversation_messages.sql");

// ---------------------------------------------------------------------------
// 1. mergeMessages: Deduplicazione rigorosa per ID
// ---------------------------------------------------------------------------
test("mergeMessages: non crea duplicati per lo stesso id", () => {
  const existing = [
    { id: "msg-1", text: "Ciao", created_at: "2026-09-12T10:00:00Z" },
    { id: "msg-2", text: "Come va?", created_at: "2026-09-12T10:01:00Z" },
  ];
  const duplicate = { id: "msg-2", text: "Come va?", created_at: "2026-09-12T10:01:00Z" };

  const merged = mergeMessages(existing, duplicate);
  assert.equal(merged.length, 2, "La lista deve contenere esattamente 2 messaggi");
  assert.equal(merged[0].id, "msg-1");
  assert.equal(merged[1].id, "msg-2");
});

test("mergeMessages: aggiorna i campi di un messaggio esistente (es. seen_at)", () => {
  const existing = [
    { id: "msg-1", text: "Ciao", seen_at: null, created_at: "2026-09-12T10:00:00Z" },
  ];
  const update = { id: "msg-1", seen_at: "2026-09-12T10:05:00Z", created_at: "2026-09-12T10:00:00Z" };

  const merged = mergeMessages(existing, update);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].seen_at, "2026-09-12T10:05:00Z");
});

test("mergeMessages: ordina cronologicamente per created_at (ascendente)", () => {
  const existing = [
    { id: "msg-2", text: "Secondo", created_at: "2026-09-12T10:05:00Z" },
    { id: "msg-1", text: "Primo", created_at: "2026-09-12T10:00:00Z" },
  ];
  const incoming = [
    { id: "msg-3", text: "Terzo", created_at: "2026-09-12T10:10:00Z" },
    { id: "msg-0", text: "Zero", created_at: "2026-09-12T09:55:00Z" },
  ];

  const merged = mergeMessages(existing, incoming);
  assert.equal(merged.length, 4);
  assert.equal(merged[0].id, "msg-0");
  assert.equal(merged[1].id, "msg-1");
  assert.equal(merged[2].id, "msg-2");
  assert.equal(merged[3].id, "msg-3");
});

test("mergeMessages: gestisce input nulli o vuoti in modo sicuro", () => {
  const existing = [{ id: "msg-1", text: "Ciao", created_at: "2026-09-12T10:00:00Z" }];
  assert.deepEqual(mergeMessages(existing, null), existing);
  assert.deepEqual(mergeMessages(existing, undefined), existing);
  assert.deepEqual(mergeMessages(existing, []), existing);
  assert.equal(mergeMessages(null, { id: "msg-1", text: "Ciao" }).length, 1);
});

// ---------------------------------------------------------------------------
// 2. countUnreadMessages: calcolo unread badge
// ---------------------------------------------------------------------------
test("countUnreadMessages: conta solo i messaggi non letti per il ruolo specificato", () => {
  const msgs = [
    { id: "1", recipient_role: "driver", seen_at: null },
    { id: "2", recipient_role: "driver", seen_at: "2026-09-12T10:00:00Z" },
    { id: "3", recipient_role: "driver", seen_at: null },
    { id: "4", recipient_role: "admin", seen_at: null }, // per admin, non driver
  ];
  assert.equal(countUnreadMessages(msgs, "driver"), 2);
  assert.equal(countUnreadMessages(msgs, "admin"), 1);
  assert.equal(countUnreadMessages(msgs, "customer"), 0);
});

test("countUnreadMessages: gestisce array vuoto o nullo", () => {
  assert.equal(countUnreadMessages([], "driver"), 0);
  assert.equal(countUnreadMessages(null, "driver"), 0);
});

// ---------------------------------------------------------------------------
// 3. DriverAssignmentPage: Realtime & Unread Badge
// ---------------------------------------------------------------------------
test("DriverAssignmentPage.jsx: importa ed usa subscribeToDriverMessages", () => {
  assert.ok(driverPageSrc.includes("subscribeToDriverMessages"), "DriverAssignmentPage deve usare subscribeToDriverMessages");
  assert.ok(driverPageSrc.includes("mergeMessages"), "DriverAssignmentPage deve usare mergeMessages");
  assert.ok(driverPageSrc.includes("countUnreadMessages"), "DriverAssignmentPage deve usare countUnreadMessages");
});

test("DriverAssignmentPage.jsx: polling adattivo e network recovery presenti", () => {
  assert.ok(driverPageSrc.includes("window.addEventListener('online'"), "deve ascoltare evento online per riconnessione immediata");
  assert.ok(driverPageSrc.includes("document.addEventListener('visibilitychange'"), "deve ascoltare visibilitychange per reload immediato al ritorno in tab");
  assert.ok(driverPageSrc.includes("realtimeStatus === 'SUBSCRIBED'"), "deve avere polling adattivo basato sullo stato realtime");
});

test("DriverAssignmentPage.jsx: badge non letti presente nel markup", () => {
  assert.ok(driverPageSrc.includes("unreadCount > 0"), "deve renderizzare il badge non letti");
});

// ---------------------------------------------------------------------------
// 4. AdminCommunicationsPage: Realtime Hub
// ---------------------------------------------------------------------------
test("AdminCommunicationsPage.jsx: sottoscrive a admin:messages e canali conversazione", () => {
  assert.ok(adminPageSrc.includes("subscribeToAdminMessages"), "AdminCommunicationsPage deve usare subscribeToAdminMessages");
  assert.ok(adminPageSrc.includes("subscribeToConversation"), "AdminCommunicationsPage deve usare subscribeToConversation");
  assert.ok(adminPageSrc.includes("mergeMessages"), "AdminCommunicationsPage deve usare mergeMessages per deduping");
});

test("AdminCommunicationsPage.jsx: broadcast su invio messaggio Admin -> Driver", () => {
  assert.ok(adminPageSrc.includes("broadcasterRef.current(msg)"), "deve trasmettere in broadcast il messaggio inviato per ricezione immediata");
});

// ---------------------------------------------------------------------------
// 5. CampaignHubPanels (Customer): Realtime
// ---------------------------------------------------------------------------
test("CampaignHubPanels.jsx: sottoscrive a subscribeToCustomerMessages", () => {
  assert.ok(customerPanelSrc.includes("subscribeToCustomerMessages"), "CustomerMessagesPanel deve usare subscribeToCustomerMessages");
  assert.ok(customerPanelSrc.includes("mergeMessages"), "CustomerMessagesPanel deve usare mergeMessages");
});

// ---------------------------------------------------------------------------
// 6. Database Triggers Migration
// ---------------------------------------------------------------------------
test("20260912130000_realtime_conversation_messages.sql: trigger broadcast presenti", () => {
  assert.ok(migrationSrc.includes("realtime.send"), "deve usare realtime.send per broadcast automatico dal DB");
  assert.ok(migrationSrc.includes("trg_conversation_message_broadcast"), "trigger su insert deve essere definito");
  assert.ok(migrationSrc.includes("trg_conversation_message_seen_broadcast"), "trigger su update seen_at deve essere definito");
  assert.ok(migrationSrc.includes("ALTER PUBLICATION supabase_realtime ADD TABLE"), "deve abilitare la pubblicazione realtime");
});
