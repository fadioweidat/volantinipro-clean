// 2026-10-25 (approved): driver access closed on the archived test campaigns, with a copy of the
// rows in backup_ops and an exact rollback. Dry run on production: 56 assignments, 6 group links,
// 9 participants revoked; rollback restored all 56 assignments identical.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const code = (sql) => sql.replace(/^\s*--.*$/gm, "");
const m = code(read("supabase/migrations/20261025160000_revoke_test_driver_access.sql"));
const rb = code(read("supabase/migrations/rollback/20261025160000_revoke_test_driver_access.rollback.sql"));

test("migration: only archived test campaigns, backup first, no delete", () => {
  assert.doesNotMatch(m, /\bdelete\b|\btruncate\b|drop table/i);
  for (const t of ["operator_assignments", "driver_group_access_links", "driver_group_participants"]) {
    const backup = m.indexOf(`create table backup_ops.${t}_20261025 as`);
    const update = m.indexOf(`update public.${t} `);
    assert.ok(backup >= 0 && update > backup, `${t}: backup before update`);
    assert.match(m, new RegExp(`from public\\.${t} \\w\\n  join public\\.campaigns c on c\\.id = \\w\\.campaign_id\\n  where \\w\\.status = 'active' and c\\.is_test and c\\.status = 'archived';`));
    assert.match(m, new RegExp(`from backup_ops\\.${t}_20261025 b\\n  where \\w\\.id = b\\.id and \\w\\.status = 'active';`));
  }
  assert.match(m, /revoke all on schema backup_ops from public, anon, authenticated;/);
  assert.match(m, /'_revoked_by_migration', '20261025160000'/);
});

test("rollback: restores the copied values, only on rows revoked by this migration", () => {
  assert.match(rb, /set status = b\.status, revoked_at = b\.revoked_at, metadata = b\.metadata\n  from backup_ops\.operator_assignments_20261025 b/);
  assert.match(rb, /from backup_ops\.driver_group_access_links_20261025 b/);
  assert.match(rb, /from backup_ops\.driver_group_participants_20261025 b/);
  assert.equal((rb.match(/_revoked_by_migration' = '20261025160000'/g) || []).length, 2);
  assert.doesNotMatch(rb, /drop table|drop schema/i);
});

test("driver page treats a revoked assignment as blocked", () => {
  assert.match(read("src/pages/driver/DriverAssignmentPage.jsx"), /const isRevoked = assignmentData\?\.status === 'revoked';\n  const assignmentBlocksStart = isRevoked/);
});
