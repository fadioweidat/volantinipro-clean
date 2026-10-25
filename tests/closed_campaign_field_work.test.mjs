// 2026-10-25 (approved): archived, cancelled or completed campaigns stop all field work, for every
// campaign. Dry run on production (rolled back): open session closed with end = last point (before
// and after the migration), app point / proof photo / new session / reopened session refused with
// CAMPAGNA_*, Traccar point dropped without error, job page gets 'campaign_closed'; with the
// rollback applied every write was accepted again and the closed session was reopened.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { campaignClosedError, mapDriverAssignmentLoadError, mapDriverActionError } from "../src/hooks/useDriverAssignment.js";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const m = read("supabase/migrations/20261025180000_closed_campaign_stops_field_work.sql");
const rb = read("supabase/migrations/rollback/20261025180000_closed_campaign_stops_field_work.rollback.sql");

test("server: writes refused on closed campaigns through table triggers", () => {
  for (const [status, code] of [["archived", "CAMPAGNA_ARCHIVIATA"], ["cancelled", "CAMPAGNA_ANNULLATA"], ["completed", "CAMPAGNA_COMPLETATA"]]) {
    assert.match(m, new RegExp(`when '${status}' then '${code}'`));
  }
  assert.match(m, /create trigger gps_tracking_points_closed_campaign_trg\n  before insert on public\.gps_tracking_points/);
  assert.match(m, /create trigger proof_photos_closed_campaign_trg\n  before insert on public\.proof_photos/);
  assert.match(m, /create trigger delivery_sessions_closed_campaign_trg\n  before insert or update on public\.delivery_sessions/);
  assert.match(m, /if tg_table_name = 'gps_tracking_points' and v_row ->> 'source' = 'traccar' then\n    return null;/);
  assert.match(m, /if tg_table_name = 'delivery_sessions' and v_row ->> 'status' not in \('started', 'paused'\) then\n    return new;/);
  assert.doesNotMatch(m, /on public\.issue_verification_photos|on public\.tracking_gps/);
});

test("server: open sessions closed with end = last GPS point, now and when a campaign closes", () => {
  assert.match(m, /ended_at = coalesce\(\n          \(select pg_catalog\.max\(p\.recorded_at\) from public\.gps_tracking_points p where p\.session_id = s\.id\),\n          s\.paused_at, s\.started_at\)/);
  assert.match(m, /after update of status on public\.campaigns\n  for each row\n  when \(new\.status in \('archived', 'cancelled', 'completed'\) and old\.status is distinct from new\.status\)/);
  assert.ok(m.indexOf("create table backup_ops.delivery_sessions_20261025 as") < m.indexOf("select public.close_sessions_of_closed_campaign(x.campaign_id)"));
  assert.match(m, /if tg_op = 'UPDATE' and new\.status in \('completed', 'cancelled'\) and old\.status in \('started', 'paused'\)/);
});

test("server: job page told the campaign is closed", () => {
  assert.match(m, /if v_campaign_status in \('archived', 'cancelled', 'completed'\) then\n    return jsonb_build_object\(/);
  assert.match(m, /'campaign_status', v_campaign_status,/);
  assert.match(m, /'error', 'campaign_closed'/);
});

test("rollback: previous definitions, triggers removed, closed sessions reopened", () => {
  assert.doesNotMatch(rb, /campaign_closed'|old\.status in \('started', 'paused'\)/);
  assert.match(rb, /CREATE OR REPLACE FUNCTION public\.get_public_driver_assignment\(p_assignment_id uuid\)/);
  assert.match(rb, /CREATE OR REPLACE FUNCTION public\.validate_delivery_session_assignment\(\)/);
  for (const t of ["campaigns_close_sessions_on_close_trg", "delivery_sessions_closed_campaign_trg", "proof_photos_closed_campaign_trg", "gps_tracking_points_closed_campaign_trg"]) {
    assert.ok(rb.includes(`drop trigger if exists ${t}`), t);
  }
  assert.match(rb, /from backup_ops\.delivery_sessions_20261025 b/);
});

test("driver page: clear message, page blocked", () => {
  assert.equal(mapDriverAssignmentLoadError(campaignClosedError("completed")), "Campagna completata: non ci sono altri lavori da svolgere.");
  assert.equal(mapDriverAssignmentLoadError(campaignClosedError("cancelled")), "Campagna annullata: non ci sono altri lavori da svolgere.");
  assert.equal(mapDriverAssignmentLoadError(campaignClosedError("archived")), "Campagna archiviata: non ci sono altri lavori da svolgere.");
  assert.equal(mapDriverActionError(new Error("CAMPAGNA_COMPLETATA")), "Campagna completata: non ci sono altri lavori da svolgere.");
  const hook = read("src/hooks/useDriverAssignment.js");
  assert.match(hook, /if \(rpcResult\.error === 'campaign_closed'\) throw campaignClosedError\(rpcResult\.campaign_status\);/);
  assert.match(hook, /if \(backgroundRefresh && hydratedRef\.current && !err\?\.campaignClosed\) \{/);
  assert.match(read("src/lib/services/gps-api.js"), /normalized\.includes\('CAMPAGNA_COMPLETATA'\)/);
});
