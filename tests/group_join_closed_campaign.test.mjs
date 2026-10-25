// 2026-10-25 (approved): the driver group link refuses entry when the campaign is archived,
// cancelled or completed, for all campaigns. Dry run on production (rolled back): approved -> new
// assignment; archived/cancelled/completed -> CAMPAGNA_*; device already joined, campaign then
// archived -> CAMPAGNA_ARCHIVIATA; with the rollback applied every case joined again as before.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const m = read("supabase/migrations/20261025170000_group_join_closed_campaign.sql");
const rb = read("supabase/migrations/rollback/20261025170000_group_join_closed_campaign.rollback.sql");

test("migration: campaign status checked after the link checks, before reuse and insert", () => {
  assert.match(m, /CREATE OR REPLACE FUNCTION public\.driver_group_join\(p_group_token text, p_device_id text, p_display_name text\)/);
  const expiry = m.indexOf("raise exception 'GROUP_LINK_SCADUTO'");
  const check = m.indexOf("select c.status into v_campaign_status");
  const reuse = m.indexOf("-- Same device -> same participant and same OP label.");
  const insert = m.indexOf("insert into public.operator_assignments (");
  assert.ok(expiry > 0 && check > expiry && reuse > check && insert > reuse);
  for (const [status, code] of [["archived", "CAMPAGNA_ARCHIVIATA"], ["cancelled", "CAMPAGNA_ANNULLATA"], ["completed", "CAMPAGNA_COMPLETATA"]]) {
    assert.match(m, new RegExp(`v_campaign_status = '${status}' then\\n    raise exception '${code}' using errcode = '42501';`));
  }
  assert.doesNotMatch(m.replace(/^\s*--.*$/gm, ""), /is_test|\bgrant\b|\brevoke\b/i);
});

test("rollback: previous definition, without the campaign check", () => {
  assert.match(rb, /CREATE OR REPLACE FUNCTION public\.driver_group_join\(p_group_token text, p_device_id text, p_display_name text\)/);
  assert.doesNotMatch(rb, /CAMPAGNA_ARCHIVIATA|v_campaign_status/);
  assert.equal(m.replace(/^--.*\n/gm, "").replace(/\n  -- The campaign must[\s\S]*?raise exception 'GROUP_LINK_NON_TROVATO' using errcode = '42501';\n  end if;\n/, "").replace("  v_campaign_status text;\n", "").trim(),
    rb.replace(/^--.*\n/gm, "").replace(/\n\ndelete from supabase_migrations[^\n]*\n$/, "").trim());
});

test("join page: clear message for each closed status", () => {
  const page = read("src/pages/driver/DriverGroupJoinPage.jsx");
  assert.match(page, /CAMPAGNA_ARCHIVIATA: 'Questa campagna e’ stata archiviata/);
  assert.match(page, /CAMPAGNA_ANNULLATA: 'Questa campagna e’ stata annullata/);
  assert.match(page, /CAMPAGNA_COMPLETATA: 'Questa campagna e’ gia’ completata/);
});
