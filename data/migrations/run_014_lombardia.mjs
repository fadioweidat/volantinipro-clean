/**
 * Runner: 014_seed_map_sectors_all_lombardia.sql
 * Connects directly to Supabase PostgreSQL via pg (session pooler).
 * Bypasses SQL Editor size limit by running statements in batches.
 *
 * Usage: node data/migrations/run_014_lombardia.mjs
 *
 * If connection fails, add to .env:
 *   SUPABASE_DB_PASSWORD=<your-db-password>
 * (Supabase Dashboard → Project Settings → Database → Database password)
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Load .env ─────────────────────────────────────────────────────────────────
function loadEnv() {
  const envPath = path.resolve(__dirname, '../../.env');
  try {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch {}
}
loadEnv();

const PROJECT_REF  = 'mqkelrsvksrzrpmbstvd';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DB_PASSWORD  = process.env.SUPABASE_DB_PASSWORD || SERVICE_KEY;

// Try multiple EU regions — Supabase session pooler needs the right one
const EU_REGIONS = [
  'eu-central-1',
  'eu-west-1',
  'eu-west-2',
  'eu-west-3',
  'eu-south-1',
  'us-east-1',
];

function buildCandidates() {
  const cands = [];

  // 1. Session pooler — one per region (JWT as password, new format)
  for (const region of EU_REGIONS) {
    cands.push({
      label:    `pooler ${region}`,
      host:     `aws-0-${region}.pooler.supabase.com`,
      port:     5432,
      database: 'postgres',
      user:     `postgres.${PROJECT_REF}`,
      password: SERVICE_KEY,
      ssl:      { rejectUnauthorized: false },
      connectionTimeoutMillis: 6000,
      statement_timeout: 300000,
    });
  }

  // 2. Direct connection (needs DB password, not JWT)
  if (DB_PASSWORD) {
    cands.push({
      label:    `direct db.supabase.co`,
      host:     `db.${PROJECT_REF}.supabase.co`,
      port:     5432,
      database: 'postgres',
      user:     'postgres',
      password: DB_PASSWORD,
      ssl:      { rejectUnauthorized: false },
      connectionTimeoutMillis: 6000,
      statement_timeout: 300000,
    });
  }

  // 3. Custom URL override
  if (process.env.DATABASE_URL || process.env.SUPABASE_DB_URL) {
    cands.unshift({
      label:            'custom DATABASE_URL',
      connectionString: process.env.DATABASE_URL || process.env.SUPABASE_DB_URL,
      ssl:              { rejectUnauthorized: false },
      statement_timeout: 300000,
    });
  }

  return cands;
}

// ── SQL splitter (handles $$...$$ dollar-quoted blocks) ───────────────────────
function splitStatements(sql) {
  const stmts = [];
  let cur = '';
  let inDq = false;
  let dqTag = '';

  for (const line of sql.split('\n')) {
    const t = line.trim();
    // Track dollar-quote state
    for (const tag of (t.match(/\$(\w*)\$/g) || [])) {
      if (!inDq) { inDq = true;  dqTag = tag; }
      else if (tag === dqTag) { inDq = false; dqTag = ''; }
    }
    cur += line + '\n';
    if (!inDq && t.endsWith(';')) {
      stmts.push(cur.trim());
      cur = '';
    }
  }
  if (cur.trim()) stmts.push(cur.trim());

  // Keep only statements that contain actual SQL (not pure comment blocks)
  return stmts.filter(s => {
    const noComments = s.split('\n')
      .filter(l => !l.trim().startsWith('--'))
      .join('\n')
      .trim();
    return noComments.length > 0;
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n── Migration 014: Lombardia settori operativi ──────────────');

  // 1. Read SQL
  const sqlPath = path.resolve(__dirname,
    '../../supabase/migrations/014_seed_map_sectors_all_lombardia.sql');
  console.log(`  File: ${sqlPath}`);
  const sql = readFileSync(sqlPath, 'utf8');
  const stmts = splitStatements(sql);
  const inserts = stmts.filter(s => s.includes('INSERT'));
  console.log(`  Statements totali: ${stmts.length}  (di cui INSERT: ${inserts.length})`);

  // 2. Connect — try candidates in order
  let client = null;
  const candidates = buildCandidates();

  for (const cfg of candidates) {
    const desc = cfg.connectionString
      ? cfg.label
      : `${cfg.label} (${cfg.user ?? 'postgres'}@${cfg.host})`;
    process.stdout.write(`  Provo ${desc} … `);
    try {
      const { label, ...connOpts } = cfg;
      const c = new Client(connOpts);
      await c.connect();
      client = c;
      console.log('connesso ✓');
      break;
    } catch (err) {
      console.log(`fallito (${err.message.split('\n')[0]})`);
    }
  }

  if (!client) {
    console.error('\n✗ Nessuna connessione disponibile.\n');
    console.error('  Per risolvere, aggiungi al file .env:');
    console.error('    SUPABASE_DB_PASSWORD=<password-database>');
    console.error('\n  Trovi la password in:');
    console.error('  Supabase Dashboard → Project Settings → Database → Database password\n');
    process.exit(1);
  }

  // 3. Execute statements in batches (single transaction)
  const BATCH = 50;
  let done = 0;

  console.log(`\n  Esecuzione ${stmts.length} statements (batch da ${BATCH})...\n`);

  try {
    await client.query('BEGIN');

    for (let i = 0; i < stmts.length; i += BATCH) {
      const batch = stmts.slice(i, i + BATCH);
      for (const stmt of batch) {
        try {
          await client.query(stmt);
          done++;
        } catch (err) {
          console.error(`\n✗ Errore al statement ${done + 1}:`);
          console.error(`  ${err.message.split('\n')[0]}`);
          console.error(`  SQL: ${stmt.substring(0, 120).replace(/\n/g, ' ')} …`);
          await client.query('ROLLBACK');
          await client.end();
          process.exit(1);
        }
      }

      const pct = Math.round((done / stmts.length) * 100);
      process.stdout.write(`\r  Progress: ${done}/${stmts.length} (${pct}%)   `);
    }

    await client.query('COMMIT');
    console.log('\n\n  COMMIT ✓');

  } catch (err) {
    console.error('\n✗ Errore imprevisto:', err.message);
    try { await client.query('ROLLBACK'); } catch {}
    await client.end();
    process.exit(1);
  }

  // 4. Verify
  console.log('\n  Verifica finale...');
  try {
    const res = await client.query(`
      SELECT
        COUNT(DISTINCT municipality_code) AS comuni,
        COUNT(*)                          AS settori
      FROM public.map_sectors
      WHERE service_type = 'd2d'
    `);
    const { comuni, settori } = res.rows[0];
    console.log(`\n  ┌─────────────────────────────────────┐`);
    console.log(`  │  Comuni processati  : ${String(comuni).padEnd(14)}│`);
    console.log(`  │  Settori generati   : ${String(settori).padEnd(14)}│`);
    console.log(`  └─────────────────────────────────────┘`);

    if (Number(comuni) >= 1400) {
      console.log(`\n  Migration 014 completata ✓\n`);
    } else {
      console.warn(`\n  ⚠ Comuni < 1400 — verifica manuale consigliata\n`);
    }
  } catch (err) {
    console.log(`  (verifica fallita: ${err.message})`);
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error('\n✗ Errore fatale:', err.message);
  process.exit(1);
});
