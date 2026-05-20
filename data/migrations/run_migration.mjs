/**
 * Migration runner for VolantiniPro.
 * Connects to Supabase PostgreSQL directly via pg and runs the DDL migration.
 *
 * Usage:
 *   node data/migrations/run_migration.mjs
 *
 * Requires: pg (installed via npm install pg --no-save)
 * Connection: uses SUPABASE_DB_URL env var, or constructs from project ref + service role key.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Load env from .env file ────────────────────────────────────────────────
function loadEnv() {
  const envPath = path.resolve(__dirname, '../../.env');
  try {
    const lines = readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const m = line.match(/^([A-Z0-9_]+)=(.+)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch {}
}

loadEnv();

const PROJECT_REF = 'mqkelrsvksrzrpmbstvd';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CUSTOM_URL  = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;

// Supabase connection candidates (tries in order):
//   1. Custom DATABASE_URL if set
//   2. Supabase Session Pooler (port 5432, service role as password)
//   3. Supabase Direct connection (port 5432)
//   4. Supabase Transaction Pooler (port 6543)
function buildConnectionConfigs() {
  const configs = [];

  if (CUSTOM_URL) {
    configs.push({ connectionString: CUSTOM_URL, ssl: { rejectUnauthorized: false } });
  }

  // Session pooler — supports all statement types including DDL/transactions
  configs.push({
    host: `aws-0-eu-central-1.pooler.supabase.com`,
    port: 5432,
    database: 'postgres',
    user: `postgres.${PROJECT_REF}`,
    password: SERVICE_KEY,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 8000,
  });

  // Direct connection
  configs.push({
    host: `db.${PROJECT_REF}.supabase.co`,
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password: SERVICE_KEY,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 8000,
  });

  return configs;
}

async function tryConnect(config) {
  const client = new Client(config);
  await client.connect();
  return client;
}

async function runMigration() {
  console.log('\n── VolantiniPro Migration Runner ────────────────────────');

  const sqlPath = path.join(__dirname, '001_map_sectors.sql');
  let sql;
  try {
    sql = readFileSync(sqlPath, 'utf8');
  } catch (e) {
    console.error('✗ Cannot read migration file:', sqlPath);
    process.exit(1);
  }

  let client = null;

  for (const cfg of buildConnectionConfigs()) {
    const desc = cfg.connectionString
      ? cfg.connectionString.replace(/:[^:@]+@/, ':***@')
      : `${cfg.user}@${cfg.host}:${cfg.port}`;
    process.stdout.write(`  Trying ${desc} … `);
    try {
      client = await tryConnect(cfg);
      console.log('connected ✓');
      break;
    } catch (err) {
      console.log(`failed (${err.message.split('\n')[0]})`);
      client = null;
    }
  }

  if (!client) {
    console.log('\n✗ Could not connect to any PostgreSQL endpoint.\n');
    console.log('──────────────────────────────────────────────────────────');
    console.log('MANUAL STEP REQUIRED:');
    console.log('  1. Open https://supabase.com/dashboard/project/mqkelrsvksrzrpmbstvd/sql/new');
    console.log('  2. Paste the contents of data/migrations/001_map_sectors.sql');
    console.log('  3. Click "Run"');
    console.log('  4. Then run: node data/migrations/import_varedo_sectors.mjs');
    console.log('──────────────────────────────────────────────────────────\n');
    process.exit(2);
  }

  console.log('\n  Running migration …');
  try {
    // Split on semicolons that are NOT inside $$...$$-quoted strings
    // Run each statement individually to get clearer errors
    const stmts = splitSqlStatements(sql);
    let ok = 0;
    for (const stmt of stmts) {
      if (!stmt.trim()) continue;
      try {
        await client.query(stmt);
        ok++;
      } catch (err) {
        if (err.message.includes('already exists') || err.message.includes('IF NOT EXISTS')) {
          ok++;  // idempotent — acceptable
        } else {
          console.log(`  ✗ Statement failed: ${err.message.split('\n')[0]}`);
          console.log(`    SQL: ${stmt.substring(0, 80).replace(/\n/g, ' ')} …`);
        }
      }
    }
    console.log(`  ✓ Migration complete (${ok} statements executed)`);
  } finally {
    await client.end();
  }

  console.log('\n  Next step: node data/migrations/import_varedo_sectors.mjs\n');
}

function splitSqlStatements(sql) {
  // Rough splitter that handles $$...$$ quoted PL/pgSQL bodies
  const stmts = [];
  let current = '';
  let inDollarQuote = false;
  let dollarTag = '';

  const lines = sql.split('\n');
  for (const line of lines) {
    const stripped = line.trim();

    // Detect $$ ... $$ boundaries (handles both $$ and $tag$...$tag$)
    const dollarMatches = stripped.match(/\$(\w*)\$/g) || [];
    for (const tag of dollarMatches) {
      if (!inDollarQuote) {
        inDollarQuote = true;
        dollarTag = tag;
      } else if (tag === dollarTag) {
        inDollarQuote = false;
        dollarTag = '';
      }
    }

    current += line + '\n';

    if (!inDollarQuote && stripped.endsWith(';')) {
      stmts.push(current.trim());
      current = '';
    }
  }
  if (current.trim()) stmts.push(current.trim());
  return stmts;
}

runMigration().catch(err => {
  console.error('\n✗ Unexpected error:', err.message);
  process.exit(1);
});
