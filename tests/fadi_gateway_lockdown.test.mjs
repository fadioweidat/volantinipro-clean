import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../supabase/functions/fadi-gateway/index.ts", import.meta.url), "utf8");
const live = readFileSync(new URL("./live_acceptance.mjs", import.meta.url), "utf8");

test("the only accepted credential is FADI_ONE_SECRET", () => {
  assert.doesNotMatch(source, /token === ["'`]/);
  assert.match(source, /return constantTimeEqual\(token, secret\);/);
  assert.match(live, /process\.env\.FADI_ONE_SECRET/);
  assert.doesNotMatch(live, /const SECRET = ["'`]/);
});

test("a request without an allowed Origin never passes", () => {
  assert.doesNotMatch(source, /if \(!origin\) return true/);
  assert.match(source, /Boolean\(origin\) && allowedOrigins\(\)\.has/);
});

test("the consistency audit selects no tokens, contacts or metadata", () => {
  assert.doesNotMatch(source, /select\("\*"\)/);
  for (const field of ["access_token", "session_token", "contact_email", "contact_phone", "driver_phone", "client_email", "metadata", "email", "phone", "vat_number"]) {
    assert.doesNotMatch(source, new RegExp('select\\("[^"]*\\b' + field + '\\b'), field);
  }
});
