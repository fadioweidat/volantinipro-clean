// 2026-10-22 DB space cleanup (approved): platform_health_checks retention from 90 to 30 days.
// Only that interval changes; incidents, error_log and site_events keep their retention.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../supabase/migrations/${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const before = read("20260826210000_monitoring_retention.sql");
const after = read("20261023213000_health_checks_retention_30_days.sql");
const fn = (sql) => sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION "public"."cleanup_monitoring_retention"'), sql.indexOf("$$;") + 3);

test("health checks keep 30 days; other tables unchanged; same grants", () => {
  assert.match(fn(after), /delete from public\.platform_health_checks\s*\n\s*where checked_at < now\(\) - interval '30 days';/);
  const normalise = (s) => s.replace("interval '30 days'", "interval '90 days'").replace("platform_health_checks: 30 giorni", "platform_health_checks: 90 giorni");
  assert.equal(normalise(fn(after)), fn(before), "only the health-check interval differs");
  for (const role of ["PUBLIC", '"anon"', '"authenticated"']) assert.ok(after.includes(`REVOKE ALL ON FUNCTION "public"."cleanup_monitoring_retention"() FROM ${role};`), role);
  assert.doesNotMatch(after, /cron\.schedule|delete from public\.platform_health_checks;/, "no new job, no unconditional delete");
});
