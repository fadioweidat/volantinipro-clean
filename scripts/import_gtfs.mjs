import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import AdmZip from "adm-zip";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const processedDir = path.join(rootDir, "data", "gtfs", "processed");

function parseArgs() {
  const values = Object.fromEntries(process.argv.slice(2).map((arg) => {
    const [key, value = "true"] = arg.replace(/^--/, "").split("=");
    return [key, value];
  }));
  return { file: values.file || process.env.GTFS_SOURCE_FILE || null, source: values.source || process.env.GTFS_SOURCE_LABEL || "GTFS / Trasporto pubblico", dryRun: values["dry-run"] === "true" || process.env.GTFS_DRY_RUN === "1" };
}

function loadEnv() {
  const envPath = path.join(rootDir, ".env");
  if (!fs.existsSync(envPath)) return {};
  return Object.fromEntries(fs.readFileSync(envPath, "utf8").split(/\r?\n/).filter((line) => line && !line.trim().startsWith("#") && line.includes("=")).map((line) => {
    const index = line.indexOf("=");
    return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
  }));
}

export function parseCsv(text) {
  const rows = [];
  let row = [], value = "", quoted = false;
  const input = String(text || "").replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (char === '"' && quoted && input[i + 1] === '"') { value += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(value); value = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && input[i + 1] === "\n") i += 1;
      row.push(value);
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = []; value = "";
    } else value += char;
  }
  if (value || row.length) { row.push(value); if (row.some((cell) => cell !== "")) rows.push(row); }
  if (!rows.length) return [];
  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1).map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""])));
}

function readEntry(zip, name, required = true) {
  const entry = zip.getEntries().find((item) => path.basename(item.entryName).toLowerCase() === name.toLowerCase());
  if (!entry && required) throw new Error(`GTFS file missing: ${name}`);
  return entry ? parseCsv(entry.getData().toString("utf8")) : [];
}

export function prepareGtfs(file, source) {
  const zip = new AdmZip(file);
  const agencies = readEntry(zip, "agency.txt", false);
  const agencyName = agencies[0]?.agency_name || null;
  const stops = readEntry(zip, "stops.txt").filter((row) => row.stop_id && row.stop_name && row.stop_lat && row.stop_lon).map((row) => ({ source, agency: agencyName, ...row }));
  const routes = readEntry(zip, "routes.txt").filter((row) => row.route_id).map((row) => ({ source, agency: agencyName, ...row }));
  const trips = readEntry(zip, "trips.txt").filter((row) => row.trip_id && row.route_id);
  const tripRoutes = new Map(trips.map((row) => [row.trip_id, row.route_id]));
  const stopTimes = readEntry(zip, "stop_times.txt").filter((row) => row.trip_id && row.stop_id).map((row) => ({ source, route_id: tripRoutes.get(row.trip_id) || null, ...row }));
  return { agencyName, stops, routes, trips, stopTimes };
}

async function postBatch(url, key, rpc, rows) {
  const response = await fetch(`${url}/rest/v1/rpc/${rpc}`, { method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ rows }) });
  if (!response.ok) throw new Error(`${rpc} failed (${response.status}): ${await response.text()}`);
  return Number(await response.json()) || 0;
}

async function importRows(url, key, rpc, rows, batchSize = 500) {
  let imported = 0;
  for (let offset = 0; offset < rows.length; offset += batchSize) imported += await postBatch(url, key, rpc, rows.slice(offset, offset + batchSize));
  return imported;
}

async function main() {
  const options = parseArgs();
  if (!options.file) throw new Error("Provide --file=path/to/gtfs.zip");
  const file = path.resolve(rootDir, options.file);
  if (!fs.existsSync(file)) throw new Error(`GTFS source file not found: ${file}`);
  const data = prepareGtfs(file, options.source);
  const report = { source_file: path.basename(file), source_label: options.source, agency: data.agencyName, dry_run: options.dryRun, stops_read: data.stops.length, routes_read: data.routes.length, trips_read: data.trips.length, stop_times_read: data.stopTimes.length, stops_imported: 0, routes_imported: 0, stop_times_imported: 0 };
  if (!options.dryRun) {
    const env = { ...loadEnv(), ...process.env };
    const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
    const key = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Missing local Supabase URL or service role key");
    report.stops_imported = await importRows(url, key, "upsert_gtfs_stops_batch", data.stops);
    report.routes_imported = await importRows(url, key, "upsert_gtfs_routes_batch", data.routes);
    report.stop_times_imported = await importRows(url, key, "upsert_gtfs_stop_times_batch", data.stopTimes, 1000);
  }
  fs.mkdirSync(processedDir, { recursive: true });
  fs.writeFileSync(path.join(processedDir, "gtfs_import_report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

if (pathToFileURL(process.argv[1] || "").href === import.meta.url) main().catch((error) => { console.error(error.message); process.exit(1); });
