// 2026-10-23 (approved): the dispatch delivery check looked for realtime.messages.inserted_at =
// now() (transaction start) while realtime stamps the UTC clock time, so it never matched and
// every send was rolled back. It now finds the exact row by our message id, after the send started.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const mig = read("supabase/migrations/20261023236000_chat_outbox_delivery_check.sql");
const rb = read("supabase/migrations/rollback/20261023236000_chat_outbox_delivery_check.rollback.sql");
const code = (sql) => sql.replace(/^\s*--.*$/gm, "");

test("delivery check: exact row by our id, inserted after the send; no now() equality", () => {
  const c = code(mig);
  assert.match(c, /v_msg_id := pg_catalog\.gen_random_uuid\(\);\n\s*v_sent_after := pg_catalog\.timezone\('utc', pg_catalog\.clock_timestamp\(\)\);/);
  assert.match(c, /perform realtime\.send\(pg_catalog\.jsonb_build_object\('changed', true, 'id', v_msg_id\),\n\s*'messages_changed', v_topic, false\);/);
  assert.match(c, /and m\.inserted_at >= v_sent_after\n\s*and m\.payload ->> 'id' = v_msg_id::text/);
  assert.doesNotMatch(c, /m\.inserted_at = pg_catalog\.now\(\)/);
  assert.ok(c.indexOf("v_sent_after :=") < c.indexOf("perform realtime.send"), "time taken before the send");
});

test("everything else unchanged: early exit kept, rollback = previous live definition", () => {
  assert.match(mig, /if not exists \(select 1 from public\.chat_realtime_outbox o\n\s*where o\.status = 'pending' and o\.next_attempt_at <= pg_catalog\.now\(\)\) then\n\s*return;/);
  assert.match(code(rb), /m\.inserted_at = pg_catalog\.now\(\)::timestamp/);
  const strip = (s) => code(s).replace(/\n\s*\n/g, "\n");
  const migRestored = strip(mig)
    .replace(/  v_msg_id uuid;\n  v_sent_after timestamp;\n/, "")
    .replace(/\s*v_msg_id := [\s\S]*?'messages_changed', v_topic, false\);/, "\n        perform realtime.send('{\"changed\":true}'::jsonb, 'messages_changed', v_topic, false);")
    .replace(/and m\.inserted_at >= v_sent_after\n\s*and m\.payload ->> 'id' = v_msg_id::text/, "and m.inserted_at = pg_catalog.now()::timestamp");
  assert.equal(migRestored, strip(rb));
  assert.doesNotMatch(code(mig), /cron\.schedule|DROP|TRUNCATE/i);
});
