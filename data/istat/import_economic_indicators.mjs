import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");
const downloadsDir = path.join(__dirname, "downloads");
const rawDir = path.join(__dirname, "raw");
const processedDir = path.join(__dirname, "processed");

function parseArgs() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
      const [key, value = "true"] = arg.replace(/^--/, "").split("=");
      return [key, value];
    }),
  );
  return {
    scope: (args.scope || process.env.ECONOMIC_IMPORT_SCOPE || "lombardia").toLowerCase(),
    dryRun: args["dry-run"] === "true" || process.env.ECONOMIC_DRY_RUN === "1",
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

function ensureDirs() {
  for (const dir of [downloadsDir, rawDir, processedDir]) fs.mkdirSync(dir, { recursive: true });
}

function listFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(full) : [full];
  });
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

function normalizeHeader(value) {
  return normalizeText(value).replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function asIstatCode(value) {
  if (value === null || value === undefined || value === "") return null;
  const text = String(value).trim().replace(/\.0$/, "");
  if (!/^\d+$/.test(text)) return null;
  return text.padStart(6, "0");
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Number(String(value).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function roundCurrency(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

function readWorkbookRows(file) {
  const workbook = XLSX.readFile(file, { cellDates: false });
  return workbook.SheetNames.flatMap((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    return XLSX.utils.sheet_to_json(sheet, { defval: null }).map((row) => {
      const normalized = {};
      for (const [key, value] of Object.entries(row)) normalized[normalizeHeader(key)] = value;
      return normalized;
    });
  });
}

function readDelimitedRows(file) {
  const text = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [];
  const separator = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ";" : ",";

  const parseLine = (line) => {
    const values = [];
    let current = "";
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (char === '"') {
        quoted = !quoted;
      } else if (char === separator && !quoted) {
        values.push(current);
        current = "";
      } else {
        current += char;
      }
    }
    values.push(current);
    return values;
  };

  const headers = parseLine(lines[0]).map((value) => normalizeHeader(value));
  return lines.slice(1).map((line) => {
    const cols = parseLine(line);
    const normalized = {};
    for (let i = 0; i < headers.length; i += 1) normalized[headers[i]] = cols[i] ?? null;
    return normalized;
  });
}

function municipalityIndex() {
  const geoPath = path.join(processedDir, "geo_municipalities_lombardia.json");
  if (!fs.existsSync(geoPath)) return new Map();
  const rows = JSON.parse(fs.readFileSync(geoPath, "utf8"));
  const map = new Map();
  for (const row of rows) {
    if (row.municipality_code) map.set(row.municipality_code, row);
    map.set(normalizeText(row.municipality_name), row);
    if (row.cadastral_code) map.set(normalizeText(row.cadastral_code), row);
  }
  return map;
}

function pick(row, names) {
  for (const name of names) {
    if (row[name] !== undefined && row[name] !== null && row[name] !== "") return row[name];
  }
  return null;
}

function resolveMunicipality(row, index) {
  const code = asIstatCode(pick(row, ["municipality_code", "codice_comune", "codice_istat_comune", "cod_com", "pro_com_t", "codice_istat"]));
  if (code && index.has(code)) return index.get(code);
  const cadastral = normalizeText(pick(row, ["cadastral_code", "codice_catastale", "cod_catastale", "codice_catasto"]));
  if (cadastral && index.has(cadastral)) return index.get(cadastral);
  const name = normalizeText(pick(row, ["municipality_name", "comune", "denominazione_comune", "nome_comune"]));
  if (name && index.has(name)) return index.get(name);
  return null;
}

function provinceMatches(row, municipality) {
  const code = asIstatCode(pick(row, ["municipality_code", "codice_comune", "codice_istat_comune", "cod_com", "pro_com_t", "codice_istat"]));
  if (code && municipality?.municipality_code && code === municipality.municipality_code) return true;
  const rowProvince = normalizeText(pick(row, ["sigla_provincia", "province_code", "codice_provincia", "provincia", "provincia_sigla"]));
  if (!rowProvince) return true;
  return rowProvince === normalizeText(municipality?.province_code) || rowProvince === normalizeText(municipality?.province_name);
}

function isMefIncomeFile(file) {
  const name = normalizeText(path.basename(file));
  return name.includes("irpef") && name.includes("comunale");
}

function isOfficialBusinessesFile(file) {
  const name = normalizeText(path.basename(file));
  return name.includes("asia") || name.includes("unita locali") || name.includes("imprese");
}

function isOfficialEmploymentFile(file) {
  const name = normalizeText(path.basename(file));
  return name.includes("occup") || name.includes("employment") || name.includes("lavoro");
}

function sourceLevel(row) {
  const explicit = normalizeText(pick(row, ["source_level", "livello_fonte", "livello_territoriale"]));
  if (explicit) return explicit;
  if (pick(row, ["municipality_code", "codice_comune", "cod_com", "pro_com_t"])) return "municipality";
  if (pick(row, ["province_code", "codice_provincia", "cod_prov"])) return "provincia";
  if (pick(row, ["region_code", "codice_regione", "cod_reg"])) return "regione";
  return "stima";
}

function collectEconomicRows(scope) {
  const files = [...listFiles(downloadsDir), ...listFiles(rawDir)].filter((file) => /\.(xlsx|xls|csv)$/i.test(file));
  const officialCandidates = files.filter(
    (file) => isMefIncomeFile(file) || isOfficialBusinessesFile(file) || isOfficialEmploymentFile(file),
  );
  const rows = [];
  for (const file of officialCandidates) {
    const parsed = /\.csv$/i.test(file) ? readDelimitedRows(file) : readWorkbookRows(file);
    for (const row of parsed) {
      if (scope === "lombardia") {
        const regionCodeRaw = pick(row, ["region_code", "codice_regione", "codice_istat_regione", "cod_reg"]);
        const regionCode = regionCodeRaw === null || regionCodeRaw === undefined || regionCodeRaw === ""
          ? ""
          : String(regionCodeRaw).padStart(2, "0");
        const regionName = normalizeText(pick(row, ["region_name", "regione"]));
        if (regionCode && regionCode !== "03") continue;
        if (regionName && regionName !== "lombardia") continue;
      }
      rows.push({
        file,
        row,
      });
    }
  }
  return { files: officialCandidates, rows };
}

function buildEconomicRecord(file, row, municipality, missingFieldReasons) {
  const mefIncomeFile = isMefIncomeFile(file);
  const businessesFile = isOfficialBusinessesFile(file);
  const employmentFile = isOfficialEmploymentFile(file);

  let averageIncome = null;
  let employmentRate = null;
  let businessesTotal = null;
  let sourceName = path.basename(file);
  let sourceYear = toNumber(pick(row, ["source_year", "anno", "year", "anno_di_imposta"]));
  let sourceLevelValue = sourceLevel(row);

  if (mefIncomeFile) {
    const taxableIncome = toNumber(pick(row, [
      "reddito_imponibile_ammontare_in_euro",
      "reddito_imponibile",
    ]));
    const contributors = toNumber(pick(row, [
      "numero_contribuenti",
      "reddito_imponibile_frequenza",
    ]));
    averageIncome = taxableIncome && contributors ? roundCurrency(taxableIncome / contributors) : null;
    sourceName = "MEF - Dichiarazioni fiscali";
    sourceLevelValue = "comune";
    if (averageIncome === null) missingFieldReasons.average_income ??= "MEF file present but taxable income / contributors columns were missing or empty.";
  }

  if (businessesFile) {
    const municipalityLevel = sourceLevelValue === "municipality" || sourceLevelValue === "comune";
    if (municipalityLevel) {
      businessesTotal = toNumber(pick(row, ["businesses_total", "totale_imprese", "imprese", "numero_imprese"]));
      if (businessesTotal !== null) {
        sourceName = sourceName === path.basename(file) ? "ISTAT ASIA" : sourceName;
      }
    }
    if (businessesTotal === null) missingFieldReasons.businesses_total ??= "No municipality-level official businesses file was available locally.";
  }

  if (employmentFile) {
    const level = sourceLevelValue;
    if (level === "municipality" || level === "comune") {
      employmentRate = toNumber(pick(row, ["employment_rate", "tasso_occupazione", "occupazione"]));
    }
    if (employmentRate === null) missingFieldReasons.employment_rate ??= "No municipality-level official employment file was available locally.";
  }

  return {
    municipality_code: municipality?.municipality_code || asIstatCode(pick(row, ["municipality_code", "codice_comune", "codice_istat_comune", "cod_com", "pro_com_t"])),
    municipality_name: municipality?.municipality_name || pick(row, ["municipality_name", "comune", "denominazione_comune", "nome_comune"]),
    average_income: averageIncome,
    employment_rate: employmentRate,
    businesses_total: businessesTotal,
    source_name: sourceName,
    source_year: sourceYear,
    source_level: sourceLevelValue,
    raw_payload: row,
  };
}

async function postBatch(url, key, rows) {
  const res = await fetch(`${url}/rest/v1/rpc/upsert_economic_indicators_batch`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ rows }),
  });
  if (!res.ok) throw new Error(`Supabase economic import failed (${res.status}): ${await res.text()}`);
  return res.json();
}

async function validate(url, key) {
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const res = await fetch(`${url}/rest/v1/economic_indicators?select=municipality_code,municipality_name,average_income,employment_rate,businesses_total,source_name,source_year,source_level&limit=20`, { headers });
  return res.ok ? await res.json() : { error: await res.text() };
}

async function main() {
  const { scope, dryRun } = parseArgs();
  const env = { ...loadEnv(), ...process.env };
  ensureDirs();

  const municipalityMap = municipalityIndex();
  const { files, rows } = collectEconomicRows(scope);
  const missingFieldReasons = {};
  const report = {
    import_scope: scope,
    source_files_used: files.map((file) => path.relative(rootDir, file)),
    rows_processed: rows.length,
    rows_inserted: 0,
    rows_updated: 0,
    skipped_rows: 0,
    missing_fields: {},
    validation_results: {},
  };

  const bestRowsByMunicipality = new Map();
  for (const { file, row } of rows) {
    const municipality = resolveMunicipality(row, municipalityMap);
    if (municipality && !provinceMatches(row, municipality)) continue;
    const built = buildEconomicRecord(file, row, municipality, missingFieldReasons);
    if (!built.municipality_code && !built.municipality_name) continue;
    const key = built.municipality_code || normalizeText(built.municipality_name);
    const score =
      Number(built.average_income !== null) * 4 +
      Number(built.businesses_total !== null) * 2 +
      Number(built.employment_rate !== null);
    const existing = bestRowsByMunicipality.get(key);
    const builtYear = built.source_year || 0;
    const existingYear = existing?.row?.source_year || 0;
    if (!existing || score > existing.score || (score === existing.score && builtYear > existingYear)) {
      bestRowsByMunicipality.set(key, { score, row: built });
    }
  }
  const outputRows = [...bestRowsByMunicipality.values()].map((entry) => entry.row);

  for (const field of ["average_income", "employment_rate", "businesses_total"]) {
    const missing = outputRows.filter((row) => row[field] === null || row[field] === undefined).length;
    if (missing) report.missing_fields[field] = missing;
  }
  if (Object.keys(missingFieldReasons).length > 0) report.validation_results.missing_field_reasons = missingFieldReasons;

  const outPath = path.join(processedDir, `economic_indicators_${scope}.json`);
  fs.writeFileSync(outPath, JSON.stringify(outputRows, null, 2), "utf8");

  if (!dryRun && outputRows.length > 0) {
    const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
    const key = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Missing VITE_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    for (let i = 0; i < outputRows.length; i += 250) {
      const result = await postBatch(url, key, outputRows.slice(i, i + 250));
      report.rows_inserted += Number(result.inserted || 0);
      report.rows_updated += Number(result.updated || 0);
      report.skipped_rows += Number(result.skipped || 0);
    }
    report.validation_results.supabase = await validate(url, key);
  }

  if (files.length === 0) {
    report.validation_results.notice = "No official economic source files found in data/istat/downloads or data/istat/raw.";
  }

  const reportPath = path.join(processedDir, `economic_import_report_${scope}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ error: error.message }, null, 2));
  process.exit(1);
});
