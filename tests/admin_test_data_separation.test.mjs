// 2026-10-24/25 (approved): test data separated from real data in the admin, automatic rule for
// test accounts, "Segna come prova", "Registro ordini" + "Clienti & Preventivi" merged into "Ordini".
// The existing test campaigns were flagged and closed by the approved cleanup of 2026-10-25
// (docs/GPS_TEST_CLEANUP_20261025.md) plus the info@ campaign; the migration adds the rule and RPC only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyClientsQuotesView, isRealRow, kpiRows } from "../src/lib/admin/clientsQuotesView.js";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const code = (sql) => sql.replace(/^\s*--.*$/gm, "");
const m1 = read("supabase/migrations/20261025140000_test_campaign_rule.sql");

test("migration: rule + explicit list + admin RPC, no existing row modified", () => {
  const c = code(m1);
  assert.doesNotMatch(c, /update public\.campaigns c?\s+set\s+is_test|\btruncate\b|drop table/i);
  assert.doesNotMatch(c, /fenice\.sp@gmail\.com|info@volantinipro\.it/);
  for (const email of ["demo@volantinipro.it", "admin-1785913811466@volantinipro.it", "marco.bianchi@volantinipro.it", "infopostini@gmail.com"]) {
    assert.ok(c.includes(`'${email}'`), email);
  }
  assert.match(m1, /create trigger campaigns_mark_test_account_trg\n  before insert on public\.campaigns/);
  assert.match(m1, /function public\.admin_set_campaign_test\(p_campaign_id uuid, p_is_test boolean, p_reason text\)/);
  assert.match(m1, /if not public\.gps_is_admin\(\) then/);
  assert.match(m1, /'campaign_marked_test', 'campaign_unmarked_test'\]\)\);/);
  const rb = read("supabase/migrations/rollback/20261025140000_test_campaign_rule.rollback.sql");
  assert.match(rb, /drop function if exists public\.admin_set_campaign_test\(uuid, boolean, text\);/);
  assert.match(rb, /drop trigger if exists campaigns_mark_test_account_trg on public\.campaigns;/);
});

test("rule: test-account e-mails only (no false positives on real-looking addresses)", () => {
  const pattern = m1.match(/~ '(\(\^\(qa\|test\)[^']+)'/)[1];
  const re = new RegExp(pattern);
  for (const e of ["qa-runtime-gate-bruzzano@volantinipro.it", "qa.runtime.console@volantinipro.invalid", "test@example.com",
    "test_user_driver3_a_1786521662733@example.com", "test-customer-e2e-final@volantinipro.it", "phase3-admin-x@example.test"]) assert.ok(re.test(e), e);
  for (const e of ["fenice.sp@gmail.com", "testa.mario@gmail.com", "qatar.office@gmail.com", "tester@azienda.it", "admin@volantinipro.it", "info@volantinipro.it"]) assert.ok(!re.test(e), e);
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
