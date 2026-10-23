// 2026-10-23: pg_cron run history keeps 7 days, cleaned by a daily job (approved).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../supabase/migrations/20261023223000_cron_run_details_retention_7_days.sql", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("one daily job, only cron.job_run_details older than 7 days", () => {
  assert.match(sql, /SELECT cron\.schedule\(\n  'cron-run-details-retention-daily',\n  '45 3 \* \* \*',\n  \$cron\$DELETE FROM cron\.job_run_details WHERE end_time < now\(\) - interval '7 days';\$cron\$\n\);/);
  assert.equal((sql.match(/cron\.schedule\(/g) || []).length, 1);
  assert.doesNotMatch(sql.replace(/^--.*$/gm, ""), /net\._http_response|DROP|TRUNCATE|ALTER/i, "no other table touched");
});
