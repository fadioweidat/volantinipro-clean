#!/usr/bin/env node
// DEPLOY-PLAN-4 — Production-safe migration runner.
//
// Applies ONLY the files inside supabase/migrations_production_safe/ (never
// supabase/migrations/, never supabase_migrations.schema_migrations, never
// `supabase db push`). Tracks its own ledger in
// public.volantinipro_release_migrations. See PRODUCTION_MIGRATION_LEDGER_ISOLATION.md
// for the full design rationale.
//
// Usage:
//   node scripts/deploy-production-migrations.mjs --dry-run [--dir <path>] [--release-name <name>]
//   node scripts/deploy-production-migrations.mjs --apply    [--dir <path>] [--release-name <name>]
//
// Connection: read exclusively from the DEPLOY_DB_URL environment variable
// (never hardcoded, never committed, never printed in full — only a masked
// host/db is logged). Fails immediately if unset.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { createHash } from 'node:crypto';
import pg from 'pg';

const DEFAULT_DIR = resolve(process.cwd(), 'supabase/migrations_production_safe');
const LEGACY_PATTERN = /^0\d{2}_|^00\d[_.]/; // defense-in-depth: refuse anything that looks like legacy 001/002/003-style naming
const VERSION_PATTERN = /^(\d{14})_/;

function parseArgs(argv) {
  const args = { mode: null, dir: DEFAULT_DIR, releaseName: 'deploy-plan-3-gps-gtfs-ai-territory' };
  for (const raw of argv) {
    if (raw === '--dry-run') args.mode = 'dry-run';
    else if (raw === '--apply') args.mode = 'apply';
    else if (raw.startsWith('--dir=')) args.dir = resolve(raw.slice('--dir='.length));
    else if (raw.startsWith('--release-name=')) args.releaseName = raw.slice('--release-name='.length);
    else throw new Error(`Argomento sconosciuto: ${raw}`);
  }
  if (!args.mode) throw new Error('Specificare --dry-run oppure --apply.');
  return args;
}

function maskConnectionString(url) {
  try {
    const u = new URL(url);
    const user = u.username ? u.username.slice(0, 2) + '***' : '';
    return `${u.protocol}//${user}@${u.hostname}:${u.port || '5432'}${u.pathname}`;
  } catch {
    return '(connection string non valida per il mascheramento — non stampata)';
  }
}

function loadMigrationFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.sql'))
    .map((e) => e.name)
    .sort(); // filename sort == version sort for this chain (YYYYMMDDHHMMSS_ prefix)

  const files = [];
  for (const name of entries) {
    if (LEGACY_PATTERN.test(name)) {
      throw new Error(
        `RIFIUTATO: "${name}" ha un nome in stile legacy (001/002/003-like) e non deve mai comparire in ` +
        `supabase/migrations_production_safe/. Il runner si ferma per sicurezza — non applica nulla.`
      );
    }
    const versionMatch = VERSION_PATTERN.exec(name);
    if (!versionMatch) {
      throw new Error(`RIFIUTATO: "${name}" non rispetta il formato versione "YYYYMMDDHHMMSS_nome.sql". Il runner si ferma.`);
    }
    // The read-only post-migration verification script (150004) is never applied as a schema change.
    if (name.includes('150004_gps_post_migration_verify')) continue;
    const fullPath = join(dir, name);
    const content = readFileSync(fullPath, 'utf8');
    // Hash the file exactly as authored (integrity check must reflect the real file on disk).
    const sha256 = createHash('sha256').update(content, 'utf8').digest('hex');
    // Each production-safe migration file already wraps itself in its own
    // `begin;` / `commit;` for standalone readability. The runner needs sole
    // control of the top-level transaction (to guarantee a real ROLLBACK in
    // --dry-run and a single atomic COMMIT in --apply), so the file's own
    // begin/commit are stripped here and re-applied by the runner itself.
    // Without this, a nested `begin;` inside an already-open transaction is
    // silently ignored by Postgres, and the file's own `commit;` commits the
    // runner's outer transaction too — defeating --dry-run's rollback.
    const body = content
      .replace(/^\s*begin\s*;\s*/i, '')
      .replace(/\s*commit\s*;\s*$/i, '');
    files.push({ version: versionMatch[1], filename: name, path: fullPath, content: body, rawContent: content, sha256 });
  }
  return files;
}

const LEDGER_DDL = `
create table if not exists public.volantinipro_release_migrations (
  version text primary key,
  filename text not null,
  sha256 text not null,
  applied_at timestamptz not null default now(),
  applied_by text not null,
  release_name text not null,
  execution_ms integer not null,
  status text not null check (status in ('success', 'failed'))
);
revoke all on table public.volantinipro_release_migrations from public, anon, authenticated;
`;

async function ensureLedger(client) {
  await client.query(LEDGER_DDL);
}

async function getLedgerRow(client, version) {
  const { rows } = await client.query(
    'select version, sha256, status from public.volantinipro_release_migrations where version = $1',
    [version]
  );
  return rows[0] || null;
}

async function recordLedgerRow(client, row) {
  await client.query(
    `insert into public.volantinipro_release_migrations
       (version, filename, sha256, applied_by, release_name, execution_ms, status)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (version) do update set
       filename = excluded.filename, sha256 = excluded.sha256, applied_at = now(),
       applied_by = excluded.applied_by, release_name = excluded.release_name,
       execution_ms = excluded.execution_ms, status = excluded.status`,
    [row.version, row.filename, row.sha256, row.appliedBy, row.releaseName, row.executionMs, row.status]
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dbUrl = process.env.DEPLOY_DB_URL;
  if (!dbUrl) {
    throw new Error('DEPLOY_DB_URL non impostata. Il runner non legge mai una connessione da altre fonti.');
  }

  const files = loadMigrationFiles(args.dir);
  console.log(`Directory sorgente: ${args.dir}`);
  console.log(`Connessione: ${maskConnectionString(dbUrl)}`);
  console.log(`Modalita: ${args.mode}`);
  console.log(`File trovati (ordine di applicazione): ${files.map((f) => f.filename).join(', ')}`);
  console.log('');

  const report = { mode: args.mode, dir: args.dir, releaseName: args.releaseName, startedAt: new Date().toISOString(), files: [] };
  const appliedBy = process.env.USER || process.env.USERNAME || 'unknown';

  if (args.mode === 'dry-run') {
    // Dry-run validates the WHOLE chain in one continuous transaction (never
    // committed): later files in this chain reference objects created by
    // earlier files (e.g. 150002 references the table created by 150001).
    // Rolling back after every individual file — as --apply's per-file
    // transactions correctly do — would make each subsequent file fail
    // against a database that no longer has the previous file's objects.
    // A single spanning transaction, rolled back only at the very end,
    // validates real executability against the current live state without
    // ever persisting anything.
    const client = new pg.Client({ connectionString: dbUrl });
    await client.connect();
    await client.query('begin');
    let aborted = false;
    try {
      for (const file of files) {
        console.log(`[DRY-RUN] ${file.filename} (sha256 ${file.sha256.slice(0, 12)}...)`);
        const startedAt = process.hrtime.bigint();
        try {
          await client.query(file.content);
          const executionMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
          report.files.push({ filename: file.filename, version: file.version, sha256: file.sha256, status: 'success', executionMs: Math.round(executionMs), error: null });
          console.log(`  -> OK in ${Math.round(executionMs)}ms`);
        } catch (err) {
          const executionMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
          report.files.push({ filename: file.filename, version: file.version, sha256: file.sha256, status: 'failed', executionMs: Math.round(executionMs), error: err.message });
          console.error(`[ERRORE] ${file.filename}: ${err.message}`);
          console.error('STOP — interruzione al primo errore, nessun file successivo verra validato.');
          report.aborted = true;
          report.abortReason = `Errore SQL in ${file.filename}: ${err.message}`;
          aborted = true;
          break;
        }
      }
    } finally {
      await client.query('rollback'); // dry-run NEVER commits, success or failure
      await client.end();
    }
    report.finishedAt = new Date().toISOString();
    if (!aborted) report.aborted = false;
    writeReport(report);
    if (aborted) process.exit(1);
    console.log('');
    console.log('Dry-run completato senza errori (nessuna modifica persistita — rollback finale eseguito).');
    return;
  }

  // --apply: one independent transaction per file, exactly as required —
  // each file commits on its own before the next one starts, and the ledger
  // row for that file is written right after its own commit.
  const bootstrapClient = new pg.Client({ connectionString: dbUrl });
  await bootstrapClient.connect();
  try {
    await ensureLedger(bootstrapClient);

    // If the ledger already records a version as successfully applied but
    // that version's file is no longer present in this run's file list, the
    // local chain is inconsistent with what was actually applied before —
    // e.g. a file was deleted or renamed. Refuse to proceed rather than
    // silently re-deriving an incomplete picture of the release.
    const { rows: ledgerVersions } = await bootstrapClient.query(
      "select version, filename from public.volantinipro_release_migrations where status = 'success'"
    );
    const presentVersions = new Set(files.map((f) => f.version));
    const missing = ledgerVersions.filter((row) => !presentVersions.has(row.version));
    if (missing.length > 0) {
      const msg = `File mancante rispetto al ledger: ${missing.map((m) => `${m.version} (${m.filename})`).join(', ')} ` +
        `risultano applicati con successo in precedenza ma non sono presenti in ${args.dir}. STOP — catena locale incompleta rispetto allo storico applicato.`;
      console.error(`[BLOCCATO] ${msg}`);
      report.aborted = true;
      report.abortReason = msg;
      report.finishedAt = new Date().toISOString();
      writeReport(report);
      process.exit(1);
    }

    for (const file of files) {
      const existing = await getLedgerRow(bootstrapClient, file.version);

      if (existing && existing.status === 'success' && existing.sha256 === file.sha256) {
        console.log(`[SKIP] ${file.filename} — gia' applicato con lo stesso hash (${file.sha256.slice(0, 12)}...)`);
        report.files.push({ filename: file.filename, version: file.version, sha256: file.sha256, status: 'skipped_already_applied', executionMs: 0 });
        continue;
      }
      if (existing && existing.status === 'success' && existing.sha256 !== file.sha256) {
        const msg = `HASH MISMATCH per la versione ${file.version} (${file.filename}): ledger=${existing.sha256}, file=${file.sha256}. ` +
          `Il contenuto applicato in precedenza differisce dal file attuale. STOP — nessuna applicazione ulteriore.`;
        console.error(`[BLOCCATO] ${msg}`);
        report.files.push({ filename: file.filename, version: file.version, sha256: file.sha256, status: 'blocked_hash_mismatch', executionMs: 0 });
        report.finishedAt = new Date().toISOString();
        report.aborted = true;
        report.abortReason = msg;
        writeReport(report);
        process.exit(1);
      }

      console.log(`[APPLY] ${file.filename} (sha256 ${file.sha256.slice(0, 12)}...)`);
      const fileClient = new pg.Client({ connectionString: dbUrl });
      await fileClient.connect();
      const startedAt = process.hrtime.bigint();
      let status = 'success';
      let errorMessage = null;
      try {
        await fileClient.query('begin');
        await fileClient.query(file.content);
        await fileClient.query('commit');
      } catch (err) {
        status = 'failed';
        errorMessage = err.message;
        try { await fileClient.query('rollback'); } catch { /* connection may already be aborted; ignored */ }
      } finally {
        await fileClient.end();
      }
      const executionMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

      await recordLedgerRow(bootstrapClient, {
        version: file.version, filename: file.filename, sha256: file.sha256,
        appliedBy, releaseName: args.releaseName, executionMs: Math.round(executionMs), status,
      });

      report.files.push({ filename: file.filename, version: file.version, sha256: file.sha256, status, executionMs: Math.round(executionMs), error: errorMessage });

      if (status === 'failed') {
        console.error(`[ERRORE] ${file.filename}: ${errorMessage}`);
        console.error('STOP — interruzione al primo errore, nessun file successivo verra applicato.');
        report.finishedAt = new Date().toISOString();
        report.aborted = true;
        report.abortReason = `Errore SQL in ${file.filename}: ${errorMessage}`;
        writeReport(report);
        process.exit(1);
      }
      console.log(`  -> OK in ${Math.round(executionMs)}ms`);
    }
  } finally {
    await bootstrapClient.end();
  }

  report.finishedAt = new Date().toISOString();
  report.aborted = false;
  writeReport(report);
  console.log('');
  console.log('Completato senza errori.');
}

function writeReport(report) {
  const outPath = resolve(process.cwd(), `deploy_report_${report.mode}_${Date.now()}.json`);
  writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`Report scritto in: ${outPath}`);
}

main().catch((err) => {
  console.error(`[FATALE] ${err.message}`);
  process.exit(1);
});
