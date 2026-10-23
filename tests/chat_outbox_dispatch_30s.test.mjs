// 2026-10-23 (approved): the chat realtime dispatch leaves at once when nothing is due, runs every
// 30 seconds (was 5) and its housekeeping every hour (was every 10 minutes). Rollback script exists.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const mig = read("supabase/migrations/20261023235000_chat_outbox_dispatch_every_30s.sql");
const rb = read("supabase/migrations/rollback/20261023235000_chat_outbox_dispatch_every_30s.rollback.sql");
const body = (sql) => sql.slice(sql.indexOf("CREATE OR REPLACE PROCEDURE"), sql.indexOf("$procedure$;") + 12);

test("early exit before any claim, commit or session setting", () => {
  const b = body(mig);
  const guard = b.indexOf("if not exists (select 1 from public.chat_realtime_outbox o");
  assert.ok(guard > 0);
  assert.ok(guard < b.indexOf("set_config('transaction_timeout'"));
  assert.ok(guard < b.indexOf("for update skip locked"));
  assert.ok(guard > b.indexOf("OUTBOX_PARAMETRI_NON_VALIDI"), "parameters still validated first");
  assert.match(b, /where o\.status = 'pending' and o\.next_attempt_at <= pg_catalog\.now\(\)\) then\n    return;/);
});

test("same procedure otherwise: removing the guard gives back the rollback (live) definition", () => {
  const withoutGuard = body(mig).replace(/  -- Nothing due[\s\S]*?    return;\n  end if;\n/, "");
  assert.equal(withoutGuard, body(rb));
});

test("schedules: 30 seconds and hourly; rollback restores 5 seconds and every 10 minutes", () => {
  assert.match(mig, /select cron\.schedule\('chat-realtime-outbox', '30 seconds', 'call public\.dispatch_chat_realtime_outbox\(\)'\);/);
  assert.match(mig, /select cron\.schedule\('chat-realtime-outbox-housekeeping', '0 \* \* \* \*', 'select public\.chat_realtime_outbox_housekeeping\(\)'\);/);
  assert.match(rb, /select cron\.schedule\('chat-realtime-outbox', '5 seconds', /);
  assert.match(rb, /select cron\.schedule\('chat-realtime-outbox-housekeeping', '\*\/10 \* \* \* \*', /);
  assert.doesNotMatch(mig.replace(/^--.*$/gm, ""), /DROP|TRUNCATE|unschedule/i);
});
