// Guardia di regressione — Manutenzione mensile FASE 3F (Marketplace):
// "privacy policy P1 ancora assente" + "trigger P3 ancora presente".
//
// La migration 20260903120000_marketplace_privacy_hardening.sql ha rimosso
// la policy campaigns_supplier_assigned_select (P1: leakage PII cliente al
// fornitore) e aggiunto il trigger campaigns_marketplace_assignment_guard_trg
// (P3: solo RPC/admin possono assegnare supplier_id o portare lo status a
// quote_selected/assigned). Un probe live richiederebbe una nuova RPC che
// esponga pg_policies/pg_trigger — nuova migration, fuori scope senza
// approvazione separata (vedi ticket FASE 11). Questa guardia statica
// verifica invece che nessuna migration successiva ricrei la policy o
// rimuova il trigger senza ricrearlo: gira in ogni npm test, quindi ad
// ogni manutenzione mensile che esegue la suite.
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const migrationsDir = path.join(root, "supabase", "migrations");
const HARDENING_FILE = "20260903120000_marketplace_privacy_hardening.sql";

function migrationsAfterHardening() {
  return fs.readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql") && name > HARDENING_FILE)
    .sort();
}

test("P1: nessuna migration successiva ricrea campaigns_supplier_assigned_select", () => {
  const offenders = migrationsAfterHardening().filter((name) => {
    const sql = fs.readFileSync(path.join(migrationsDir, name), "utf8");
    return /create\s+policy\s+campaigns_supplier_assigned_select/i.test(sql);
  });
  assert.deepEqual(offenders, [], `Policy P1 ricreata in: ${offenders.join(", ")}`);
});

test("P3: nessuna migration successiva rimuove campaigns_marketplace_assignment_guard_trg senza ricrearlo nello stesso file", () => {
  const offenders = migrationsAfterHardening().filter((name) => {
    const sql = fs.readFileSync(path.join(migrationsDir, name), "utf8");
    const dropsIt = /drop\s+trigger[^;]*campaigns_marketplace_assignment_guard_trg/i.test(sql);
    const recreatesIt = /create\s+trigger\s+campaigns_marketplace_assignment_guard_trg/i.test(sql);
    return dropsIt && !recreatesIt;
  });
  assert.deepEqual(offenders, [], `Trigger P3 rimosso senza ricrearlo in: ${offenders.join(", ")}`);
});

test("baseline: la migration di hardening rimuove la policy P1 e crea il trigger P3", () => {
  const sql = fs.readFileSync(path.join(migrationsDir, HARDENING_FILE), "utf8");
  assert.match(sql, /drop\s+policy\s+if\s+exists\s+campaigns_supplier_assigned_select/i);
  assert.match(sql, /create\s+trigger\s+campaigns_marketplace_assignment_guard_trg/i);
});
