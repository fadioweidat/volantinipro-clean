import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import AdmZip from "adm-zip";
import shapefile from "shapefile";
import proj4 from "proj4";
import XLSX from "xlsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");
const downloadsDir = path.join(__dirname, "downloads");
const rawDir = path.join(__dirname, "raw");
const processedDir = path.join(__dirname, "processed");

const TARGET_MUNICIPALITIES = [
  "milano",
  "sesto san giovanni",
  "cinisello balsamo",
  "bresso",
  "cormano",
  "cusano milanino",
  "paderno dugnano",
  "varedo",
  "monza",
  "nova milanese",
  "bollate",
  "senago",
  "desio",
  "muggio",
  "muggiò",
  "lissone",
];

const RANDOM_VALIDATION = [
  "lecco",
  "como",
  "bergamo",
  "brescia",
  "milano",
  "varedo",
  "paderno dugnano",
  "cormano",
  "cusano milanino",
];

const REGION_CODES = {
  lombardia: "03",
};

const REGION_NAMES = {
  "03": "Lombardia",
};

const PROVINCE_NAMES = {
  "012": "Varese",
  "013": "Como",
  "014": "Sondrio",
  "015": "Milano",
  "016": "Bergamo",
  "017": "Brescia",
  "018": "Pavia",
  "019": "Cremona",
  "020": "Mantova",
  "097": "Lecco",
  "098": "Lodi",
  "108": "Monza e della Brianza",
  "215": "Milano",
};

proj4.defs("EPSG:32632", "+proj=utm +zone=32 +datum=WGS84 +units=m +no_defs +type=crs");

function parseArgs() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
      const [key, value = "true"] = arg.replace(/^--/, "").split("=");
      return [key, value];
    }),
  );
  return {
    scope: (args.scope || process.env.ISTAT_IMPORT_SCOPE || "lombardia").toLowerCase(),
    dryRun: args["dry-run"] === "true" || process.env.ISTAT_DRY_RUN === "1",
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

function extractDownloads(report) {
  for (const file of listFiles(downloadsDir).filter((item) => item.toLowerCase().endsWith(".zip"))) {
    const target = path.join(rawDir, path.basename(file, ".zip"));
    if (fs.existsSync(target) && listFiles(target).length > 0) continue;
    fs.mkdirSync(target, { recursive: true });
    new AdmZip(file).extractAllTo(target, true);
    report.source_files_used.push(path.relative(rootDir, file));
  }
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

function normalizeHeader(value) {
  return normalizeText(value).replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function pick(row, names) {
  for (const name of names) {
    if (row[name] !== undefined && row[name] !== null && row[name] !== "") return row[name];
  }
  return null;
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Number(String(value).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function asIstatCode(value) {
  if (value === null || value === undefined || value === "") return null;
  const text = String(value).trim().replace(/\.0$/, "");
  return text.padStart(6, "0");
}

function maybeTransformCoordinate(position) {
  const [x, y] = position;
  if (Math.abs(x) <= 180 && Math.abs(y) <= 90) return position;
  const [lng, lat] = proj4("EPSG:32632", "EPSG:4326", [x, y]);
  return [lng, lat];
}

function transformGeometry(geometry) {
  if (!geometry) return null;
  const walk = (coords) => {
    if (typeof coords?.[0] === "number") return maybeTransformCoordinate(coords);
    return coords.map(walk);
  };
  return { ...geometry, coordinates: walk(geometry.coordinates) };
}

function bboxCentroid(geometry) {
  const points = [];
  const walk = (coords) => {
    if (typeof coords?.[0] === "number") points.push(coords);
    else coords.forEach(walk);
  };
  walk(geometry.coordinates);
  if (!points.length) return { lat: null, lng: null };
  const lngs = points.map(([lng]) => lng);
  const lats = points.map(([, lat]) => lat);
  return {
    lat: (Math.min(...lats) + Math.max(...lats)) / 2,
    lng: (Math.min(...lngs) + Math.max(...lngs)) / 2,
  };
}

function findBoundaryShapefile() {
  const shpFiles = listFiles(rawDir).filter((file) => file.toLowerCase().endsWith(".shp"));
  return shpFiles.find((file) => /com/i.test(path.basename(file))) || shpFiles[0] || null;
}

async function readBoundaries(scope, report) {
  const shpPath = findBoundaryShapefile();
  if (!shpPath) throw new Error("No ISTAT municipality shapefile found in data/istat/downloads or data/istat/raw");
  report.source_files_used.push(path.relative(rootDir, shpPath));

  const municipalities = [];
  const source = await shapefile.open(shpPath, undefined, { encoding: "utf-8" });
  while (true) {
    const item = await source.read();
    if (item.done) break;
    const p = item.value.properties || {};
    const regionCode = String(p.COD_REG ?? p.COD_REGI ?? "").padStart(2, "0");
    if (scope === "lombardia" && regionCode !== REGION_CODES.lombardia) continue;
    const provinceCode = String(p.COD_PROV ?? p.COD_UTS ?? p.PROV_CM ?? "").padStart(3, "0");

    const geometry = transformGeometry(item.value.geometry);
    const centroid = geometry ? bboxCentroid(geometry) : { lat: null, lng: null };
    const areaM2 = toNumber(p.Shape_Area ?? p.SHAPE_AREA ?? p.AREA ?? p.AREA_M2);
    const population = toNumber(p.POP_RES ?? p.POPOLAZIONE ?? p.POP_TOT);
    const areaKm2 = areaM2 ? areaM2 / 1_000_000 : null;

    municipalities.push({
      country_code: "IT",
      region_code: regionCode || null,
      region_name: p.DEN_REG || p.REGIONE || REGION_NAMES[regionCode] || null,
      province_code: provinceCode || null,
      province_name: p.DEN_PROV || p.DEN_UTS || p.PROVINCIA || PROVINCE_NAMES[provinceCode] || null,
      municipality_code: asIstatCode(p.PRO_COM_T ?? p.PRO_COM ?? p.COD_COM ?? p.CODICE_COMUNE),
      municipality_name: p.COMUNE || p.DEN_COM || p.NOME_COM || p.DENOMINAZIONE || null,
      cadastral_code: p.COD_CATASTALE || p.COD_CATASTO || null,
      households_total: null,
      population_total: population,
      area_km2: areaKm2,
      density_per_km2: population && areaKm2 ? population / areaKm2 : null,
      centroid_lat: centroid.lat,
      centroid_lng: centroid.lng,
      geom_geojson: geometry,
    });
  }
  return municipalities.filter((row) => row.municipality_code && row.municipality_name);
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

function readCsvRows(file) {
  const workbook = XLSX.readFile(file, { type: "file", raw: false });
  const first = workbook.SheetNames[0];
  return XLSX.utils.sheet_to_json(workbook.Sheets[first], { defval: null }).map((row) => {
    const normalized = {};
    for (const [key, value] of Object.entries(row)) normalized[normalizeHeader(key)] = value;
    return normalized;
  });
}

function parseDelimitedLine(line) {
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
    } else if (char === ";" && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values.map((value) => value.replace(/^\uFEFF/, "").trim());
}

function readIstatCsvRows(file) {
  const text = fs.readFileSync(file, "utf8");
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const headerIndex = lines.findIndex((line) => /codice comune/i.test(line));
  if (headerIndex < 0) return [];
  const headers = parseDelimitedLine(lines[headerIndex]).map(normalizeHeader);
  return lines.slice(headerIndex + 1).map((line) => {
    const cols = parseDelimitedLine(line);
    const row = {};
    headers.forEach((header, idx) => {
      row[header] = cols[idx] ?? null;
    });
    return row;
  });
}

function mergeDemographicRecord(map, code, patch) {
  const current = map.get(code) || { municipality_code: code };
  map.set(code, { ...current, ...Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== null && value !== undefined)) });
}

function applyP2Rows(rows, demographics) {
  for (const row of rows) {
    const code = asIstatCode(pick(row, ["codice_comune"]));
    if (!code) continue;
    mergeDemographicRecord(demographics, code, {
      municipality_name: pick(row, ["comune"]),
      households_total: toNumber(pick(row, ["numero_di_famiglie_al_31_dicembre"])),
      population_total: toNumber(pick(row, ["popolazione_censita_al_31_dicembre_totale"])),
    });
  }
}

function applyPosasRows(rows, demographics) {
  const grouped = new Map();
  for (const row of rows) {
    const code = asIstatCode(pick(row, ["codice_comune"]));
    const age = toNumber(pick(row, ["eta"]));
    const total =
      toNumber(pick(row, ["totale"])) ??
      ((toNumber(pick(row, ["totale_maschi"])) ?? 0) + (toNumber(pick(row, ["totale_femmine"])) ?? 0));
    if (!code || age === null || total === null) continue;
    if (age < 0 || age > 120) continue;
    const current = grouped.get(code) || {
      municipality_name: pick(row, ["comune"]),
      total: 0,
      age_0_14: 0,
      age_15_34: 0,
      age_35_64: 0,
      age_65_plus: 0,
    };
    current.total += total;
    if (age <= 14) current.age_0_14 += total;
    else if (age <= 34) current.age_15_34 += total;
    else if (age <= 64) current.age_35_64 += total;
    else current.age_65_plus += total;
    grouped.set(code, current);
  }

  for (const [code, values] of grouped) {
    const pct = (value) => (values.total > 0 ? (value / values.total) * 100 : null);
    mergeDemographicRecord(demographics, code, {
      municipality_name: values.municipality_name,
      age_0_14_pct: pct(values.age_0_14),
      age_15_34_pct: pct(values.age_15_34),
      age_35_64_pct: pct(values.age_35_64),
      age_65_plus_pct: pct(values.age_65_plus),
    });
  }
}

function readDemographics(scope, report) {
  const files = [...listFiles(downloadsDir), ...listFiles(rawDir)].filter((file) => /\.(xlsx|xls|csv)$/i.test(file));
  const demographics = new Map();

  for (const file of files) {
    report.source_files_used.push(path.relative(rootDir, file));
    if (/\.csv$/i.test(file)) {
      const rows = readIstatCsvRows(file);
      const sampleHeaders = rows[0] ? Object.keys(rows[0]).join(" ") : "";
      if (sampleHeaders.includes("numero_di_famiglie_al_31_dicembre")) applyP2Rows(rows, demographics);
      if (sampleHeaders.includes("eta") && sampleHeaders.includes("totale_maschi")) applyPosasRows(rows, demographics);
      continue;
    }

    for (const row of readWorkbookRows(file)) {
      const regionCode = String(pick(row, ["cod_reg", "codice_regione", "codice_regione_numerico"]) || "").padStart(2, "0");
      if (scope === "lombardia" && regionCode && regionCode !== REGION_CODES.lombardia) continue;
      const code = asIstatCode(pick(row, ["pro_com_t", "pro_com", "codice_comune", "cod_com", "codice_istat", "istat"]));
      if (!code) continue;
      mergeDemographicRecord(demographics, code, {
        municipality_name: pick(row, ["comune", "den_com", "denominazione_comune", "nome_comune", "municipality_name"]),
        households_total: toNumber(pick(row, ["famiglie", "numero_famiglie", "famiglie_totale", "totale_famiglie"])),
        population_total: toNumber(pick(row, ["popolazione", "popolazione_residente", "pop_res", "totale_popolazione", "popolazione_totale"])),
      age_0_14_pct: toNumber(pick(row, ["age_0_14_pct", "eta_0_14_pct", "pct_0_14"])),
      age_15_34_pct: toNumber(pick(row, ["age_15_34_pct", "eta_15_34_pct", "pct_15_34"])),
      age_35_64_pct: toNumber(pick(row, ["age_35_64_pct", "eta_35_64_pct", "pct_35_64"])),
      age_65_plus_pct: toNumber(pick(row, ["age_65_plus_pct", "eta_65_plus_pct", "eta_65_e_piu_pct", "pct_65_plus"])),
      foreigners_pct: toNumber(pick(row, ["foreigners_pct", "stranieri_pct", "pct_stranieri"])),
      employment_rate: toNumber(pick(row, ["employment_rate", "tasso_occupazione"])),
      average_income: toNumber(pick(row, ["average_income", "reddito_medio", "reddito_medio_imponibile"])),
      old_age_index: toNumber(pick(row, ["old_age_index", "indice_vecchiaia"])),
      businesses_total: toNumber(pick(row, ["businesses_total", "imprese", "totale_imprese"])),
      });
    }
  }
  return demographics;
}

function mergeDemographics(municipalities, demographics, report) {
  const demoRows = [];
  for (const municipality of municipalities) {
    const demo = demographics.get(municipality.municipality_code) || {};
    if (demo.households_total !== undefined) municipality.households_total = demo.households_total;
    if (demo.population_total) municipality.population_total = demo.population_total;
    if (municipality.population_total && municipality.area_km2) {
      municipality.density_per_km2 = municipality.population_total / municipality.area_km2;
    }
    demoRows.push({
      municipality_code: municipality.municipality_code,
      municipality_name: demo.municipality_name || municipality.municipality_name,
      age_0_14_pct: demo.age_0_14_pct ?? null,
      age_15_34_pct: demo.age_15_34_pct ?? null,
      age_35_64_pct: demo.age_35_64_pct ?? null,
      age_65_plus_pct: demo.age_65_plus_pct ?? null,
      foreigners_pct: demo.foreigners_pct ?? null,
      employment_rate: demo.employment_rate ?? null,
      average_income: demo.average_income ?? null,
      old_age_index: demo.old_age_index ?? null,
      businesses_total: demo.businesses_total ?? null,
    });
  }

  for (const field of ["households_total", "population_total", "area_km2", "density_per_km2"]) {
    const missing = municipalities.filter((row) => row[field] === null || row[field] === undefined).length;
    if (missing) report.missing_fields[field] = missing;
  }
  for (const field of ["age_0_14_pct", "age_15_34_pct", "age_35_64_pct", "age_65_plus_pct", "foreigners_pct"]) {
    const missing = demoRows.filter((row) => row[field] === null || row[field] === undefined).length;
    if (missing) report.missing_fields[field] = missing;
  }
  return demoRows;
}

async function postBatch(url, key, rows) {
  const res = await fetch(`${url}/rest/v1/rpc/upsert_istat_territorial_batch`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ rows }),
  });
  if (!res.ok) throw new Error(`Supabase import failed (${res.status}): ${await res.text()}`);
  return res.json();
}

async function validate(url, key) {
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const statusRes = await fetch(`${url}/rest/v1/rpc/territorial_dataset_status`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: "{}",
  });
  const examplesQuery = new URLSearchParams({
    select: "municipality_name,province_name,region_name,households_total,area_km2,density_per_km2",
    or: "(municipality_name.ilike.%Lecco%,municipality_name.ilike.%Como%,municipality_name.ilike.%Bergamo%,municipality_name.ilike.%Brescia%,municipality_name.ilike.%Varedo%,municipality_name.ilike.%Paderno%,municipality_name.ilike.%Cormano%,municipality_name.ilike.%Cusano%)",
  });
  const examplesRes = await fetch(`${url}/rest/v1/geo_municipalities?${examplesQuery}`, { headers });
  return {
    status: statusRes.ok ? await statusRes.json() : { error: await statusRes.text() },
    examples: examplesRes.ok ? await examplesRes.json() : { error: await examplesRes.text() },
  };
}

async function main() {
  const { scope, dryRun } = parseArgs();
  const env = { ...loadEnv(), ...process.env };
  const report = {
    import_scope: scope,
    source_files_used: [],
    rows_processed: 0,
    rows_inserted: 0,
    rows_updated: 0,
    skipped_rows: 0,
    missing_fields: {},
    validation_results: {},
  };

  ensureDirs();
  extractDownloads(report);

  const municipalities = await readBoundaries(scope, report);
  const demographics = readDemographics(scope, report);
  const demoRows = mergeDemographics(municipalities, demographics, report);
  report.rows_processed = municipalities.length;

  const processedGeo = path.join(processedDir, `geo_municipalities_${scope}.json`);
  const processedDemo = path.join(processedDir, `demographic_indicators_${scope}.json`);
  fs.writeFileSync(processedGeo, JSON.stringify(municipalities, null, 2), "utf8");
  fs.writeFileSync(processedDemo, JSON.stringify(demoRows, null, 2), "utf8");

  const byName = new Set(municipalities.map((row) => normalizeText(row.municipality_name)));
  report.validation_results.target_municipalities_present = TARGET_MUNICIPALITIES.filter((name) => byName.has(normalizeText(name)));
  report.validation_results.random_validation_examples_present = RANDOM_VALIDATION.filter((name) => byName.has(normalizeText(name)));

  if (!dryRun) {
    const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
    const key = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Missing VITE_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

    for (let i = 0; i < municipalities.length; i += 250) {
      const geoChunk = municipalities.slice(i, i + 250);
      const demoChunk = demoRows.slice(i, i + 250);
      const result = await postBatch(url, key, geoChunk.map((geo, idx) => ({ geo, demographic: demoChunk[idx] })));
      report.rows_inserted += Number(result.inserted || 0);
      report.rows_updated += Number(result.updated || 0);
      report.skipped_rows += Number(result.skipped || 0);
    }
    report.validation_results.supabase = await validate(url, key);
  }

  const reportPath = path.join(processedDir, `import_report_${scope}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ error: error.message }, null, 2));
  process.exit(1);
});
