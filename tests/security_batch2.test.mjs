import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { escapeHtml, escapeHtmlDeep } from "../src/lib/pdf/escapeHtmlDeep.js";

const read = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");

test("print data cannot become markup", () => {
  assert.equal(escapeHtml('<img src=x onerror="a()">'), "&lt;img src=x onerror=&quot;a()&quot;&gt;");
  const safe = escapeHtmlDeep({ area: { mainArea: "<script>" }, list: ["'x'"], qty: 5, none: null });
  assert.deepEqual(safe, { area: { mainArea: "&lt;script&gt;" }, list: ["&#39;x&#39;"], qty: 5, none: null });
  for (const file of ["src/lib/pdf/printQuotePdf.js", "src/lib/pdf/printTerritorialReportPdf.js"]) {
    assert.match(read(file), /const rawData = escapeHtmlDeep\(unsafeData\);/);
  }
});

test("send-email-conferma has no public free-form branch", () => {
  const source = read("supabase/functions/send-email-conferma/index.ts");
  assert.doesNotMatch(source, /raw\.cliente|raw\.campagna|buildConfermaEmail/);
  assert.match(source, /code: "INVALID_TYPE"/);
  assert.match(source, /callerIsAdmin\(req\)/);
  assert.match(source, /code: "RATE_LIMIT_UNAVAILABLE"/);
});

test("analysis-poi-search checks the limit before any paid provider", () => {
  const source = read("supabase/functions/analysis-poi-search/index.ts");
  assert.ok(source.indexOf("poiLimitExceeded(supabase, req)") < source.indexOf("await googlePlacesProvider(lat"));
});

test("migration closes revoked tokens, admin pin and analytics cron", () => {
  const sql = read("supabase/migrations/20261031120000_security_batch2.sql");
  assert.match(sql, /ASSEGNAZIONE_REVOCATA/);
  assert.equal((sql.match(/select public\.gps_is_admin\(\)/g) || []).length >= 12, true);
  assert.doesNotMatch(sql, /pg_catalog\.(greatest|coalesce)/);
  assert.match(sql, /revoke execute on function public\.analytics_prune/);
});
