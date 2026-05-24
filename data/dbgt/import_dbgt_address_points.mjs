import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");
const downloadsDir = path.join(__dirname, "downloads");
const processedDir = path.join(__dirname, "processed");

const LAYER_CANDIDATES = {
  dbgt_limiti_comunali: ["limiti_comunali", "Limiti Comunali", "A010101"],
  dbgt_toponimo_stradale: ["toponimo_stradale", "Classe 030101 - Toponimo stradale", "TP_STR"],
  dbgt_toponimo_nome: ["toponimo_stradale_nome", "Classe 030101 - Toponimo stradale - nome", "TP_STR_NOME"],
  dbgt_numero_civico: ["numero_civico", "Classe 030102 - Numero civico", "NCIV"],
  dbgt_accesso_esterno: ["accesso_esterno_posizione", "Classe 030104 - Accesso esterno/passo carrabile - posizione", "AC_EST_POS", "ACCESSO_EST"],
  dbgt_accesso_numero_civico: ["accesso_numero_civico", "Associazione N-N - Accesso esterno/passo carrabile - Numero civico", "AC_EST_NCIV"],
};

const IMPORT_SQL = {
  dbgt_limiti_comunali: (layer) => `
    select
      CLASSREF as source_id,
      COD_ISTATN as codice_comune,
      NOME_COM as comune,
      SIG_PRO as sigla_provincia,
      NOME_PRO as provincia,
      DOWNLOAD as download_url,
      ANNO_RIL_AGG as anno_ril_agg
    from "${layer}"
  `,
  dbgt_toponimo_stradale: (layer) => `
    select
      CLASSID as source_id,
      CMDITP as codice_comune_ref,
      TP_STR_COD as codice,
      TP_STR_TOP as tipo_toponimo,
      FONTE as fonte,
      SCALA as scala,
      COD_CONS as cod_cons
    from "${layer}"
  `,
  dbgt_toponimo_nome: (layer) => `
    select
      CLASSREF as source_id,
      LINGUA as lingua,
      NOME as nome,
      COD_CONS as cod_cons
    from "${layer}"
  `,
  dbgt_numero_civico: (layer) => `
    select
      CLASSID as source_id,
      CIVICO_NUM as numero,
      CIVICO_SUB as subalterno,
      TPDICV as toponimo_id,
      FONTE as fonte,
      SCALA as scala,
      COD_CONS as cod_cons
    from "${layer}"
  `,
  dbgt_accesso_esterno: (layer) => `
    select
      CLASSREF as source_id,
      COD_CONS as cod_cons
    from "${layer}"
  `,
  dbgt_accesso_numero_civico: (layer) => `
    select
      AEDICV as accesso_id,
      CVDIAE as civico_id,
      COD_CONS as cod_cons
    from "${layer}"
  `,
};

function parseArgs() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
      const [key, value = "true"] = arg.replace(/^--/, "").split("=");
      return [key, value];
    }),
  );
  return {
    province: args.province?.toUpperCase() || null,
    allProvinces: args["all-provinces"] === "true",
    file: args.file || null,
    dryRun: args["dry-run"] === "true",
    materializeOnly: args["materialize-only"] === "true",
  };
}

function loadEnv() {
  const envPath = path.join(rootDir, ".env");
  if (!fs.existsSync(envPath)) return {};
  const out = {};
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#") || !line.includes("=")) continue;
    const [key, ...rest] = line.split("=");
    out[key.trim()] = rest.join("=").trim();
  }
  return out;
}

function run(command, args, options = {}) {
  const res = spawnSync(command, args, { stdio: options.capture ? "pipe" : "inherit", encoding: "utf8" });
  if (res.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed${res.stderr ? `: ${res.stderr}` : ""}`);
  }
  return res.stdout || "";
}

function hasCommand(command) {
  const res = spawnSync(command, ["--version"], { stdio: "ignore" });
  return res.status === 0;
}

function findGpkgFiles(options) {
  if (options.file) return [path.resolve(rootDir, options.file)];
  const roots = [];
  if (options.allProvinces) roots.push(downloadsDir);
  else roots.push(path.join(downloadsDir, options.province || "MI"));
  const out = [];
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, item.name);
      if (item.isDirectory()) walk(full);
      else if (item.name.toLowerCase() === "dbgt.gpkg") out.push(full);
    }
  }
  roots.forEach(walk);
  return out;
}

function listLayers(gpkg) {
  const output = run("ogrinfo", ["-ro", gpkg], { capture: true });
  return output
    .split(/\r?\n/)
    .map((line) => line.match(/^\d+:\s+(.+?)(?:\s+\(|$)/)?.[1]?.trim())
    .filter(Boolean);
}

function pickLayer(layers, candidates) {
  const normalized = layers.map((layer) => ({ raw: layer, key: layer.toLowerCase().replace(/[^a-z0-9]+/g, "") }));
  for (const candidate of candidates) {
    const key = candidate.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const exact = normalized.find((layer) => layer.key === key);
    if (exact) return exact.raw;
    const contains = normalized.find((layer) => layer.key.includes(key) || key.includes(layer.key));
    if (contains) return contains.raw;
  }
  return null;
}

function importLayer({ dbUrl, gpkg, layer, targetTable, dryRun }) {
  const sql = IMPORT_SQL[targetTable]?.(layer);
  const args = [
    "-f", "PostgreSQL",
    dbUrl,
    gpkg,
    "-nln", `public.${targetTable}`,
    "-append",
    "-lco", "GEOMETRY_NAME=geom",
    "-t_srs", "EPSG:4326",
  ];
  if (sql) args.push("-dialect", "SQLite", "-sql", sql);
  else args.push(layer);
  if (targetTable === "dbgt_limiti_comunali") args.push("-nlt", "MULTIPOLYGON");
  else if (targetTable === "dbgt_accesso_esterno") args.push("-nlt", "POINT");
  else args.push("-nlt", "NONE");
  if (["dbgt_limiti_comunali", "dbgt_toponimo_stradale", "dbgt_numero_civico", "dbgt_accesso_esterno"].includes(targetTable)) {
    args.push("-upsert");
  }
  if (dryRun) {
    console.log(`ogr2ogr ${args.join(" ")}`);
    return;
  }
  run("ogr2ogr", args);
}

function materialize(dbUrl, province, dryRun) {
  const sql = `select public.materialize_dbgt_address_points(${province ? `'${province.replace(/'/g, "''")}'` : "null"});`;
  if (dryRun) {
    console.log(`psql "${dbUrl}" -c "${sql}"`);
    return;
  }
  run("psql", [dbUrl, "-c", sql]);
}

async function main() {
  fs.mkdirSync(processedDir, { recursive: true });
  const options = parseArgs();
  const env = { ...loadEnv(), ...process.env };
  const dbUrl = env.SUPABASE_DB_URL || env.DATABASE_URL;
  if (!dbUrl) throw new Error("Missing SUPABASE_DB_URL or DATABASE_URL for PostGIS import.");
  if (!hasCommand("ogr2ogr")) throw new Error("GDAL ogr2ogr is required for DBGT GPKG import.");
  if (!hasCommand("ogrinfo")) throw new Error("GDAL ogrinfo is required for DBGT GPKG import.");
  if (!options.dryRun && !hasCommand("psql")) throw new Error("psql is required to run materialization SQL.");

  const report = { imported_files: [], materialized: false };
  const gpkgFiles = options.materializeOnly ? [] : findGpkgFiles(options);
  if (!options.materializeOnly && gpkgFiles.length === 0) {
    throw new Error("No dbgt.gpkg files found. Run data/dbgt/download_dbgt_lombardia.mjs first.");
  }

  for (const gpkg of gpkgFiles) {
    const layers = listLayers(gpkg);
    const fileReport = { gpkg: path.relative(rootDir, gpkg), layers: {} };
    for (const [targetTable, candidates] of Object.entries(LAYER_CANDIDATES)) {
      const layer = pickLayer(layers, candidates);
      fileReport.layers[targetTable] = layer || null;
      if (!layer) continue;
      importLayer({ dbUrl, gpkg, layer, targetTable, dryRun: options.dryRun });
    }
    report.imported_files.push(fileReport);
  }

  materialize(dbUrl, options.province, options.dryRun);
  report.materialized = true;
  fs.writeFileSync(path.join(processedDir, "dbgt_import_report.json"), JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
