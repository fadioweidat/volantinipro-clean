import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import AdmZip from "adm-zip";
import XLSX from "xlsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");
const processedDir = path.join(__dirname, "processed");

function parseArgs() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
      const [key, value = "true"] = arg.replace(/^--/, "").split("=");
      return [key, value];
    }),
  );
  return {
    file: args.file || process.env.OMI_SOURCE_FILE || null,
    source: args.source || process.env.OMI_SOURCE_LABEL || "Agenzia Entrate - OMI",
    dryRun: args["dry-run"] === "true" || process.env.OMI_DRY_RUN === "1",
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

function normalizeHeader(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_|_$/g, "")
    .toLowerCase();
}

function parseCsvLine(line, separator) {
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
}

function detectSemester(text) {
  const match = String(text || "").match(/Semestre\s+(\d{4})\s*\/\s*([12])/i);
  return match ? { year: Number(match[1]), semester: Number(match[2]), semester_label: `${match[1]}/${match[2]}` } : {};
}

function parseDelimitedText(text, { separator = null, skipRows = 0, headers = null } = {}) {
  const cleanText = String(text || "").replace(/^\uFEFF/, "");
  const allLines = cleanText.split(/\r?\n/).filter((line) => line.trim());
  if (!allLines.length) return { rows: [], headers: [], skipped: allLines.length, firstLine: "" };
  const sep = separator || ((allLines[0].match(/;/g) || []).length >= (allLines[0].match(/,/g) || []).length ? ";" : ",");
  const firstLine = allLines[0];
  const dataLines = allLines.slice(skipRows);
  if (!dataLines.length) return { rows: [], headers: [], skipped: allLines.length, firstLine };
  const parsedHeaders = headers || parseCsvLine(dataLines[0], sep).map(normalizeHeader);
  const rows = dataLines.slice(headers ? 0 : 1).map((line) => {
    const cols = parseCsvLine(line, sep);
    return Object.fromEntries(parsedHeaders.map((header, index) => [header, cols[index] ?? null]));
  });
  return { rows, headers: parsedHeaders, skipped: skipRows + (headers ? 0 : 1), firstLine };
}

function readDelimitedRows(file) {
  const text = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  return parseDelimitedText(text).rows;
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

function readGeoJsonRows(file) {
  const body = JSON.parse(fs.readFileSync(file, "utf8"));
  const features = body.type === "FeatureCollection" ? body.features || [] : [body];
  return features.map((feature) => {
    const properties = feature.properties || {};
    const normalized = {};
    for (const [key, value] of Object.entries(properties)) normalized[normalizeHeader(key)] = value;
    normalized.geometry_geojson = feature.geometry ? JSON.stringify(feature.geometry) : null;
    return normalized;
  });
}

function readRows(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".xlsx" || ext === ".xls") return readWorkbookRows(file);
  if (ext === ".geojson" || ext === ".json") return readGeoJsonRows(file);
  return readDelimitedRows(file);
}

const OFFICIAL_ZONE_HEADERS = [
  "area_territoriale",
  "regione",
  "prov",
  "comune_istat",
  "comune_cat",
  "sez",
  "comune_amm",
  "comune_descrizione",
  "fascia",
  "zona_descr",
  "zona",
  "linkzona",
  "cod_tip_prev",
  "descr_tip_prev",
  "stato_prev",
  "microzona",
];

function officialOmiEntries(zip) {
  const entries = zip.getEntries().filter((entry) => !entry.isDirectory);
  const byName = (pattern) => entries.find((entry) => pattern.test(path.basename(entry.entryName)));
  return {
    valori: byName(/_VALORI\.csv$/i),
    zone: byName(/_ZONE\.csv$/i),
    kml: byName(/\.kml$/i),
    names: entries.map((entry) => entry.entryName),
  };
}

function readZipText(entry) {
  return entry ? entry.getData().toString("latin1") : "";
}

function cleanOmiText(value) {
  return String(value ?? "").trim().replace(/^'|'$/g, "").trim();
}

function makeZoneKey(parts) {
  return [
    cleanOmiText(parts.linkzona),
    cleanOmiText(parts.zona),
    cleanOmiText(parts.sez),
    cleanOmiText(parts.comune_cat),
    cleanOmiText(parts.comune_istat),
  ].filter(Boolean).join("|").toLowerCase();
}

function zoneLookupFromRows(rows) {
  const lookup = new Map();
  for (const row of rows) {
    const value = {
      zone_name: cleanOmiText(row.zona_descr || row.zone_name),
      zone_code: cleanOmiText(row.linkzona || row.zona),
      omi_zone_code: cleanOmiText(row.zona),
      linkzona: cleanOmiText(row.linkzona),
      market_status: cleanOmiText(row.stato_prev),
      microzone: cleanOmiText(row.microzona),
      raw_zone: row,
    };
    const keys = [
      makeZoneKey(row),
      cleanOmiText(row.linkzona).toLowerCase(),
      cleanOmiText(row.zona).toLowerCase(),
      `${cleanOmiText(row.comune_amm)}|${cleanOmiText(row.zona)}`.toLowerCase(),
    ].filter(Boolean);
    for (const key of keys) lookup.set(key, value);
  }
  return lookup;
}

function extractTag(block, tag) {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? match[1].trim() : "";
}

function extractDataValue(block, name) {
  const re = new RegExp(`<Data\\s+name=["']${name}["'][^>]*>[\\s\\S]*?<value>([\\s\\S]*?)<\\/value>[\\s\\S]*?<\\/Data>`, "i");
  const match = block.match(re);
  return match ? cleanOmiText(match[1]) : "";
}

function coordinatesToRing(text) {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .map((coord) => {
      const [lng, lat] = coord.split(",").map(Number);
      return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null;
    })
    .filter(Boolean);
}

function parseKmlGeometries(text) {
  const lookup = new Map();
  if (!text) return { lookup, placemarks: 0, matchedGeometries: 0 };
  const placemarks = text.match(/<Placemark[\s\S]*?<\/Placemark>/gi) || [];
  for (const placemark of placemarks) {
    const codZona = extractDataValue(placemark, "CODZONA");
    const linkZona = extractDataValue(placemark, "LINKZONA");
    const codCom = extractDataValue(placemark, "CODCOM");
    const name = extractTag(placemark, "name");
    const coordBlocks = [...placemark.matchAll(/<coordinates>([\s\S]*?)<\/coordinates>/gi)].map((match) => coordinatesToRing(match[1])).filter((ring) => ring.length >= 4);
    if (!coordBlocks.length) continue;
    const geojson = {
      type: "MultiPolygon",
      coordinates: coordBlocks.map((ring) => [ring]),
    };
    const keys = [
      cleanOmiText(linkZona).toLowerCase(),
      cleanOmiText(codZona).toLowerCase(),
      `${cleanOmiText(codCom)}|${cleanOmiText(codZona)}`.toLowerCase(),
      name.match(/Zona OMI\s+([A-Z0-9]+)/i)?.[1]?.toLowerCase(),
    ].filter(Boolean);
    for (const key of keys) lookup.set(key, JSON.stringify(geojson));
  }
  return { lookup, placemarks: placemarks.length, matchedGeometries: lookup.size };
}

function findMetadataForValue(row, zoneLookup) {
  const keys = [
    makeZoneKey(row),
    cleanOmiText(row.linkzona).toLowerCase(),
    cleanOmiText(row.zona).toLowerCase(),
    `${cleanOmiText(row.comune_amm)}|${cleanOmiText(row.zona)}`.toLowerCase(),
  ].filter(Boolean);
  for (const key of keys) {
    const found = zoneLookup.get(key);
    if (found) return found;
  }
  return null;
}

function findGeometryForValue(row, geometryLookup) {
  const keys = [
    cleanOmiText(row.linkzona).toLowerCase(),
    cleanOmiText(row.zona).toLowerCase(),
    `${cleanOmiText(row.comune_amm)}|${cleanOmiText(row.zona)}`.toLowerCase(),
  ].filter(Boolean);
  for (const key of keys) {
    const found = geometryLookup.get(key);
    if (found) return found;
  }
  return null;
}

function pick(row, names) {
  for (const name of names) {
    if (row[name] !== undefined && row[name] !== null && row[name] !== "") return row[name];
  }
  return null;
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const clean = String(value).trim().replace(/\s+/g, "").replace(/\./g, "").replace(",", ".");
  if (!clean || !/^-?\d+(\.\d+)?$/.test(clean)) return null;
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : null;
}

function toInteger(value) {
  const n = toNumber(value);
  return n === null ? null : Math.trunc(n);
}

function mapOmiRow(row, source) {
  const municipalityName = pick(row, [
    "municipality_name",
    "comune",
    "denominazione_comune",
    "nome_comune",
    "comune_amm",
  ]);
  const minValue = toNumber(pick(row, ["min_value", "valore_minimo", "val_min", "quot_min", "min", "minimo"]));
  const maxValue = toNumber(pick(row, ["max_value", "valore_massimo", "val_max", "quot_max", "max", "massimo"]));
  if (!municipalityName || (minValue === null && maxValue === null)) return null;

  return {
    source,
    year: toInteger(pick(row, ["year", "anno", "anno_riferimento"])),
    semester: toInteger(pick(row, ["semester", "semestre"])),
    municipality_name: String(municipalityName).trim(),
    municipality_code: pick(row, ["municipality_code", "codice_comune", "cod_istat", "codice_istat", "pro_com"]),
    zone_code: pick(row, ["zone_code", "zona", "zona_omi", "cod_zona", "codice_zona"]),
    zone_name: pick(row, ["zone_name", "nome_zona", "descrizione_zona", "fascia"]),
    min_value: minValue,
    max_value: maxValue,
    typology: pick(row, ["typology", "tipologia", "destinazione", "tipo_immobile"]),
    geometry_geojson: pick(row, ["geometry_geojson", "geom_geojson", "geometry"]),
    raw: row,
  };
}

function mapOfficialValueRow(row, { source, semesterInfo, zoneLookup, geometryLookup }) {
  const saleMin = toNumber(row.compr_min);
  const saleMax = toNumber(row.compr_max);
  const rentMin = toNumber(row.loc_min);
  const rentMax = toNumber(row.loc_max);
  if (saleMin === null && saleMax === null && rentMin === null && rentMax === null) return null;

  const zoneMeta = findMetadataForValue(row, zoneLookup);
  const geometry = findGeometryForValue(row, geometryLookup);
  const municipalityName = cleanOmiText(row.comune_descrizione || row.comune_amm);
  if (!municipalityName) return null;

  return {
    source,
    year: semesterInfo.year,
    semester: semesterInfo.semester,
    semester_label: semesterInfo.semester_label,
    municipality_name: municipalityName,
    municipality_code: cleanOmiText(row.comune_istat),
    cadastral_code: cleanOmiText(row.comune_amm),
    province: cleanOmiText(row.prov),
    region: cleanOmiText(row.regione),
    municipality_category: cleanOmiText(row.comune_cat),
    zone_code: cleanOmiText(row.linkzona || row.zona),
    omi_zone_code: cleanOmiText(row.zona),
    zone_name: zoneMeta?.zone_name || cleanOmiText(row.zona),
    typology: cleanOmiText(row.descr_tipologia),
    market_status: cleanOmiText(row.stato),
    market_status_previous: cleanOmiText(row.stato_prev || zoneMeta?.market_status),
    sale_min: saleMin,
    sale_max: saleMax,
    rent_min: rentMin,
    rent_max: rentMax,
    min_value: saleMin ?? rentMin,
    max_value: saleMax ?? rentMax,
    geometry_geojson: geometry,
    raw: {
      value_row: row,
      zone_row: zoneMeta?.raw_zone || null,
      source_format: "agenzia_entrate_omi_zip",
    },
  };
}

function readOfficialOmiZip(file, source) {
  const zip = new AdmZip(file);
  const entries = officialOmiEntries(zip);
  if (!entries.valori) throw new Error("Official OMI ZIP does not contain a *_VALORI.csv file");

  const valoriText = readZipText(entries.valori);
  const zoneText = readZipText(entries.zone);
  const kmlText = entries.kml ? entries.kml.getData().toString("utf8") : "";
  const semesterInfo = detectSemester(valoriText.split(/\r?\n/)[0]) || {};
  const valoriParsed = parseDelimitedText(valoriText, { separator: ";", skipRows: 1 });

  let zoneParsed = { rows: [], headers: [], skipped: 0 };
  if (zoneText) {
    const rawLines = zoneText.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
    const secondLine = rawLines[1] || "";
    const hasHeader = /area_territoriale|comune_istat|linkzona|zona_descr/i.test(secondLine);
    zoneParsed = parseDelimitedText(zoneText, {
      separator: ";",
      skipRows: 1,
      headers: hasHeader ? null : OFFICIAL_ZONE_HEADERS,
    });
  }

  const zoneLookup = zoneLookupFromRows(zoneParsed.rows);
  const kml = parseKmlGeometries(kmlText);
  const prepared = [];
  let skipped = 0;

  for (const row of valoriParsed.rows) {
    const mapped = mapOfficialValueRow(row, {
      source,
      semesterInfo,
      zoneLookup,
      geometryLookup: kml.lookup,
    });
    if (mapped) prepared.push(mapped);
    else skipped += 1;
  }

  return {
    rows: prepared,
    report: {
      detected_valori_file: entries.valori.entryName,
      detected_zone_file: entries.zone?.entryName || null,
      detected_kml_file: entries.kml?.entryName || null,
      zip_entries: entries.names,
      semester: semesterInfo.semester_label || null,
      kml_present: Boolean(entries.kml),
      valori_rows_read: valoriParsed.rows.length,
      zone_rows_read: zoneParsed.rows.length,
      kml_placemarks: kml.placemarks,
      kml_geometry_keys: kml.matchedGeometries,
      rows_with_geometry: prepared.filter((row) => Boolean(row.geometry_geojson)).length,
      rows_skipped: skipped,
      geometry_status: !entries.kml
        ? "No KML file present in ZIP; rows prepared with null geometry."
        : kml.matchedGeometries > 0
        ? "KML parsed and matched by OMI zone code where available."
        : "KML geometry not matched; rows prepared without geometry.",
    },
  };
}

function resolveInputFile(requestedFile) {
  const resolved = path.resolve(rootDir, requestedFile);
  if (fs.existsSync(resolved)) return resolved;

  const dir = path.dirname(resolved);
  const requestedName = path.basename(resolved).toLowerCase();
  if (!fs.existsSync(dir)) throw new Error(`OMI source file not found: ${resolved}`);

  const zipCandidates = fs.readdirSync(dir).filter((name) => name.toLowerCase().endsWith(".zip"));
  const requestedStem = requestedName.replace(/\.zip$/i, "");
  const prefixMatch = zipCandidates.find((name) => {
    const stem = name.toLowerCase().replace(/\.zip$/i, "");
    return requestedStem.startsWith(stem) || stem.startsWith(requestedStem.slice(0, Math.min(24, requestedStem.length)));
  });
  if (prefixMatch) return path.join(dir, prefixMatch);
  if (zipCandidates.length === 1) return path.join(dir, zipCandidates[0]);

  throw new Error(`OMI source file not found: ${resolved}`);
}

async function postBatch(url, key, rows) {
  const res = await fetch(`${url}/rest/v1/rpc/upsert_omi_zones_batch`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ rows }),
  });
  if (!res.ok) throw new Error(`Supabase OMI import failed (${res.status}): ${await res.text()}`);
  return res.json();
}

async function main() {
  fs.mkdirSync(processedDir, { recursive: true });
  const options = parseArgs();
  if (!options.file) throw new Error("Provide --file=path/to/official-omi.csv|xlsx|geojson");
  const requestedFile = path.resolve(rootDir, options.file);
  const file = resolveInputFile(options.file);

  const ext = path.extname(file).toLowerCase();
  const loaded = ext === ".zip"
    ? readOfficialOmiZip(file, options.source)
    : { rows: readRows(file).map((row) => mapOmiRow(row, options.source)).filter(Boolean), report: {} };
  const rows = loaded.rows;
  const distinctProvinces = new Set(rows.map((row) => row.province).filter(Boolean));
  const distinctMunicipalities = new Set(rows.map((row) => `${row.province || ""}|${row.municipality_code || ""}|${row.municipality_name || ""}`).filter(Boolean));
  const report = {
    requested_file: path.basename(requestedFile),
    source_file: path.basename(file),
    source_label: options.source,
    dry_run: options.dryRun,
    ...loaded.report,
    rows_read: loaded.report?.valori_rows_read ?? rows.length,
    rows_prepared: rows.length,
    rows_skipped: loaded.report?.rows_skipped ?? 0,
    rows_with_geometry: rows.filter((row) => Boolean(row.geometry_geojson)).length,
    distinct_province_count: distinctProvinces.size,
    distinct_municipality_count: distinctMunicipalities.size,
    rows_upserted: 0,
    sample_prepared_row: rows[0] || null,
  };

  fs.writeFileSync(path.join(processedDir, "omi_zones_import_preview.json"), JSON.stringify(rows.slice(0, 50), null, 2), "utf8");

  if (!options.dryRun && rows.length > 0) {
    const env = { ...loadEnv(), ...process.env };
    const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
    const key = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Missing VITE_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    for (let i = 0; i < rows.length; i += 500) {
      const result = await postBatch(url, key, rows.slice(i, i + 500));
      report.rows_upserted += Number(result || 0);
    }
  }

  fs.writeFileSync(path.join(processedDir, "omi_import_report.json"), JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
