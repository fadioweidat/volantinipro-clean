import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations_legacy_pre_rebaseline_20260821/031_fix_gps_geom_trigger_search_path.sql", "utf8");
const migrationCode = migration
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");

test("migration 031: sostituisce esclusivamente set_gps_tracking_point_geom", () => {
  const createCount = (migration.match(/create or replace function/gi) || []).length;
  assert.equal(createCount, 1, "deve sostituire una sola funzione");
  assert.match(migration, /create or replace function public\.set_gps_tracking_point_geom\(\)/);
});

test("migration 031: imposta un search_path esplicito e sicuro sul trigger", () => {
  assert.match(migration, /set search_path to ''/i);
});

test("migration 031: le chiamate PostGIS sono schema-qualified con lo schema reale verificato (public)", () => {
  assert.match(migration, /public\.ST_SetSRID\(public\.ST_MakePoint\(new\.lng, new\.lat\), 4326\)/);
  assert.doesNotMatch(migration, /:= ST_SetSRID\(ST_MakePoint/, "le chiamate non devono restare non qualificate");
});

test("migration 031: non tocca RPC, tabelle, RLS o grant (nessuna altra istruzione DDL oltre alla funzione)", () => {
  assert.doesNotMatch(migrationCode, /create table|alter table|create policy|drop policy|^\s*grant |^\s*revoke |create trigger|drop trigger/im);
});

test("migration 031: non include altre funzioni GPS gia' riconciliate in GPS PHASE 4", () => {
  const otherRpcs = [
    "gps_start_session",
    "gps_transition_session",
    "gps_insert_point",
    "gps_heartbeat_session",
    "gps_get_operator_campaign",
    "gps_is_admin",
    "gps_assignment_is_valid",
  ];
  for (const fn of otherRpcs) {
    assert.doesNotMatch(migration, new RegExp(`create or replace function public\\.${fn}\\(`));
  }
});

test("migration 031: e' avvolta in una transazione esplicita (rollback atomico)", () => {
  assert.match(migration.trim(), /^begin;/);
  assert.match(migration.trim(), /commit;$/);
});

test("migration 031: nessun DROP TABLE, DELETE, TRUNCATE o modifica di dati", () => {
  assert.doesNotMatch(migration, /drop table|delete from|truncate|insert into|update \w+ set/i);
});

console.log("gps_geom_trigger_contract: PASS");
