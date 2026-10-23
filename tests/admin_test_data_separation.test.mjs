// 2026-10-24 (approved): test data separated from real data in the admin, the 58 test campaigns
// left "in distribuzione" closed, "Registro ordini" + "Clienti & Preventivi" merged into "Ordini".
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyClientsQuotesView, isRealRow, kpiRows } from "../src/lib/admin/clientsQuotesView.js";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const code = (sql) => sql.replace(/^\s*--.*$/gm, "");
const m1 = read("supabase/migrations/20261024100000_test_campaigns_flag.sql");
const m2 = read("supabase/migrations/20261024101000_close_test_campaigns.sql");

test("migration 1: backup, the reviewed 104 ids, rule without Fadi's main account, admin RPC", () => {
  const ids = m1.match(/'[0-9a-f-]{36}'/g);
  assert.equal(new Set(ids).size, 104);
  assert.match(m1, /create table backup_ops\.campaigns_is_test_20261024 as/);
  assert.ok(m1.indexOf("create table backup_ops.campaigns_is_test_20261024") < m1.indexOf("update public.campaigns c\n   set is_test = true"), "backup before the update");
  assert.doesNotMatch(code(m1), /fenice\.sp@gmail\.com/);
  assert.doesNotMatch(code(m1), /\bdelete\b|\btruncate\b|drop table/i);
  assert.match(m1, /create trigger campaigns_mark_test_account_trg\n  before insert on public\.campaigns/);
  assert.match(m1, /function public\.admin_set_campaign_test\(p_campaign_id uuid, p_is_test boolean, p_reason text\)/);
  assert.match(m1, /if not public\.gps_is_admin\(\) then/);
  assert.match(m1, /'campaign_marked_test', 'campaign_unmarked_test'\]\)\);/);
  assert.match(m1, /revoke all on schema backup_ops from anon, authenticated;/);
});

test("rule: test-account e-mails only (no false positives on real-looking addresses)", () => {
  const pattern = m1.match(/~ '(\(\^\(qa\|test\)[^']+)'/)[1];
  const re = new RegExp(pattern);
  for (const e of ["qa-runtime-gate-bruzzano@volantinipro.it", "qa.runtime.console@volantinipro.invalid", "test@example.com",
    "test_user_driver3_a_1786521662733@example.com", "test-customer-e2e-final@volantinipro.it", "phase3-admin-x@example.test"]) assert.ok(re.test(e), e);
  for (const e of ["fenice.sp@gmail.com", "testa.mario@gmail.com", "qatar.office@gmail.com", "tester@azienda.it", "admin@volantinipro.it", "infopostini@gmail.com"]) assert.ok(!re.test(e), e);
});

test("migration 2: closes only in_progress test campaigns, nothing deleted, history logged, backups", () => {
  assert.equal(new Set(m2.match(/'[0-9a-f-]{36}'/g)).size, 58);
  assert.match(m2, /and c\.status = 'in_progress' and c\.is_test;/);
  const c = code(m2);
  assert.doesNotMatch(c, /\bdelete\b|\btruncate\b|drop table/i);
  for (const b of ["campaigns_20261024b", "delivery_sessions_20261024b", "operator_assignments_20261024b", "campaign_action_log_ids_20261024b"]) assert.match(m2, new RegExp(`backup_ops\\.${b}`));
  assert.match(m2, /set status = 'cancelled',\n       ended_at = coalesce\(\n         \(select pg_catalog\.max\(p\.recorded_at\) from public\.gps_tracking_points p where p\.session_id = s\.id\),/);
  assert.match(m2, /set status = 'revoked',\n       revoked_at = pg_catalog\.now\(\),/);
  assert.match(m2, /\(1, 'campaign_cancelled', 'in_progress', 'cancelled'\),\n\s+\(2, 'campaign_archived', 'cancelled', 'archived'\)/);
  assert.match(m2, /'dati di prova'/);
  assert.ok(c.indexOf("insert into public.campaign_admin_action_log") < c.indexOf("set status = 'archived'"), "log before the status change");
  const rb = read("supabase/migrations/rollback/20261024101000_close_test_campaigns.rollback.sql");
  assert.match(rb, /from backup_ops\.campaigns_20261024b b where b\.id = c\.id;/);
  assert.match(rb, /using backup_ops\.campaign_action_log_ids_20261024b b where b\.id = l\.id;/);
});

test("counters and lists: real rows by default, test rows with 'Mostra dati di prova'", () => {
  const rows = [{ id: "a", quality: "real" }, { id: "b", quality: "test" }, { id: "c" }];
  assert.deepEqual(kpiRows(rows).map((r) => r.id), ["a", "c"]);
  assert.deepEqual(kpiRows(rows, true).map((r) => r.id), ["a", "b", "c"]);
  assert.equal(isRealRow(rows[1]), false);
  assert.deepEqual(applyClientsQuotesView(rows).map((r) => r.id).sort(), ["a", "c"]);
  assert.deepEqual(applyClientsQuotesView(rows, { showTest: true }).map((r) => r.id).sort(), ["a", "b", "c"]);
  assert.match(read("src/lib/services/admin-api.js"), /\['completed', 'done', 'completata', 'cancelled', 'archived'\]/);
});

test("Ordini: one page, two views with the same actions; old routes still work", () => {
  const router = read("src/app/AppRouter.jsx");
  assert.match(router, /\{page === "admin-clients-quotes" && <AdminOrders onNav=\{goTo\} initialView="schede" \/>\}/);
  assert.match(router, /\{page === "admin-orders" && <AdminOrders onNav=\{goTo\} \/>\}/);
  const page = read("src/pages/admin/AdminOrders.jsx");
  assert.match(page, /<ClientsQuotes onNav=\{onNav\} embedded showTest=\{showTest\} \/>/);
  assert.match(page, /<AdminOrdersRegistry onNav=\{onNav\} embedded showTest=\{showTest\} \/>/);
  assert.match(page, /Mostra dati di prova/);
  for (const file of ["src/pages/admin/ClientsQuotes.jsx", "src/pages/admin/AdminOrdersRegistry.jsx"]) {
    const src = read(file);
    for (const action of ["openClientWhatsApp(row)", "copyClientSummary(row)", "sendDriverProgram(row)", "openDriverAppInstall(row)", "<AdminActionMenu campaign={actionMenuCampaign(row)}", "admin-report:"]) {
      assert.ok(src.includes(action), `${file}: ${action}`);
    }
    assert.match(src, /PROVA/);
  }
  const modules = read("src/pages/admin/admin-dashboard/AdminDashboardModulesPanel.jsx");
  assert.match(modules, /title="Ordini"/);
  assert.doesNotMatch(modules, /title="Clienti & Preventivi"|title="Registro Ordini"/);
});

test("Oggi: test data hidden by default, toggle and PROVA label", () => {
  const dash = read("src/pages/admin/AdminDashboard.jsx");
  assert.match(dash, /const \[showTest, setShowTest\] = useState\(false\);/);
  assert.match(dash, /const todayGroups = showTest \? state\.data\.todayGroupsAll : state\.data\.todayGroups;/);
  assert.match(dash, /\(showTest \? state\.data\.clientsQuotes : state\.data\.clientsQuotes\.filter\(isRealRow\)\)/);
  assert.match(dash, /\.map\(\(group\) => \(\{ \.\.\.group, isTest: !realCampaignIds\.has\(group\.campaignId\) \}\)\)/);
  assert.match(dash, /\{group\.isTest && <span className="admin-home__test-tag">PROVA<\/span>\}/);
});

test("Azioni Admin: Segna come prova / Non è una prova through admin_set_campaign_test", () => {
  const api = read("src/lib/services/admin-transitions-api.js");
  assert.match(api, /supabase\.rpc\('admin_set_campaign_test', \{ p_campaign_id: campaignId, p_is_test: isTest, p_reason: reason \}\)/);
  const menu = read("src/components/admin/AdminActionMenu.jsx");
  assert.match(menu, /await adminSetCampaignTest\(campaignId, pendingAction === CAMPAIGN_ACTIONS\.MARK_TEST, reason\);/);
});
