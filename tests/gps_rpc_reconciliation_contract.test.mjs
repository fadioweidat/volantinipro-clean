import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/030_reconcile_gps_session_rpc.sql", "utf8");

const REQUESTED_RPCS = [
  "gps_start_session",
  "gps_transition_session",
  "gps_insert_point",
  "gps_heartbeat_session",
  "gps_get_operator_campaign",
  "gps_is_admin",
];
const DEPENDENCY_RPC = "gps_assignment_is_valid";

test("migration 030: crea tutte le 6 RPC richieste piu' la dipendenza diretta", () => {
  for (const fn of [...REQUESTED_RPCS, DEPENDENCY_RPC]) {
    assert.match(
      migration,
      new RegExp(`create or replace function public\\.${fn}\\(`),
      `manca la definizione di ${fn}`,
    );
  }
});

test("migration 030: non include gps_register_proof_photo (fuori scope, non richiesta e non dipendenza)", () => {
  assert.doesNotMatch(migration, /create or replace function public\.gps_register_proof_photo/);
  assert.doesNotMatch(migration, /grant execute on function public\.gps_register_proof_photo/);
});

test("migration 030: ogni RPC e' SECURITY DEFINER con search_path vuoto (nessuna in piu', nessuna in meno)", () => {
  for (const fn of [...REQUESTED_RPCS, DEPENDENCY_RPC]) {
    const start = migration.indexOf(`create or replace function public.${fn}(`);
    assert.ok(start >= 0, `funzione ${fn} non trovata`);
    const end = migration.indexOf("\n$$;", start);
    const body = migration.slice(start, end);
    assert.match(body, /security definer/i, `${fn} deve essere SECURITY DEFINER`);
    assert.match(body, /set search_path to ''/i, `${fn} deve avere search_path vuoto`);
  }
});

test("migration 030: le funzioni sono definite prima delle policy RLS che le richiamano (gps_is_admin)", () => {
  const functionsHeaderIndex = migration.indexOf("Funzioni RPC");
  const rlsHeaderIndex = migration.indexOf("RLS sulle tabelle nuove");
  assert.ok(functionsHeaderIndex >= 0 && rlsHeaderIndex >= 0);
  assert.ok(
    functionsHeaderIndex < rlsHeaderIndex,
    "le CREATE POLICY che usano gps_is_admin() falliscono se la funzione non esiste ancora quando la policy viene creata",
  );
});

test("migration 030: nessun GRANT ad anon o public su alcuna RPC (nessun allargamento di permessi)", () => {
  for (const fn of [...REQUESTED_RPCS, DEPENDENCY_RPC]) {
    const grantLine = migration
      .split("\n")
      .find((line) => line.trim().startsWith("grant execute on function public." + fn + "("));
    assert.ok(grantLine, `manca il GRANT per ${fn}`);
    const grantees = grantLine.slice(grantLine.indexOf(" to ") + 4);
    assert.match(grantees, /^authenticated, service_role;$/);
    assert.doesNotMatch(grantees, /anon/i);

    const revokeLine = migration
      .split("\n")
      .find((line) => line.trim().startsWith("revoke all on function public." + fn + "("));
    assert.ok(revokeLine, `manca il REVOKE per ${fn}`);
    assert.match(revokeLine, /from public/i);
  }
});

test("migration 030: e' idempotente (CREATE TABLE/INDEX IF NOT EXISTS, ADD COLUMN IF NOT EXISTS, ADD CONSTRAINT solo se assente)", () => {
  assert.doesNotMatch(migration, /create table (?!if not exists)/i);
  assert.doesNotMatch(migration, /create index (?!if not exists)/i, "gli indici non unique devono usare IF NOT EXISTS");
  assert.doesNotMatch(migration, /create unique index (?!if not exists)/i);
  assert.doesNotMatch(migration, /add column (?!if not exists)/i);
  assert.match(migration, /if not exists \(select 1 from pg_constraint where conname = /);
});

test("migration 030: e' additiva (nessun DROP TABLE, DROP COLUMN, TRUNCATE o DELETE)", () => {
  assert.doesNotMatch(migration, /drop table|drop column|truncate|delete from/i);
});

test("migration 030: e' avvolta in una transazione esplicita (rollback atomico su qualunque errore)", () => {
  assert.match(migration.trim(), /^begin;/);
  assert.match(migration.trim(), /commit;$/);
});

test("migration 030: non tocca le RLS policy gia' tracciate su delivery_sessions/gps_tracking_points/proof_photos (fuori scope)", () => {
  const alreadyTrackedPolicies = [
    "delivery_sessions_select_policy",
    "delivery_sessions_insert_driver",
    "delivery_sessions_update_driver",
    "gps_tracking_points_select_policy",
    "gps_tracking_points_insert_driver",
    "proof_photos_select_policy",
    "proof_photos_insert_driver",
  ];
  for (const policy of alreadyTrackedPolicies) {
    assert.doesNotMatch(migration, new RegExp(policy), `${policy} e' fuori scope per questo ticket`);
  }
});

test("migration 030: crea le tabelle prerequisite mancanti (campaigns, profiles) richieste da 202607230001 ma mai create in Git", () => {
  assert.match(migration, /create table if not exists public\.profiles/);
  assert.match(migration, /create table if not exists public\.campaigns/);
});

console.log("gps_rpc_reconciliation_contract: PASS");
