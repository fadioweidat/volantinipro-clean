// HARDENING Centro Controllo Sito — Priorità 1: errori realmente attivi.
// Source-text/contract tests sulla migration additiva + unit test sul
// fingerprint client-side. Nessun DB live in CI (stesso approccio del resto
// del progetto per le migration SQL).

import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const migration = fs.readFileSync(path.join(root, "supabase", "migrations", "20260901120000_error_log_hardening.sql"), "utf8");
const errorLogSrc = fs.readFileSync(path.join(root, "src", "lib", "monitoring", "errorLog.js"), "utf8");
const platformHealthSrc = fs.readFileSync(path.join(root, "src", "lib", "monitoring", "platformHealth.js"), "utf8");
const authHealthSrc = fs.readFileSync(path.join(root, "src", "lib", "monitoring", "authHealth.js"), "utf8");
const adminApiSrc = fs.readFileSync(path.join(root, "src", "lib", "services", "admin-api.js"), "utf8");
const platformStatusSrc = fs.readFileSync(path.join(root, "src", "pages", "admin", "PlatformStatus.jsx"), "utf8");

// ---- Migration: colonne additive, mai distruttiva ----

test("1. Migration additiva: ADD COLUMN IF NOT EXISTS per fingerprint/last_seen_at/occurrence_count/origin/release/resolved_note", () => {
  for (const col of ["fingerprint", "last_seen_at", "occurrence_count", "origin", "release", "resolved_note"]) {
    assert.match(migration, new RegExp(`ADD COLUMN IF NOT EXISTS "${col}"`), `manca ADD COLUMN IF NOT EXISTS ${col}`);
  }
  assert.match(migration, /occurrence_count" integer NOT NULL DEFAULT 1/);
});

test("2. Migration non contiene nessun DROP/DELETE/TRUNCATE su error_log (solo additiva)", () => {
  assert.doesNotMatch(migration, /drop\s+table/i);
  assert.doesNotMatch(migration, /drop\s+column/i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.error_log/i);
  assert.doesNotMatch(migration, /truncate/i);
});

test("3. Backfill last_seen_at = created_at per le righe storiche", () => {
  assert.match(migration, /UPDATE "public"\."error_log" SET "last_seen_at" = "created_at" WHERE "last_seen_at" IS NULL/);
});

test("4. Indice unico PARZIALE su fingerprint solo per le righe ancora aperte", () => {
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS "error_log_open_fingerprint_uidx"[\s\S]*?ON "public"\."error_log" \("fingerprint"\)[\s\S]*?WHERE \("status" = 'open' AND "fingerprint" IS NOT NULL\)/);
});

// ---- Migration: RPC error_log_record ----

const RECORD_FN = migration.slice(
  migration.indexOf('CREATE OR REPLACE FUNCTION "public"."error_log_record"'),
  migration.indexOf('CREATE OR REPLACE FUNCTION "public"."error_log_auto_resolve"'),
);

test("5. error_log_record e' SECURITY DEFINER con search_path esplicito", () => {
  assert.ok(RECORD_FN.length > 0, "blocco error_log_record non isolato");
  assert.match(RECORD_FN, /LANGUAGE "plpgsql" SECURITY DEFINER/);
  assert.match(RECORD_FN, /SET "search_path" TO 'public'/);
});

test("6. error_log_record fa upsert per fingerprint aperto: ON CONFLICT ... WHERE status='open' DO UPDATE occurrence_count+1, last_seen_at=now()", () => {
  assert.match(RECORD_FN, /on conflict \(fingerprint\) where \(status = 'open' and fingerprint is not null\)/i);
  assert.match(RECORD_FN, /occurrence_count = public\.error_log\.occurrence_count \+ 1/i);
  assert.match(RECORD_FN, /last_seen_at = now\(\)/i);
});

test("7. error_log_record valida la category sull'allowlist (stessa dei CHECK constraint) e tronca il messaggio a 500", () => {
  assert.match(RECORD_FN, /'frontend','api','supabase','edge_function','auth','submit_campaign','quote','gps','driver'/);
  assert.match(RECORD_FN, /left\(coalesce\(p_message, ''\), 500\)/);
});

test("8. error_log_record e' eseguibile da anon e authenticated (come l'INSERT diretto), REVOKE da PUBLIC", () => {
  assert.match(migration, /GRANT EXECUTE ON FUNCTION "public"\."error_log_record"\([^)]*\) TO "anon"/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION "public"\."error_log_record"\([^)]*\) TO "authenticated"/);
  assert.match(migration, /REVOKE ALL ON FUNCTION "public"\."error_log_record"\([^)]*\) FROM PUBLIC/);
});

// ---- Migration: auto-resolve 72h, mai un DELETE ----

test("9. error_log_auto_resolve chiude (status=resolved, resolved_at=now(), resolved_note='auto') e NON cancella mai", () => {
  const fn = migration.slice(migration.indexOf('CREATE OR REPLACE FUNCTION "public"."error_log_auto_resolve"'), migration.indexOf("SELECT cron.schedule("));
  assert.match(fn, /set status = 'resolved'/i);
  assert.match(fn, /resolved_at = now\(\)/i);
  assert.match(fn, /resolved_note = 'auto'/i);
  assert.match(fn, /where status = 'open'/i);
  assert.doesNotMatch(fn, /delete/i);
});

test("10. auto-resolve: default 72h, soglia su coalesce(last_seen_at, created_at)", () => {
  assert.match(migration, /"error_log_auto_resolve"\("p_hours" integer DEFAULT 72\)/);
  assert.match(migration, /coalesce\(last_seen_at, created_at\) < now\(\) - make_interval\(hours => greatest\(p_hours, 1\)\)/);
});

test("11. auto-resolve e' SECURITY DEFINER, search_path esplicito, REVOKE da anon/authenticated/PUBLIC (come cleanup_monitoring_retention)", () => {
  const fn = migration.slice(migration.indexOf('FUNCTION "public"."error_log_auto_resolve"'));
  assert.match(fn, /SECURITY DEFINER/);
  assert.match(fn, /SET "search_path" TO 'public'/);
  assert.match(migration, /REVOKE ALL ON FUNCTION "public"\."error_log_auto_resolve"\(integer\) FROM "anon"/);
  assert.match(migration, /REVOKE ALL ON FUNCTION "public"\."error_log_auto_resolve"\(integer\) FROM "authenticated"/);
  assert.match(migration, /REVOKE ALL ON FUNCTION "public"\."error_log_auto_resolve"\(integer\) FROM PUBLIC/);
});

test("12. Job pg_cron dedicato (nome e cadenza distinti da collector e retention)", () => {
  assert.match(migration, /cron\.schedule\(\s*\n\s*'error-log-auto-resolve-hourly',\s*\n\s*'15 \* \* \* \*',\s*\n\s*\$cron\$SELECT public\.error_log_auto_resolve\(72\);\$cron\$/);
  assert.doesNotMatch(migration, /'platform-health-collector-every-5m'/);
  assert.doesNotMatch(migration, /'platform-monitoring-retention-daily'/);
});

test("13. Nessun secret/token nella migration", () => {
  assert.doesNotMatch(migration, /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/);
  assert.doesNotMatch(migration, /service_role/i);
});

// ---- errorLog.js: RPC + origin/release + fingerprint ----

test("14. errorLog.js scrive via RPC error_log_record, non piu' .from('error_log').insert(...)", async () => {
  assert.match(errorLogSrc, /\.rpc\(\s*["']error_log_record["']/);
  assert.doesNotMatch(errorLogSrc, /from\(["']error_log["']\)\s*\.insert\(/);
});

test("15. errorLog.js passa origin (window.location.host) e release (__COMMIT_SHA__)", () => {
  assert.match(errorLogSrc, /p_origin:\s*currentOrigin\(\)/);
  assert.match(errorLogSrc, /p_release:\s*currentRelease\(\)/);
  assert.match(errorLogSrc, /window\.location\.host/);
  assert.match(errorLogSrc, /__COMMIT_SHA__/);
});

test("16. logError accetta un fingerprint esplicito (override per gli health check)", () => {
  assert.match(errorLogSrc, /fingerprint = null\b/);
  assert.match(errorLogSrc, /const fp = fingerprint \|\| fingerprintFor\(/);
});

test("17. fingerprint: stesso errore con id/numeri diversi => stesso fingerprint; category diversa => diverso", async () => {
  const { computeErrorFingerprint } = await import("../src/lib/monitoring/errorLog.js");
  const a = computeErrorFingerprint("frontend", "/x", "Failed to fetch chunk 7f3a2b1c-0000-4000-8000-000000000001 (attempt 3)");
  const b = computeErrorFingerprint("frontend", "/x", "Failed to fetch chunk 9c1d4e5f-0000-4000-8000-000000000999 (attempt 41)");
  assert.equal(a, b, "UUID/numeri diversi non devono produrre fingerprint diversi");
  const c = computeErrorFingerprint("gps", "/x", "Failed to fetch chunk 7f3a2b1c-0000-4000-8000-000000000001 (attempt 3)");
  assert.notEqual(a, c, "category diversa => fingerprint diverso");
  assert.match(a, /^fp_[0-9a-f]+$/);
});

// ---- platformHealth.js / authHealth.js: fingerprint stabile, niente riga nuova per run ----

test("18. platformHealth.js: il re-log di ogni riga in errore usa un fingerprint STABILE `health:<key>`", () => {
  assert.match(platformHealthSrc, /fingerprint:\s*`health:\$\{row\.key\}`/);
});

test("19. authHealth.js: i logError degli health check auth passano un fingerprint stabile", () => {
  assert.match(authHealthSrc, /fingerprint:\s*"health:auth_infrastructure"/);
  assert.match(authHealthSrc, /fingerprint:\s*"health:admin_role_probe"/);
});

// ---- admin-api.js: finestre/limiti, niente select('*') sull'intera tabella ----

test("20. getPlatformStatusData non fa piu' selectOptionalTable('error_log') ne' un dump di gps_tracking_points", () => {
  const fn = adminApiSrc.slice(adminApiSrc.indexOf("export async function getPlatformStatusData"), adminApiSrc.indexOf("export async function resolveErrorLogEntry"));
  assert.doesNotMatch(fn, /selectOptionalTable\('error_log'\)/);
  assert.doesNotMatch(fn, /selectOptionalTable\('gps_tracking_points'/);
  assert.match(fn, /selectErrorLogForStatus\(\)/);
  assert.match(fn, /selectRecentGpsPointsForStatus\(\)/);
});

test("21. selectErrorLogForStatus: filtro (open OR ultimi 7gg) + limit esplicito", () => {
  const fn = adminApiSrc.slice(adminApiSrc.indexOf("async function selectErrorLogForStatus"), adminApiSrc.indexOf("async function selectRecentGpsPointsForStatus"));
  assert.match(fn, /\.or\(`status\.eq\.open,created_at\.gte\.\$\{cutoff\}`\)/);
  assert.match(fn, /\.limit\(/);
  assert.match(fn, /days = 7/);
});

test("22. selectRecentGpsPointsForStatus: finestra oraria + colonne minime + limit", () => {
  const fn = adminApiSrc.slice(adminApiSrc.indexOf("async function selectRecentGpsPointsForStatus"), adminApiSrc.indexOf("export async function getPlatformStatusData"));
  assert.match(fn, /\.select\('session_id, recorded_at, created_at'\)/);
  assert.match(fn, /\.gte\('recorded_at', cutoff\)/);
  assert.match(fn, /\.limit\(/);
});

test("23. getPlatformStatusData accetta un siteTrafficPromise condiviso (elimina la doppia getSiteTraffic)", () => {
  assert.match(adminApiSrc, /export async function getPlatformStatusData\(\{ siteTrafficPromise \} = \{\}\)/);
  assert.match(adminApiSrc, /siteTrafficPromise \|\| getSiteTraffic\(\)/);
});

test("24. getPlatformHealthHistory ha un tetto esplicito (.limit) oltre alla finestra temporale", () => {
  const fn = adminApiSrc.slice(adminApiSrc.indexOf("export async function getPlatformHealthHistory"), adminApiSrc.indexOf("export async function getPlatformIncidents"));
  assert.match(fn, /\.limit\(\d+\)/);
});

test("25. resolveErrorLogEntry (manuale 'Segna risolto') resta intatto: update status='resolved' + resolved_at", () => {
  const fn = adminApiSrc.slice(adminApiSrc.indexOf("export async function resolveErrorLogEntry"), adminApiSrc.indexOf("// Vista unificata"));
  assert.match(fn, /\.update\(\{ status: 'resolved', resolved_at: new Date\(\)\.toISOString\(\) \}\)/);
  assert.match(fn, /\.eq\('id', errorId\)/);
});

// ---- PlatformStatus.jsx: default prod-only, parallelizzazione ----

test("26. PlatformStatus: di default mostra solo status=open + origin=www.volantinipro.it; toggle per localhost/preview e risolti", () => {
  assert.match(platformStatusSrc, /const PROD_ORIGIN = 'www\.volantinipro\.it'/);
  assert.match(platformStatusSrc, /if \(!showResolvedErrors && row\.status !== 'open'\) return false/);
  assert.match(platformStatusSrc, /if \(!showAllOrigins && row\.origin && row\.origin !== PROD_ORIGIN\) return false/);
  assert.match(platformStatusSrc, /setShowAllOrigins/);
  assert.match(platformStatusSrc, /setShowResolvedErrors/);
});

test("27. PlatformStatus: colonne occurrence_count / primo visto / ultimo visto / release nel rendering", () => {
  assert.match(platformStatusSrc, /occurrence_count\) > 1/);
  assert.match(platformStatusSrc, /primo: \{formatRelative\(row\.created_at\)\}/);
  assert.match(platformStatusSrc, /ultimo: \{formatRelative\(row\.last_seen_at \|\| row\.created_at\)\}/);
  assert.match(platformStatusSrc, /rel: \$\{String\(row\.release\)/);
});

test("28. PlatformStatus.runFullCheck: una sola getSiteTraffic condivisa, fetch dati/config/health in parallelo", () => {
  const fn = platformStatusSrc.slice(platformStatusSrc.indexOf("const runFullCheck ="), platformStatusSrc.indexOf("useEffect(() => { runFullCheck"));
  assert.match(fn, /const siteTrafficPromise = getSiteTraffic\(\);/);
  assert.match(fn, /getPlatformStatusData\(\{ siteTrafficPromise \}\)/);
  assert.match(fn, /getSiteTrafficFn: \(\) => siteTrafficPromise/);
  // una sola vera chiamata a getSiteTraffic() (l'altra occorrenza e' nel commento)
  const codeOnly = fn.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  assert.equal((codeOnly.match(/getSiteTraffic\(\)/g) || []).length, 1);
  // le tre operazioni indipendenti in un unico Promise.all
  assert.match(fn, /Promise\.all\(\[\s*\n\s*getPlatformStatusData\([\s\S]*?getConfigStatus\(\)[\s\S]*?runPlatformHealthCheck\(/);
});

test("29. PlatformStatus: 'auto-risolto' distinto da 'risolto' manuale nel pill di stato", () => {
  assert.match(platformStatusSrc, /row\.resolved_note === 'auto' \? 'Auto-risolto' : 'Risolto'/);
});
