import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const envPath = path.resolve(__dirname, '../.env');
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

function buildConnectionConfigs() {
  const configs = [];
  if (CUSTOM_URL) {
    configs.push({ connectionString: CUSTOM_URL, ssl: { rejectUnauthorized: false } });
  }
  configs.push({
    host: `aws-0-eu-central-1.pooler.supabase.com`,
    port: 5432,
    database: 'postgres',
    user: `postgres.${PROJECT_REF}`,
    password: SERVICE_KEY,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 8000,
  });
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

function splitSqlStatements(sql) {
  const stmts = [];
  let current = '';
  let inDollarQuote = false;
  let dollarTag = '';

  const lines = sql.split('\n');
  for (const line of lines) {
    const stripped = line.trim();
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

async function run() {
  console.log('── Running GPS Monitor Admin Migration ──');
  const sqlPath = path.resolve(__dirname, '../supabase/migrations/20260628_gps_monitor_admin.sql');
  const sql = readFileSync(sqlPath, 'utf8');

  let client = null;
  for (const cfg of buildConnectionConfigs()) {
    const desc = cfg.connectionString ? 'CUSTOM_URL' : `${cfg.user}@${cfg.host}:${cfg.port}`;
    process.stdout.write(`Trying ${desc} ... `);
    try {
      client = await tryConnect(cfg);
      console.log('connected!');
      break;
    } catch (err) {
      console.log(`failed: ${err.message.split('\n')[0]}`);
    }
  }

  if (!client) {
    console.error('Could not connect to Supabase DB.');
    process.exit(1);
  }

  try {
    const stmts = splitSqlStatements(sql);
    let ok = 0;
    for (const stmt of stmts) {
      if (!stmt.trim()) continue;
      try {
        await client.query(stmt);
        ok++;
      } catch (err) {
        if (err.message.includes('already exists') || err.message.includes('IF NOT EXISTS')) {
          ok++;
        } else {
          console.error(`Statement failed: ${err.message.split('\n')[0]}`);
          console.error(`SQL: ${stmt.substring(0, 100)}...`);
        }
      }
    }
    console.log(`Executing reload schema...`);
    await client.query("NOTIFY pgrst, 'reload schema';");
    console.log(`Migration applied successfully! Statements executed: ${ok}`);
  } finally {
    await client.end();
  }
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
