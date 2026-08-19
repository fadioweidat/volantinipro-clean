import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  CAMPAIGN_ACTIONS,
  getAllowedCampaignActions,
} from '../src/lib/services/admin-transitions-api.js';

const auditMigration = readFileSync('supabase/migrations/20260818120000_campaign_admin_action_log.sql', 'utf8');
const programRevokedMigration = readFileSync('supabase/migrations/20260818120100_assignment_program_revoked.sql', 'utf8');
const archivedMigration = readFileSync('supabase/migrations/20260818120150_campaign_status_archived.sql', 'utf8');
const transitionsMigration = readFileSync('supabase/migrations/20260818120200_admin_campaign_transitions.sql', 'utf8');
const adminApi = readFileSync('src/lib/services/admin-api.js', 'utf8');

test('P1 ADMIN CONTROL + ROLLBACK — state machine (getAllowedCampaignActions)', async (t) => {
  await t.test('draft: cancellabile e cancellabile a mano (delete), non archiviabile/riapribile/revocabile', () => {
    const actions = getAllowedCampaignActions({ status: 'draft', paymentStatus: 'non_disponibile', programStatus: 'nessun_programma' });
    assert.ok(actions.includes(CAMPAIGN_ACTIONS.CANCEL));
    assert.ok(actions.includes(CAMPAIGN_ACTIONS.DELETE));
    assert.ok(!actions.includes(CAMPAIGN_ACTIONS.ARCHIVE));
    assert.ok(!actions.includes(CAMPAIGN_ACTIONS.REOPEN));
    assert.ok(!actions.includes(CAMPAIGN_ACTIONS.REVOKE_PAYMENT));
  });

  await t.test('completed + pagato + programma inviato: cancel, archive, reopen, revoke_payment, revoke_program tutti validi', () => {
    // 'completed' e' un valido stato sorgente per il reopen (admin_reopen_campaign
    // ammette completed|cancelled|archived) — la campagna e' gia' conclusa ma
    // resta legittimamente riapribile, non e' un errore che compaia qui.
    const actions = getAllowedCampaignActions({ status: 'completed', paymentStatus: 'pagato', programStatus: 'inviato' });
    assert.ok(actions.includes(CAMPAIGN_ACTIONS.CANCEL));
    assert.ok(actions.includes(CAMPAIGN_ACTIONS.ARCHIVE));
    assert.ok(actions.includes(CAMPAIGN_ACTIONS.REOPEN));
    assert.ok(actions.includes(CAMPAIGN_ACTIONS.REVOKE_PAYMENT));
    assert.ok(actions.includes(CAMPAIGN_ACTIONS.REVOKE_PROGRAM));
    assert.ok(!actions.includes(CAMPAIGN_ACTIONS.DELETE));
  });

  await t.test('archived: solo reopen, mai cancel/archive di nuovo', () => {
    const actions = getAllowedCampaignActions({ status: 'archived', paymentStatus: 'non_disponibile', programStatus: 'nessun_programma' });
    assert.deepEqual(actions, [CAMPAIGN_ACTIONS.REOPEN]);
  });

  await t.test('cancelled: reopen e delete NON insieme (delete solo da draft)', () => {
    const actions = getAllowedCampaignActions({ status: 'cancelled', paymentStatus: 'non_disponibile', programStatus: 'nessun_programma' });
    assert.ok(actions.includes(CAMPAIGN_ACTIONS.REOPEN));
    assert.ok(actions.includes(CAMPAIGN_ACTIONS.ARCHIVE));
    assert.ok(!actions.includes(CAMPAIGN_ACTIONS.DELETE));
  });

  await t.test('nessuna campagna -> nessuna azione', () => {
    assert.deepEqual(getAllowedCampaignActions(null), []);
  });
});

test('P1 ADMIN CONTROL + ROLLBACK — programStatus ordering (admin-api.js)', async (t) => {
  await t.test('programStatus deriva dall\'evento program-related PIU\' RECENTE, non da "esiste almeno un evento di tipo X"', () => {
    assert.match(adminApi, /latestProgramLog/);
    assert.match(adminApi, /assignment_program_revoked/);
    assert.doesNotMatch(adminApi, /confirmedAt \? 'confermato' : openedAt \? 'aperto' : sentAt \? 'inviato' : 'da_inviare'/);
  });

  await t.test('logs filter include assignment_program_revoked (non solo sent/opened/confirmed)', () => {
    assert.match(adminApi, /'assignment_program_sent', 'assignment_program_opened', 'assignment_program_confirmed', 'assignment_program_revoked'/);
  });
});

test('P1 ADMIN CONTROL + ROLLBACK — migration invariants (contenuto reale applicato)', async (t) => {
  await t.test('audit log: reason NOT NULL/CHECK, campaign_id ON DELETE SET NULL (mai CASCADE)', () => {
    assert.match(auditMigration, /campaign_admin_action_log_reason_required/);
    assert.match(auditMigration, /nullif\(btrim\(reason\), ''\) is not null/);
    assert.match(auditMigration, /campaign_id uuid references public\.campaigns\(id\) on delete set null/);
    assert.doesNotMatch(auditMigration, /campaign_id uuid not null references public\.campaigns\(id\) on delete cascade/);
  });

  await t.test('audit log: snapshot immutabile via trigger anti-UPDATE', () => {
    assert.match(auditMigration, /protect_campaign_admin_action_log_snapshots/);
    assert.match(auditMigration, /SNAPSHOT_STORICO_IMMUTABILE/);
    assert.match(auditMigration, /before update of campaign_id_snapshot, campaign_title_snapshot/);
  });

  await t.test('admin_log_campaign_action: EXECUTE mai concesso a authenticated/anon, solo service_role', () => {
    assert.match(auditMigration, /revoke all on function public\.admin_log_campaign_action\(uuid, text, text, text, text\)\s*\n\s*from public, anon, authenticated;/);
    assert.match(auditMigration, /grant execute on function public\.admin_log_campaign_action\(uuid, text, text, text, text\)\s*\n\s*to service_role;/);
  });

  await t.test('log_assignment_event: firma reale a 3 argomenti (non 2) preservata, whitelist estesa', () => {
    assert.match(programRevokedMigration, /p_access_token text default null::text/);
    assert.match(programRevokedMigration, /assignment_program_revoked/);
    // I tre rami originali (sent/opened/confirmed) restano intatti
    assert.match(programRevokedMigration, /PROGRAM_NOT_OPENED/);
    assert.match(programRevokedMigration, /ASSIGNMENT_NOT_ACTIVE/);
  });

  await t.test('campaigns_status_check: superset (8 valori originali + archived), nessun UPDATE/DELETE di dati', () => {
    for (const value of ['draft', 'pending_review', 'approved', 'scheduled', 'in_progress', 'completed', 'cancelled', 'archived', 'problem']) {
      assert.match(archivedMigration, new RegExp(`'${value}'`));
    }
    assert.doesNotMatch(archivedMigration, /\bupdate\s+public\.campaigns\b/i);
    assert.doesNotMatch(archivedMigration, /\bdelete\s+from\b/i);
  });

  await t.test('transitions: ogni RPC verifica admin + reason prima di mutare stato', () => {
    for (const fn of ['admin_cancel_campaign', 'admin_reopen_campaign', 'admin_archive_campaign', 'admin_revoke_payment_confirmation', 'admin_revoke_assignment_program']) {
      const idx = transitionsMigration.indexOf(`create or replace function public.${fn}(`);
      assert.ok(idx >= 0, `${fn} non trovata`);
      const body = transitionsMigration.slice(idx, idx + 800);
      assert.match(body, /ADMIN_NON_AUTORIZZATO/);
      assert.match(body, /MOTIVO_OBBLIGATORIO/);
    }
  });

  await t.test('reopen da archived: ricostruisce lo stato precedente dall\'audit, non lo indovina', () => {
    assert.match(transitionsMigration, /select previous_state into v_last_archive_previous/);
    assert.match(transitionsMigration, /STATO_PRECEDENTE_NON_RICOSTRUIBILE/);
  });

  await t.test('payment revoke: payment_confirmed_at mai toccato (storico preservato)', () => {
    const idx = transitionsMigration.indexOf('create or replace function public.admin_revoke_payment_confirmation(');
    const body = transitionsMigration.slice(idx, idx + 1400);
    assert.doesNotMatch(body, /payment_confirmed_at\s*=/);
  });

  await t.test('program revoke: ordine cronologico reale (created_at desc), non "esiste almeno un sent"', () => {
    assert.match(transitionsMigration, /order by created_at desc\s*\n\s*limit 1/);
    assert.match(transitionsMigration, /PROGRAMMA_MAI_INVIATO/);
  });

  await t.test('nessuna migration tocca gps_tracking_points o delivery_sessions', () => {
    for (const migration of [auditMigration, programRevokedMigration, archivedMigration, transitionsMigration]) {
      assert.doesNotMatch(migration, /insert into public\.gps_tracking_points/);
      assert.doesNotMatch(migration, /update public\.gps_tracking_points/);
      assert.doesNotMatch(migration, /delete from public\.gps_tracking_points/);
      assert.doesNotMatch(migration, /delete from public\.delivery_sessions/);
    }
  });
});
